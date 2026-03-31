import { requestUrl } from "obsidian";
import type {
	ChatProvider,
	ChatCapability,
	ChatRequest,
	ChatResponse,
	ChatStreamEvent,
} from "../types";

export class OpenAICompatibleChatProvider implements ChatProvider {
	readonly capability: ChatCapability;
	private baseUrl: string;
	private apiToken: string;
	private timeout: number;

	constructor(
		baseUrl: string,
		apiToken: string,
		modelId: string,
		timeout: number
	) {
		this.baseUrl = baseUrl.replace(/\/+$/, "");
		this.apiToken = apiToken;
		this.timeout = timeout;
		this.capability = {
			providerId: "openai-compatible",
			modelId,
			supportsStreaming: true,
			supportsSystemPrompt: true,
			supportsVisionInput: false,
			maxContextTokens: 128000,
		};
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const body = {
			model: this.capability.modelId,
			messages: request.messages,
			stream: false,
		};

		const response = await requestUrl({
			url: `${this.baseUrl}/chat/completions`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiToken}`,
			},
			body: JSON.stringify(body),
			throw: false,
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
			messages: request.messages,
			stream: true,
		};

		// Use fetch for streaming (requestUrl doesn't support streaming)
		const response = await fetch(`${this.baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiToken}`,
			},
			body: JSON.stringify(body),
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
}
