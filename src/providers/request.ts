import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian";

interface RequestWithRetryOptions
	extends Omit<RequestUrlParam, "throw"> {
	timeoutMs: number;
	retryCount: number;
	requestLabel: string;
}

interface FetchWithRetryOptions {
	url: string;
	init: RequestInit;
	timeoutMs: number;
	retryCount: number;
	requestLabel: string;
}

export async function requestWithRetry(
	options: RequestWithRetryOptions
): Promise<RequestUrlResponse> {
	const {
		timeoutMs,
		retryCount,
		requestLabel,
		...requestOptions
	} = options;

	return retryWithPolicy(retryCount, requestLabel, async () => {
		const response = await withTimeout(
			requestUrl({
				...requestOptions,
				throw: false,
			}),
			timeoutMs,
			requestLabel
		);

		if (response.status >= 500 || response.status === 429) {
			throw new RetryableHttpError(
				`${requestLabel} failed with status ${response.status}`,
				response.status
			);
		}

		return response;
	});
}

export async function fetchWithRetry(
	options: FetchWithRetryOptions
): Promise<Response> {
	return retryWithPolicy(options.retryCount, options.requestLabel, async () => {
		const controller = new AbortController();
		const timeoutId = globalThis.setTimeout(
			() => controller.abort(`${options.requestLabel} timed out after ${options.timeoutMs}ms`),
			options.timeoutMs
		);

		try {
			const response = await fetch(options.url, {
				...options.init,
				signal: controller.signal,
			});

			if (response.status >= 500 || response.status === 429) {
				throw new RetryableHttpError(
					`${options.requestLabel} failed with status ${response.status}`,
					response.status
				);
			}

			return response;
		} finally {
			globalThis.clearTimeout(timeoutId);
		}
	});
}

async function retryWithPolicy<T>(
	retryCount: number,
	requestLabel: string,
	fn: () => Promise<T>
): Promise<T> {
	let attempt = 0;
	let lastError: unknown;

	while (attempt <= retryCount) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isRetryableError(error) || attempt === retryCount) {
				throw normalizeError(error, requestLabel);
			}
			await delay(getBackoffMs(attempt));
			attempt += 1;
		}
	}

	throw normalizeError(lastError, requestLabel);
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	requestLabel: string
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timeoutId = globalThis.setTimeout(() => {
			reject(new Error(`${requestLabel} timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		promise
			.then((value) => {
				globalThis.clearTimeout(timeoutId);
				resolve(value);
			})
			.catch((error) => {
				globalThis.clearTimeout(timeoutId);
				reject(error);
			});
	});
}

function isRetryableError(error: unknown): boolean {
	if (error instanceof RetryableHttpError) {
		return true;
	}

	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return (
		message.includes("timed out") ||
		message.includes("network") ||
		message.includes("abort")
	);
}

function normalizeError(error: unknown, requestLabel: string): Error {
	if (error instanceof Error) {
		return error;
	}
	return new Error(`${requestLabel} failed: ${String(error)}`);
}

function getBackoffMs(attempt: number): number {
	return Math.min(2000, 250 * 2 ** attempt);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

class RetryableHttpError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "RetryableHttpError";
		this.status = status;
	}
}
