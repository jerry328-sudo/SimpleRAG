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

	async load(): Promise<string[]> {
		const warnings: string[] = [];

		try {
			const exists = await this.app.vault.adapter.exists(this.dbPath);
			if (exists) {
				const raw = await this.app.vault.adapter.read(this.dbPath);
				const parsed = JSON.parse(raw) as unknown;
				if (isDatabaseSchema(parsed)) {
					this.data = parsed;
				} else {
					const backupPath = await quarantineFile(
						this.app.vault.adapter,
						this.dbPath
					);
					this.data = createEmptySchema();
					warnings.push(
						`SimpleRAG index data was invalid and moved to ${backupPath}. A new empty index will be created.`
					);
				}
			}
		} catch {
			this.data = createEmptySchema();
			try {
				if (await this.app.vault.adapter.exists(this.dbPath)) {
					const backupPath = await quarantineFile(
						this.app.vault.adapter,
						this.dbPath
					);
					warnings.push(
						`SimpleRAG index data could not be parsed and was moved to ${backupPath}. A new empty index will be created.`
					);
				}
			} catch {
				warnings.push(
					"SimpleRAG index data could not be parsed. A new empty index was loaded, but the original file could not be backed up automatically."
				);
			}
		}

		return warnings;
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

function isDatabaseSchema(value: unknown): value is DatabaseSchema {
	if (!isPlainObject(value)) {
		return false;
	}

	const record = value;
	if (
		!isPlainObject(record.schema_meta) ||
		!isPlainObject(record.files) ||
		!isPlainObject(record.note_chunks) ||
		!isPlainObject(record.assets) ||
		!isPlainObject(record.asset_mentions) ||
		!isPlainObject(record.embeddings)
	) {
		return false;
	}

	if (typeof record.schema_meta.schema_version !== "string") {
		return false;
	}

	return (
		Object.values(record.files).every(isFileRecord) &&
		Object.values(record.note_chunks).every(isNoteChunk) &&
		Object.values(record.assets).every(isAssetRecord) &&
		Object.values(record.asset_mentions).every(isAssetMention) &&
		Object.values(record.embeddings).every(isEmbeddingRecord)
	);
}

async function quarantineFile(
	adapter: App["vault"]["adapter"],
	path: string
): Promise<string> {
	const backupPath = await nextBackupPath(adapter, path);
	await adapter.rename(path, backupPath);
	return backupPath;
}

async function nextBackupPath(
	adapter: App["vault"]["adapter"],
	path: string
): Promise<string> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const dotIndex = path.lastIndexOf(".");
	const base = dotIndex >= 0 ? path.slice(0, dotIndex) : path;
	const ext = dotIndex >= 0 ? path.slice(dotIndex) : "";

	let attempt = 0;
	while (true) {
		const suffix =
			attempt === 0 ? `.corrupt-${timestamp}` : `.corrupt-${timestamp}-${attempt}`;
		const candidate = `${base}${suffix}${ext}`;
		if (!(await adapter.exists(candidate))) {
			return candidate;
		}
		attempt += 1;
	}
}

function isFileRecord(value: unknown): boolean {
	return isPlainObject(value) &&
		typeof value.path === "string" &&
		typeof value.kind === "string" &&
		typeof value.ext === "string" &&
		typeof value.mtime_ms === "number" &&
		typeof value.size_bytes === "number" &&
		isNullableString(value.content_hash) &&
		typeof value.status === "string" &&
		isNullableNumber(value.indexed_at_ms) &&
		isNullableNumber(value.last_seen_scan_ms) &&
		isNullableString(value.last_error);
}

function isNoteChunk(value: unknown): boolean {
	return isPlainObject(value) &&
		typeof value.chunk_id === "string" &&
		typeof value.note_path === "string" &&
		typeof value.chunk_index === "number" &&
		typeof value.heading_path_json === "string" &&
		typeof value.heading_path_text === "string" &&
		typeof value.text === "string" &&
		typeof value.text_for_embedding === "string" &&
		isNullableNumber(value.char_start) &&
		isNullableNumber(value.char_end) &&
		isNullableNumber(value.token_estimate);
}

function isAssetRecord(value: unknown): boolean {
	return isPlainObject(value) &&
		typeof value.asset_path === "string" &&
		isNullableString(value.mime_type) &&
		typeof value.reference_count === "number" &&
		isNullableNumber(value.indexed_at_ms);
}

function isAssetMention(value: unknown): boolean {
	return isPlainObject(value) &&
		typeof value.mention_id === "string" &&
		typeof value.asset_path === "string" &&
		typeof value.note_path === "string" &&
		typeof value.mention_index === "number" &&
		typeof value.heading_path_json === "string" &&
		typeof value.heading_path_text === "string" &&
		typeof value.raw_target === "string" &&
		typeof value.link_kind === "string" &&
		isNullableString(value.surrounding_text) &&
		isNullableString(value.near_chunk_id);
}

function isEmbeddingRecord(value: unknown): boolean {
	return isPlainObject(value) &&
		typeof value.owner_id === "string" &&
		typeof value.owner_type === "string" &&
		typeof value.provider_id === "string" &&
		typeof value.model_id === "string" &&
		typeof value.modality === "string" &&
		typeof value.dimension === "number" &&
		Array.isArray(value.vector) &&
		value.vector.every((item) => typeof item === "number") &&
		typeof value.created_at_ms === "number";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
	return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): boolean {
	return value === null || typeof value === "number";
}
