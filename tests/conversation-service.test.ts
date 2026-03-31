import { describe, it, expect } from "vitest";
import { Database } from "../src/storage/db";
import { ConversationService } from "../src/chat/conversation-service";
import { DEFAULT_SETTINGS } from "../src/settings/types";
import type { ChatProvider } from "../src/providers/types";
import type { SearchResult } from "../src/types/domain";
import { createMockApp } from "./helpers";

describe("ConversationService", () => {
	it("includes image results in chat context and references", async () => {
		const { app } = createMockApp({
			"assets/diagram.png": {
				binary: new Uint8Array([1, 2, 3, 4]),
			},
		});
		const db = new Database(app, "storage/test.json");

		db.upsertAsset({
			asset_path: "assets/diagram.png",
			mime_type: "image/png",
			reference_count: 1,
			indexed_at_ms: 1,
		});

		db.upsertMention({
			mention_id: "img-1",
			asset_path: "assets/diagram.png",
			note_path: "notes/design.md",
			mention_index: 0,
			heading_path_json: "[]",
			heading_path_text: "Architecture",
			raw_target: "assets/diagram.png",
			link_kind: "wikilink",
			surrounding_text: "This diagram shows the search architecture.",
			near_chunk_id: null,
		});

		let capturedPrompt = "";
		let capturedMessages: any[] = [];
		const chatProvider: ChatProvider = {
			capability: {
				providerId: "chat-provider",
				modelId: "chat-model",
				supportsStreaming: false,
				supportsSystemPrompt: true,
				supportsVisionInput: true,
				maxContextTokens: 8192,
			},
			async chat(request) {
				capturedMessages = request.messages;
				const userMessage = request.messages.find(
					(message) => message.role === "user"
				);
				capturedPrompt = Array.isArray(userMessage?.content)
					? userMessage.content
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join("\n")
					: userMessage?.content ?? "";
				return {
					content: "answer",
				};
			},
		};

		const service = new ConversationService(
			app,
			db,
			DEFAULT_SETTINGS,
			chatProvider
		);

		const results: SearchResult[] = [
			{
				type: "image",
				score: 0.9,
				asset: db.getAsset("assets/diagram.png"),
				mentions: db.getMentionsByAsset("assets/diagram.png"),
				notePath: "notes/design.md",
				headingPath: "Architecture",
				snippet: "Image: assets/diagram.png",
			},
		];

		const response = await service.chat(
			"这张图讲了什么？",
			results,
			[]
		);

		expect(capturedPrompt).toContain("assets/diagram.png");
		expect(capturedPrompt).toContain("notes/design.md");
		const visionMessage = capturedMessages.find(
			(message) => message.role === "user" && Array.isArray(message.content)
		);
		expect(Array.isArray(visionMessage?.content)).toBe(true);
		expect(
			visionMessage?.content.some((part: any) => part.type === "image")
		).toBe(true);
		expect(response.references).toHaveLength(1);
		expect(response.references[0]?.type).toBe("image");
		expect(response.references[0]?.path).toBe("assets/diagram.png");
	});
});
