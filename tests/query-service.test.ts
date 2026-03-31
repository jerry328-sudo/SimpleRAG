import { describe, it, expect } from "vitest";
import { Database } from "../src/storage/db";
import { QueryService } from "../src/search/query-service";
import { DEFAULT_SETTINGS } from "../src/settings/types";
import type { EmbeddingProvider } from "../src/providers/types";
import { createMockApp } from "./helpers";

describe("QueryService", () => {
	it("only searches embeddings for the active provider/model and text mode", async () => {
		const { app } = createMockApp();
		const db = new Database(app, "storage/test.json");

		db.upsertChunk({
			chunk_id: "notes/a.md#0",
			note_path: "notes/a.md",
			chunk_index: 0,
			heading_path_json: "[]",
			heading_path_text: "",
			text: "matching note chunk",
			text_for_embedding: "matching note chunk",
			char_start: 0,
			char_end: 10,
			token_estimate: 3,
		});

		db.upsertAsset({
			asset_path: "assets/image.png",
			mime_type: "image/png",
			reference_count: 1,
			indexed_at_ms: 1,
		});

		db.upsertMention({
			mention_id: "m1",
			asset_path: "assets/image.png",
			note_path: "notes/a.md",
			mention_index: 0,
			heading_path_json: "[]",
			heading_path_text: "",
			raw_target: "assets/image.png",
			link_kind: "wikilink",
			surrounding_text: "image mention",
			near_chunk_id: null,
		});

		db.upsertEmbedding({
			owner_id: "notes/a.md#0",
			owner_type: "note_chunk",
			provider_id: "active-provider",
			model_id: "active-model",
			modality: "text",
			dimension: 3,
			vector: [1, 0, 0],
			created_at_ms: 1,
		});

		db.upsertEmbedding({
			owner_id: "assets/image.png",
			owner_type: "asset",
			provider_id: "active-provider",
			model_id: "active-model",
			modality: "image",
			dimension: 3,
			vector: [1, 0, 0],
			created_at_ms: 1,
		});

		db.upsertEmbedding({
			owner_id: "stale#0",
			owner_type: "note_chunk",
			provider_id: "old-provider",
			model_id: "old-model",
			modality: "text",
			dimension: 3,
			vector: [1, 0, 0],
			created_at_ms: 1,
		});

		const embeddingProvider: EmbeddingProvider = {
			capability: {
				providerId: "active-provider",
				modelId: "active-model",
				supportsText: true,
				supportsImage: false,
				supportsCrossModal: false,
				dimension: 3,
				maxInputTokens: 8192,
			},
			async embed() {
				return {
					dimension: 3,
					vectors: [[1, 0, 0]],
				};
			},
		};

		const settings = {
			...DEFAULT_SETTINGS,
			embeddingProvider: "active-provider",
			embeddingModel: "active-model",
			enableImageEmbedding: false,
			enableRerank: false,
		};

		const service = new QueryService(
			db,
			settings,
			embeddingProvider,
			null
		);

		const results = await service.search("query");

		expect(results).toHaveLength(1);
		expect(results[0]?.type).toBe("note");
		expect(results[0]?.notePath).toBe("notes/a.md");
	});
});
