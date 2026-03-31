import type { App } from "obsidian";
import type {
	FileRecord,
	NoteChunk,
	AssetRecord,
	AssetMention,
	EmbeddingRecord,
} from "../types/domain";

export interface DatabaseSchema {
	schema_meta: Record<string, string>;
	files: Record<string, FileRecord>;
	note_chunks: Record<string, NoteChunk>;
	assets: Record<string, AssetRecord>;
	asset_mentions: Record<string, AssetMention>;
	embeddings: Record<string, EmbeddingRecord>;
}

function createEmptySchema(): DatabaseSchema {
	return {
		schema_meta: {
			schema_version: "1",
		},
		files: {},
		note_chunks: {},
		assets: {},
		asset_mentions: {},
		embeddings: {},
	};
}

/**
 * A lightweight JSON-backed database that persists to disk via Obsidian's adapter API.
 * Implements the same logical schema described in the design doc using in-memory
 * data structures with JSON serialization for persistence.
 */
export class Database {
	private app: App;
	private dbPath: string;
	private data: DatabaseSchema;
	private dirty = false;

	constructor(app: App, dbPath: string) {
		this.app = app;
		this.dbPath = dbPath;
		this.data = createEmptySchema();
	}

	async load(): Promise<void> {
		try {
			const exists = await this.app.vault.adapter.exists(this.dbPath);
			if (exists) {
				const raw = await this.app.vault.adapter.read(this.dbPath);
				const parsed = JSON.parse(raw) as DatabaseSchema;
				this.data = parsed;
			}
		} catch {
			// If file is corrupted or missing, start fresh
			this.data = createEmptySchema();
		}
	}

	async save(): Promise<void> {
		if (!this.dirty) return;
		// Ensure storage directory exists
		const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf("/"));
		const dirExists = await this.app.vault.adapter.exists(dir);
		if (!dirExists) {
			await this.app.vault.adapter.mkdir(dir);
		}
		await this.app.vault.adapter.write(
			this.dbPath,
			JSON.stringify(this.data)
		);
		this.dirty = false;
	}

	private markDirty(): void {
		this.dirty = true;
	}

	// --- Schema Meta ---
	getMeta(key: string): string | undefined {
		return this.data.schema_meta[key];
	}

	setMeta(key: string, value: string): void {
		this.data.schema_meta[key] = value;
		this.markDirty();
	}

	// --- Files ---
	getFile(path: string): FileRecord | undefined {
		return this.data.files[path];
	}

	getAllFiles(): FileRecord[] {
		return Object.values(this.data.files);
	}

	getFilesByStatus(status: string): FileRecord[] {
		return Object.values(this.data.files).filter(
			(f) => f.status === status
		);
	}

	getFilesByKind(kind: string): FileRecord[] {
		return Object.values(this.data.files).filter((f) => f.kind === kind);
	}

	upsertFile(file: FileRecord): void {
		this.data.files[file.path] = file;
		this.markDirty();
	}

	deleteFile(path: string): void {
		delete this.data.files[path];
		this.markDirty();
	}

	// --- Note Chunks ---
	getChunk(chunkId: string): NoteChunk | undefined {
		return this.data.note_chunks[chunkId];
	}

	getChunksByNote(notePath: string): NoteChunk[] {
		return Object.values(this.data.note_chunks)
			.filter((c) => c.note_path === notePath)
			.sort((a, b) => a.chunk_index - b.chunk_index);
	}

	getAllChunks(): NoteChunk[] {
		return Object.values(this.data.note_chunks);
	}

	upsertChunk(chunk: NoteChunk): void {
		this.data.note_chunks[chunk.chunk_id] = chunk;
		this.markDirty();
	}

	deleteChunksByNote(notePath: string): void {
		for (const [id, chunk] of Object.entries(this.data.note_chunks)) {
			if (chunk.note_path === notePath) {
				delete this.data.note_chunks[id];
			}
		}
		this.markDirty();
	}

	deleteChunk(chunkId: string): void {
		delete this.data.note_chunks[chunkId];
		this.markDirty();
	}

	// --- Assets ---
	getAsset(assetPath: string): AssetRecord | undefined {
		return this.data.assets[assetPath];
	}

	getAllAssets(): AssetRecord[] {
		return Object.values(this.data.assets);
	}

	upsertAsset(asset: AssetRecord): void {
		this.data.assets[asset.asset_path] = asset;
		this.markDirty();
	}

	deleteAsset(assetPath: string): void {
		delete this.data.assets[assetPath];
		this.markDirty();
	}

	// --- Asset Mentions ---
	getMention(mentionId: string): AssetMention | undefined {
		return this.data.asset_mentions[mentionId];
	}

	getMentionsByAsset(assetPath: string): AssetMention[] {
		return Object.values(this.data.asset_mentions).filter(
			(m) => m.asset_path === assetPath
		);
	}

	getMentionsByNote(notePath: string): AssetMention[] {
		return Object.values(this.data.asset_mentions).filter(
			(m) => m.note_path === notePath
		);
	}

	upsertMention(mention: AssetMention): void {
		this.data.asset_mentions[mention.mention_id] = mention;
		this.markDirty();
	}

	deleteMentionsByNote(notePath: string): void {
		for (const [id, mention] of Object.entries(this.data.asset_mentions)) {
			if (mention.note_path === notePath) {
				delete this.data.asset_mentions[id];
			}
		}
		this.markDirty();
	}

	deleteMentionsByAsset(assetPath: string): void {
		for (const [id, mention] of Object.entries(this.data.asset_mentions)) {
			if (mention.asset_path === assetPath) {
				delete this.data.asset_mentions[id];
			}
		}
		this.markDirty();
	}

	// --- Embeddings ---
	getEmbedding(
		ownerId: string,
		ownerType: string,
		providerId: string,
		modelId: string
	): EmbeddingRecord | undefined {
		const key = `${ownerId}|${ownerType}|${providerId}|${modelId}`;
		return this.data.embeddings[key];
	}

	getEmbeddingsByOwner(ownerId: string): EmbeddingRecord[] {
		return Object.values(this.data.embeddings).filter(
			(e) => e.owner_id === ownerId
		);
	}

	getAllEmbeddings(): EmbeddingRecord[] {
		return Object.values(this.data.embeddings);
	}

	getEmbeddingsByType(ownerType: string): EmbeddingRecord[] {
		return Object.values(this.data.embeddings).filter(
			(e) => e.owner_type === ownerType
		);
	}

	upsertEmbedding(embedding: EmbeddingRecord): void {
		const key = `${embedding.owner_id}|${embedding.owner_type}|${embedding.provider_id}|${embedding.model_id}`;
		this.data.embeddings[key] = embedding;
		this.markDirty();
	}

	deleteEmbeddingsByOwner(ownerId: string): void {
		for (const [key, emb] of Object.entries(this.data.embeddings)) {
			if (emb.owner_id === ownerId) {
				delete this.data.embeddings[key];
			}
		}
		this.markDirty();
	}

	// --- Bulk operations ---
	clearAll(): void {
		this.data = createEmptySchema();
		this.markDirty();
	}

	getStats() {
		const files = Object.values(this.data.files);
		return {
			totalNotes: files.filter(
				(f) => f.kind === "note" && f.status === "indexed"
			).length,
			totalChunks: Object.keys(this.data.note_chunks).length,
			totalAssets: Object.keys(this.data.assets).length,
			dirtyFiles: files.filter((f) => f.status === "dirty").length,
		};
	}
}
