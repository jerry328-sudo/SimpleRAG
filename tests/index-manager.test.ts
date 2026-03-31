import { describe, it, expect } from "vitest";
import { Database } from "../src/storage/db";
import { IndexManager } from "../src/indexing/index-manager";
import { DEFAULT_SETTINGS } from "../src/settings/types";
import { RuntimeState } from "../src/runtime/state";
import type { EmbeddingProvider } from "../src/providers/types";
import { createMockApp } from "./helpers";

function createEmbeddingProvider(): EmbeddingProvider {
	let counter = 0;
	return {
		capability: {
			providerId: "test-provider",
			modelId: "test-model",
			supportsText: true,
			supportsImage: true,
			supportsCrossModal: true,
			dimension: 3,
			maxInputTokens: 8192,
		},
		async embed(request) {
			const inputs = request.texts ?? request.images ?? [];
			return {
				dimension: 3,
				vectors: inputs.map(() => {
					counter += 1;
					return [counter, 0, 0];
				}),
			};
		},
	};
}

function longSection(word: string): string {
	return Array.from({ length: 80 }, () => word).join(" ");
}

describe("IndexManager", () => {
	it("removes stale chunk embeddings when a note shrinks", async () => {
		const initial = `# One\n\n${longSection("alpha")}\n\n# Two\n\n${longSection("beta")}`;
		const updated = `# One\n\n${longSection("alpha")}`;
		const { app, setTextFile } = createMockApp({
			"notes/test.md": { content: initial, mtime: 1 },
		});

		const db = new Database(app, "storage/test.json");
		const state = new RuntimeState();
		const settings = {
			...DEFAULT_SETTINGS,
			embeddingProvider: "test-provider",
			embeddingModel: "test-model",
		};
		const provider = createEmbeddingProvider();
		const manager = new IndexManager(app, db, settings, state, provider);

		db.upsertFile({
			path: "notes/test.md",
			kind: "note",
			ext: ".md",
			mtime_ms: 1,
			size_bytes: initial.length,
			content_hash: null,
			status: "dirty",
			indexed_at_ms: null,
			last_seen_scan_ms: 1,
			last_error: null,
		});

		await manager.updateIndex();
		expect(db.getAllEmbeddings().map((emb) => emb.owner_id).sort()).toEqual([
			"notes/test.md#0",
			"notes/test.md#1",
		]);

		setTextFile("notes/test.md", updated, 2);
		db.upsertFile({
			path: "notes/test.md",
			kind: "note",
			ext: ".md",
			mtime_ms: 2,
			size_bytes: updated.length,
			content_hash: null,
			status: "dirty",
			indexed_at_ms: null,
			last_seen_scan_ms: 2,
			last_error: null,
		});

		await manager.updateIndex();

		expect(db.getAllEmbeddings().map((emb) => emb.owner_id)).toEqual([
			"notes/test.md#0",
		]);
		expect(db.getEmbedding("notes/test.md#1", "note_chunk", "test-provider", "test-model")).toBeUndefined();
	});

	it("tracks referenced assets and marks them clean after indexing", async () => {
		const noteContent = `# Images\n\n${longSection("gamma")}\n\n![[assets/pic.png]]`;
		const { app, setBinaryFile } = createMockApp({
			"notes/with-image.md": { content: noteContent, mtime: 1 },
			"assets/pic.png": { binary: new Uint8Array([1, 2, 3]), mtime: 1 },
		});

		const db = new Database(app, "storage/test.json");
		const state = new RuntimeState();
		const settings = {
			...DEFAULT_SETTINGS,
			enableImageEmbedding: true,
			embeddingProvider: "test-provider",
			embeddingModel: "test-model",
		};
		const provider = createEmbeddingProvider();
		const manager = new IndexManager(app, db, settings, state, provider);

		db.upsertFile({
			path: "notes/with-image.md",
			kind: "note",
			ext: ".md",
			mtime_ms: 1,
			size_bytes: noteContent.length,
			content_hash: null,
			status: "dirty",
			indexed_at_ms: null,
			last_seen_scan_ms: 1,
			last_error: null,
		});

		await manager.updateIndex();

		expect(db.getFile("assets/pic.png")?.status).toBe("indexed");
		const firstEmbedding = db.getEmbedding(
			"assets/pic.png",
			"asset",
			"test-provider",
			"test-model"
		);
		expect(firstEmbedding).toBeDefined();

		setBinaryFile("assets/pic.png", new Uint8Array([9, 9, 9, 9]), 2);
		db.upsertFile({
			path: "assets/pic.png",
			kind: "asset",
			ext: ".png",
			mtime_ms: 2,
			size_bytes: 4,
			content_hash: null,
			status: "dirty",
			indexed_at_ms: null,
			last_seen_scan_ms: 2,
			last_error: null,
		});

		await manager.updateIndex();

		expect(db.getFile("assets/pic.png")?.status).toBe("indexed");
		const secondEmbedding = db.getEmbedding(
			"assets/pic.png",
			"asset",
			"test-provider",
			"test-model"
		);
		expect(secondEmbedding).toBeDefined();
		expect(secondEmbedding?.created_at_ms).toBeGreaterThanOrEqual(
			firstEmbedding?.created_at_ms ?? 0
		);
	});

	it("rebuild rescans the vault before indexing", async () => {
		const { app } = createMockApp({
			"notes/first.md": { content: "# First\n\nalpha", mtime: 1 },
			"notes/second.md": { content: "# Second\n\nbeta", mtime: 1 },
		});

		const db = new Database(app, "storage/test.json");
		const state = new RuntimeState();
		const settings = {
			...DEFAULT_SETTINGS,
			embeddingProvider: "test-provider",
			embeddingModel: "test-model",
		};
		const manager = new IndexManager(
			app,
			db,
			settings,
			state,
			createEmbeddingProvider()
		);

		db.upsertFile({
			path: "notes/first.md",
			kind: "note",
			ext: ".md",
			mtime_ms: 1,
			size_bytes: 10,
			content_hash: null,
			status: "indexed",
			indexed_at_ms: 1,
			last_seen_scan_ms: 1,
			last_error: null,
		});

		await manager.rebuildIndex();

		expect(db.getFile("notes/first.md")?.status).toBe("indexed");
		expect(db.getFile("notes/second.md")?.status).toBe("indexed");
		expect(db.getChunksByNote("notes/second.md")).toHaveLength(1);
	});
});
