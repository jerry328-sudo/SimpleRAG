import type {
	ChatProvider,
	ChatCapability,
	ChatRequest,
	ChatResponse,
	ChatStreamEvent,
	ChatMessage,
	ChatContentPart,
} from "../types";
import { fetchWithRetry, requestWithRetry } from "../request";
import { imagePayloadToDataUrl } from "../../utils/base64";

export class OpenAICompatibleChatProvider implements ChatProvider {
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
		this.baseUrl = baseUrl.replace(/\/+$/, "");
		this.apiToken = apiToken;
		this.timeout = timeout;
		this.retryCount = retryCount;
		this.capability = {
			providerId: "openai-compatible",
			modelId,
			supportsStreaming: true,
			supportsSystemPrompt: true,
			supportsVisionInput: true,
			maxContextTokens: 128000,
		};
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const body = {
			model: this.capability.modelId,
			messages: this.toOpenAIMessages(request.messages),
			stream: false,
		};

		const response = await requestWithRetry({
			url: `${this.baseUrl}/chat/completions`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiToken}`,
			},
			body: JSON.stringify(body),
			timeoutMs: this.timeout,
			retryCount: this.retryCount,
			requestLabel: "Chat request",
		});

		if (response.status !== 200) {
			throw new Error(
				`Chat API error ${response.status}: ${response.text}`
			);
		}

		const data = response.json as {
			choices: Array<{ message: { content: string } }>;
		};

		return { content: data.choices[0]?.message?.content ?? "" };
	}

	async chatStream(
		request: ChatRequest,
		onEvent: (event: ChatStreamEvent) => void
	): Promise<void> {
		const body = {
			model: this.capability.modelId,
			messages: this.toOpenAIMessages(request.messages),
			stream: true,
		};

		// Use fetch for streaming (requestUrl doesn't support streaming)
		const response = await fetchWithRetry({
			url: `${this.baseUrl}/chat/completions`,
			init: {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiToken}`,
				},
				body: JSON.stringify(body),
			},
			timeoutMs: this.timeout,
			retryCount: this.retryCount,
			requestLabel: "Streaming chat request",
		});

		if (!response.ok) {
			throw new Error(
				`Chat API error ${response.status}: ${await response.text()}`
			);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error("No response body for streaming");
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
				if (!trimmed.startsWith("data: ")) continue;
				const payload = trimmed.slice(6);
				if (payload === "[DONE]") {
					onEvent({ delta: "", done: true });
					return;
				}
				try {
					const parsed = JSON.parse(payload) as {
						choices: Array<{
							delta: { content?: string };
							finish_reason: string | null;
						}>;
					};
					const delta =
						parsed.choices[0]?.delta?.content ?? "";
					const finished =
						parsed.choices[0]?.finish_reason === "stop";
					if (delta || finished) {
						onEvent({ delta, done: finished });
					}
				} catch {
					// Skip malformed SSE lines
				}
			}
		}

		onEvent({ delta: "", done: true });
	}

	private toOpenAIMessages(messages: ChatMessage[]) {
		return messages.map((message) => ({
			...message,
			content: this.toOpenAIContent(message.content),
		}));
	}

	private toOpenAIContent(
		content: string | ChatContentPart[]
	): string | Array<Record<string, unknown>> {
		if (typeof content === "string") {
			return content;
		}

		return content.map((part) => this.toOpenAIPart(part));
	}

	private toOpenAIPart(part: ChatContentPart): Record<string, unknown> {
		if (part.type === "text") {
			return { type: "text", text: part.text };
		}

		return {
			type: "image_url",
			image_url: {
				url: imagePayloadToDataUrl(part.image),
			},
		};
	}
}
