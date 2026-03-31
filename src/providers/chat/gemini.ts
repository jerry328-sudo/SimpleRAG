import type {
	ChatCapability,
	ChatContentPart,
	ChatMessage,
	ChatProvider,
	ChatRequest,
	ChatResponse,
	ChatStreamEvent,
} from "../types";
import { fetchWithRetry, requestWithRetry } from "../request";
import {
	buildGeminiInlineDataPart,
	extractGeminiBlockReason,
	extractGeminiText,
	normalizeGeminiBaseUrl,
	normalizeGeminiModelPath,
} from "../gemini";

type GeminiContent = {
	role: "user" | "model";
	parts: Array<Record<string, unknown>>;
};

export class GeminiChatProvider implements ChatProvider {
	readonly capability: ChatCapability;
	private baseUrl: string;
	private apiToken: string;
	private timeout: number;
	private retryCount: number;

	constructor(
		baseUrl: string,
		apiToken: string,
		modelId: string,
		timeout: number,
		retryCount: number
	) {
		this.baseUrl = normalizeGeminiBaseUrl(baseUrl);
		this.apiToken = apiToken;
		this.timeout = timeout;
		this.retryCount = retryCount;
		this.capability = {
			providerId: "gemini",
			modelId,
			supportsStreaming: true,
			supportsSystemPrompt: true,
			supportsVisionInput: true,
			maxContextTokens: 1048576,
		};
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const response = await requestWithRetry({
			url: `${this.baseUrl}/${normalizeGeminiModelPath(this.capability.modelId)}:generateContent`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": this.apiToken,
			},
			body: JSON.stringify(this.buildRequestBody(request.messages)),
			timeoutMs: this.timeout,
			retryCount: this.retryCount,
			requestLabel: "Gemini chat request",
		});

		if (response.status !== 200) {
			throw new Error(
				`Gemini chat API error ${response.status}: ${response.text}`
			);
		}

		const content = extractGeminiText(response.json);
		if (!content) {
			const blockReason = extractGeminiBlockReason(response.json);
			throw new Error(
				blockReason
					? `Gemini chat returned no text output (${blockReason}).`
					: "Gemini chat returned no text output."
			);
		}

		return { content };
	}

	async chatStream(
		request: ChatRequest,
		onEvent: (event: ChatStreamEvent) => void
	): Promise<void> {
		const response = await fetchWithRetry({
			url: `${this.baseUrl}/${normalizeGeminiModelPath(this.capability.modelId)}:streamGenerateContent?alt=sse`,
			init: {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": this.apiToken,
				},
				body: JSON.stringify(this.buildRequestBody(request.messages)),
			},
			timeoutMs: this.timeout,
			retryCount: this.retryCount,
			requestLabel: "Gemini streaming chat request",
		});

		if (!response.ok) {
			throw new Error(
				`Gemini chat API error ${response.status}: ${await response.text()}`
			);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error("No response body for Gemini streaming");
		}

		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed.startsWith("data: ")) {
					continue;
				}

				const payload = trimmed.slice(6).trim();
				if (!payload) {
					continue;
				}

				try {
					const parsed = JSON.parse(payload);
					const delta = extractGeminiText(parsed);
					if (delta) {
						onEvent({ delta, done: false });
					}
				} catch {
					// Ignore malformed SSE payloads.
				}
			}
		}

		onEvent({ delta: "", done: true });
	}

	private buildRequestBody(messages: ChatMessage[]) {
		const systemTexts: string[] = [];
		const contents: GeminiContent[] = [];

		for (const message of messages) {
			if (message.role === "system") {
				systemTexts.push(this.toPlainText(message.content));
				continue;
			}

			const role = message.role === "assistant" ? "model" : "user";
			const parts = this.toGeminiParts(message.content);
			if (parts.length === 0) {
				continue;
			}
			contents.push({ role, parts });
		}

		const body: Record<string, unknown> = { contents };
		const systemInstruction = systemTexts
			.map((text) => text.trim())
			.filter(Boolean)
			.join("\n\n");
		if (systemInstruction) {
			body.system_instruction = {
				parts: [{ text: systemInstruction }],
			};
		}

		return body;
	}

	private toPlainText(content: string | ChatContentPart[]): string {
		if (typeof content === "string") {
			return content;
		}

		return content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
	}

	private toGeminiParts(
		content: string | ChatContentPart[]
	): Array<Record<string, unknown>> {
		if (typeof content === "string") {
			return [{ text: content }];
		}

		return content.map((part) => this.toGeminiPart(part));
	}

	private toGeminiPart(part: ChatContentPart): Record<string, unknown> {
		if (part.type === "text") {
			return { text: part.text };
		}

		return buildGeminiInlineDataPart(part.image);
	}
}
