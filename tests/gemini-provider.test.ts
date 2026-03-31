import { afterEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { ProviderRegistry } from "../src/providers/registry";
import { GeminiEmbeddingProvider } from "../src/providers/embedding/gemini";
import { GeminiChatProvider } from "../src/providers/chat/gemini";
import { DEFAULT_SETTINGS } from "../src/settings/types";

describe("Gemini provider support", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("registers Gemini for embedding and chat and validates multimodal image mode", () => {
		const registry = new ProviderRegistry();

		expect(
			registry.listEmbeddingProviders().some((provider) => provider.id === "gemini")
		).toBe(true);
		expect(
			registry.listChatProviders().some((provider) => provider.id === "gemini")
		).toBe(true);

		const errors = registry.validateSettings({
			...DEFAULT_SETTINGS,
			embeddingProvider: "gemini",
			embeddingModel: "gemini-embedding-001",
			enableImageEmbedding: true,
		});

		expect(errors[0]).toContain("gemini-embedding-2-preview");
	});

	it("creates Gemini embedding and chat providers from the registry", () => {
		const registry = new ProviderRegistry();

		const embeddingProvider = registry.createEmbeddingProvider({
			...DEFAULT_SETTINGS,
			embeddingProvider: "gemini",
			embeddingModel: "gemini-embedding-001",
			embeddingBaseUrl: "",
			embeddingApiToken: "gemini-key",
		});

		const chatProvider = registry.createChatProvider({
			...DEFAULT_SETTINGS,
			chatProvider: "gemini",
			chatModel: "gemini-2.5-flash",
			chatBaseUrl: "",
			chatApiToken: "gemini-key",
		});

		expect(embeddingProvider).toBeInstanceOf(GeminiEmbeddingProvider);
		expect(embeddingProvider.capability.providerId).toBe("gemini");
		expect(embeddingProvider.capability.supportsImage).toBe(false);

		expect(chatProvider).toBeInstanceOf(GeminiChatProvider);
		expect(chatProvider.capability.providerId).toBe("gemini");
		expect(chatProvider.capability.supportsVisionInput).toBe(true);
	});

	it("sends Gemini batch embedding requests with inline image parts", async () => {
		const requestSpy = vi.spyOn(obsidian, "requestUrl").mockResolvedValue({
			status: 200,
			json: {
				embeddings: [{ values: [1, 0] }, { values: [0, 1] }],
			},
			text: "",
		} as any);

		const provider = new GeminiEmbeddingProvider(
			"",
			"gemini-key",
			"gemini-embedding-2-preview",
			30000,
			0
		);

		const response = await provider.embed({
			texts: ["alpha"],
			images: ["data:image/jpeg;base64,QUJDRA=="],
		});

		expect(response.dimension).toBe(2);
		expect(response.vectors).toEqual([
			[1, 0],
			[0, 1],
		]);

		expect(requestSpy).toHaveBeenCalledTimes(1);
		const request = requestSpy.mock.calls[0]?.[0] as any;
		expect(request.url).toBe(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:batchEmbedContents"
		);
		expect(request.headers["x-goog-api-key"]).toBe("gemini-key");

		const body = JSON.parse(request.body);
		expect(body.requests).toHaveLength(2);
		expect(body.requests[0].content.parts[0].text).toBe("alpha");
		expect(body.requests[1].content.parts[0].inline_data.mime_type).toBe(
			"image/jpeg"
		);
		expect(body.requests[1].content.parts[0].inline_data.data).toBe(
			"QUJDRA=="
		);
	});

	it("maps chat messages to Gemini generateContent requests", async () => {
		const requestSpy = vi.spyOn(obsidian, "requestUrl").mockResolvedValue({
			status: 200,
			json: {
				candidates: [
					{
						content: {
							parts: [{ text: "这是回答" }],
						},
					},
				],
			},
			text: "",
		} as any);

		const provider = new GeminiChatProvider(
			"",
			"gemini-key",
			"gemini-2.5-flash",
			30000,
			0
		);

		const response = await provider.chat({
			messages: [
				{
					role: "system",
					content: "Only answer with cited evidence.",
				},
				{
					role: "user",
					content: [
						{ type: "text", text: "Describe this image." },
						{
							type: "image_url",
							image_url: {
								url: "data:image/png;base64,QUJDRA==",
							},
						},
					],
				},
				{
					role: "assistant",
					content: "Previous answer",
				},
				{
					role: "user",
					content: "Follow up",
				},
			],
		});

		expect(response.content).toBe("这是回答");
		expect(requestSpy).toHaveBeenCalledTimes(1);
		const request = requestSpy.mock.calls[0]?.[0] as any;
		expect(request.url).toBe(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
		);
		expect(request.headers["x-goog-api-key"]).toBe("gemini-key");

		const body = JSON.parse(request.body);
		expect(body.system_instruction.parts[0].text).toContain(
			"Only answer with cited evidence."
		);
		expect(body.contents[0].role).toBe("user");
		expect(body.contents[0].parts[0].text).toBe("Describe this image.");
		expect(body.contents[0].parts[1].inline_data.mime_type).toBe("image/png");
		expect(body.contents[1].role).toBe("model");
		expect(body.contents[1].parts[0].text).toBe("Previous answer");
		expect(body.contents[2].parts[0].text).toBe("Follow up");
	});

	it("accepts a Cloudflare Gateway base URL without requiring manual /v1beta", async () => {
		const requestSpy = vi.spyOn(obsidian, "requestUrl").mockResolvedValue({
			status: 200,
			json: {
				candidates: [
					{
						content: {
							parts: [{ text: "ok" }],
						},
					},
				],
			},
			text: "",
		} as any);

		const provider = new GeminiChatProvider(
			"https://gateway.ai.cloudflare.com/v1/00000000000000000000000000000000/proxy/google-ai-studio",
			"gemini-key",
			"gemini-2.5-flash",
			30000,
			0
		);

		await provider.chat({
			messages: [{ role: "user", content: "What is Cloudflare?" }],
		});

		const request = requestSpy.mock.calls[0]?.[0] as any;
		expect(request.url).toBe(
			"https://gateway.ai.cloudflare.com/v1/00000000000000000000000000000000/proxy/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent"
		);
	});

	it("parses Gemini streaming responses into deltas", async () => {
		const streamText = [
			'data: {"candidates":[{"content":{"parts":[{"text":"你"}]}}]}',
			"",
			'data: {"candidates":[{"content":{"parts":[{"text":"好"}]}}]}',
			"",
		].join("\n");

		const fetchMock = vi.fn().mockResolvedValue(
			new Response(streamText, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			})
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiChatProvider(
			"",
			"gemini-key",
			"gemini-2.5-flash",
			30000,
			0
		);

		const events: Array<{ delta: string; done: boolean }> = [];
		await provider.chatStream!(
			{
				messages: [{ role: "user", content: "你好" }],
				stream: true,
			},
			(event) => {
				events.push(event);
			}
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(events).toEqual([
			{ delta: "你", done: false },
			{ delta: "好", done: false },
			{ delta: "", done: true },
		]);
	});
});
