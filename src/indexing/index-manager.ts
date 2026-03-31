import type { App } from "obsidian";
import type { Database } from "../storage/db";
import type { SimpleRAGSettings } from "../settings/types";
import type { EmbeddingProvider } from "../providers/types";
import type { RuntimeState } from "../runtime/state";
import type { NoteChunk, AssetMention } from "../types/domain";
import {
	parseMarkdownSections,
	chunkSections,
} from "./chunking/markdown-parser";
import { extractImageReferences } from "./links/image-reference-resolver";
import { getIndexMode } from "../settings/types";

/**
 * Orchestrates the indexing pipeline: reading dirty files, chunking,
 * embedding, and writing results to the database.
 */
export class IndexManager {
	private app: App;
	private db: Database;
	private settings: SimpleRAGSettings;
	private state: RuntimeState;
	private embeddingProvider: EmbeddingProvider;

	constructor(
		app: App,
		db: Database,
		settings: SimpleRAGSettings,
		state: RuntimeState,
		embeddingProvider: EmbeddingProvider
	) {
		this.app = app;
		this.db = db;
		this.settings = settings;
		this.state = state;
		this.embeddingProvider = embeddingProvider;
	}

	/**
	 * Index only dirty files (incremental update).
	 */
	async updateIndex(
		onProgress?: (current: number, total: number) => void
	): Promise<{ indexed: number; errors: number }> {
		const dirtyFiles = this.db.getFilesByStatus("dirty");
		const notes = dirtyFiles.filter((f) => f.kind === "note");

		let indexed = 0;
		let errors = 0;

		for (let i = 0; i < notes.length; i++) {
			const file = notes[i]!;
			onProgress?.(i + 1, notes.length);

			try {
				await this.indexNote(file.path);
				indexed++;
			} catch (e) {
				errors++;
				const errorMsg =
					e instanceof Error ? e.message : String(e);
				this.db.upsertFile({
					...file,
					status: "error",
					last_error: errorMsg,
				});
				console.error(
					`[SimpleRAG] Error indexing ${file.path}:`,
					e
				);
			}
		}

		// Handle deleted files
		const deletedFiles = this.db.getFilesByStatus("deleted");
		for (const file of deletedFiles) {
			if (file.kind === "note") {
				this.cleanupNoteFile(file.path);
			} else {
				this.cleanupAssetFile(file.path);
			}
			this.db.deleteFile(file.path);
			this.state.markClean(file.path);
		}

		// Handle image assets in multimodal mode
		if (getIndexMode(this.settings) === "multimodal") {
			await this.indexAssets();
		}

		// Clean up orphaned assets
		this.cleanOrphanedAssets();

		const now = Date.now();
		this.db.setMeta("last_index_at", String(now));
		this.db.setMeta("index_mode", getIndexMode(this.settings));
		this.db.setMeta("embedding_provider", this.settings.embeddingProvider);
		this.db.setMeta("embedding_model", this.settings.embeddingModel);
		await this.db.save();

		return { indexed, errors };
	}

	/**
	 * Full rebuild: clear all data and re-index everything.
	 */
	async rebuildIndex(
		onProgress?: (current: number, total: number) => void
	): Promise<{ indexed: number; errors: number }> {
		// Mark all note files as dirty
		for (const file of this.db.getAllFiles()) {
			if (file.kind === "note") {
				this.db.upsertFile({ ...file, status: "dirty" });
			}
		}

		// Clear all chunks, embeddings, assets, mentions
		for (const chunk of this.db.getAllChunks()) {
			this.db.deleteChunk(chunk.chunk_id);
		}
		for (const emb of this.db.getAllEmbeddings()) {
			this.db.deleteEmbeddingsByOwner(emb.owner_id);
		}
		for (const asset of this.db.getAllAssets()) {
			this.db.deleteAsset(asset.asset_path);
		}

		return this.updateIndex(onProgress);
	}

	/**
	 * Index a single Markdown note.
	 */
	private async indexNote(notePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!file || !("extension" in file)) return;

		const content = await this.app.vault.cachedRead(file as any);

		// 1. Parse and chunk
		const sections = parseMarkdownSections(content);
		const chunks = chunkSections(notePath, sections);

		// 2. Extract image references
		const headingPathAtOffset = buildHeadingPathLookup(content);
		const imageRefs = extractImageReferences(
			notePath,
			content,
			headingPathAtOffset
		);

		// 3. Clear old data for this note
		const oldChunkIds = this.db
			.getChunksByNote(notePath)
			.map((c) => c.chunk_id);
		for (const id of oldChunkIds) {
			this.db.deleteEmbeddingsByOwner(id);
		}
		this.db.deleteChunksByNote(notePath);
		this.db.deleteMentionsByNote(notePath);

		// 4. Store new chunks
		for (const chunk of chunks) {
			this.db.upsertChunk(chunk);
		}

		// 5. Generate embeddings in batches
		await this.embedChunks(chunks);

		// 6. Store image references in multimodal mode
		if (getIndexMode(this.settings) === "multimodal") {
			for (const ref of imageRefs) {
				this.db.upsertMention(ref);
				// Ensure asset record exists
				const existing = this.db.getAsset(ref.asset_path);
				if (!existing) {
					this.db.upsertAsset({
						asset_path: ref.asset_path,
						mime_type: guessMimeType(ref.asset_path),
						reference_count: 0,
						indexed_at_ms: null,
					});
				}
				this.syncAssetFileRecord(ref.asset_path);
			}

			// Update reference counts
			this.updateAssetReferenceCounts();
		}

		// 7. Mark file as indexed
		const fileRecord = this.db.getFile(notePath);
		if (fileRecord) {
			this.db.upsertFile({
				...fileRecord,
				status: "indexed",
				indexed_at_ms: Date.now(),
				last_error: null,
			});
		}

		this.state.markClean(notePath);
	}

	/**
	 * Embed chunks in batches.
	 */
	private async embedChunks(chunks: NoteChunk[]): Promise<void> {
		const batchSize = this.settings.maxConcurrentRequests;

		for (let i = 0; i < chunks.length; i += batchSize) {
			const batch = chunks.slice(i, i + batchSize);
			const texts = batch.map((c) => c.text_for_embedding);

			const response = await this.embeddingProvider.embed({ texts });

			for (let j = 0; j < batch.length; j++) {
				const chunk = batch[j]!;
				const vector = response.vectors[j];
				if (!vector) continue;

				this.db.upsertEmbedding({
					owner_id: chunk.chunk_id,
					owner_type: "note_chunk",
					provider_id: this.settings.embeddingProvider,
					model_id: this.settings.embeddingModel,
					modality: "text",
					dimension: response.dimension,
					vector,
					created_at_ms: Date.now(),
				});
			}
		}
	}

	/**
	 * Index image assets that have references and need embedding.
	 */
	private async indexAssets(): Promise<void> {
		const assets = this.db.getAllAssets();

		for (const asset of assets) {
			if (asset.reference_count === 0) continue;

			const fileRecord = this.db.getFile(asset.asset_path);
			const shouldReindex = fileRecord?.status === "dirty";

			// Check if already has embedding
			const existing = this.db.getEmbedding(
				asset.asset_path,
				"asset",
				this.settings.embeddingProvider,
				this.settings.embeddingModel
			);
			if (existing && !shouldReindex) continue;

			try {
				// Read image as base64
				const file = this.app.vault.getAbstractFileByPath(
					asset.asset_path
				);
				if (
					!file ||
					!("extension" in file) ||
					typeof file.extension !== "string" ||
					!("stat" in file)
				) {
					this.cleanupAssetFile(asset.asset_path);
					continue;
				}
				const assetFile = file as typeof file & {
					extension: string;
					stat: { mtime: number; size: number };
				};

				const arrayBuffer = await this.app.vault.readBinary(
					assetFile as any
				);
				const base64 = arrayBufferToBase64(arrayBuffer);

				if (shouldReindex) {
					this.db.deleteEmbeddingsByOwner(asset.asset_path);
				}

				const response = await this.embeddingProvider.embed({
					images: [base64],
				});

				if (response.vectors[0]) {
					this.db.upsertEmbedding({
						owner_id: asset.asset_path,
						owner_type: "asset",
						provider_id: this.settings.embeddingProvider,
						model_id: this.settings.embeddingModel,
						modality: "image",
						dimension: response.dimension,
						vector: response.vectors[0],
						created_at_ms: Date.now(),
					});

					this.db.upsertAsset({
						...asset,
						indexed_at_ms: Date.now(),
					});
				}

				const currentFileRecord = this.db.getFile(asset.asset_path);
				this.db.upsertFile({
					path: asset.asset_path,
					kind: "asset",
					ext: "." + assetFile.extension.toLowerCase(),
					mtime_ms: assetFile.stat.mtime,
					size_bytes: assetFile.stat.size,
					content_hash: currentFileRecord?.content_hash ?? null,
					status: "indexed",
					indexed_at_ms: Date.now(),
					last_seen_scan_ms:
						currentFileRecord?.last_seen_scan_ms ?? Date.now(),
					last_error: null,
				});
				this.state.markClean(asset.asset_path);
			} catch (e) {
				const errorMsg = e instanceof Error ? e.message : String(e);
				const currentFileRecord = this.db.getFile(asset.asset_path);
				if (currentFileRecord) {
					this.db.upsertFile({
						...currentFileRecord,
						status: "error",
						last_error: errorMsg,
					});
				}
				console.error(
					`[SimpleRAG] Error indexing asset ${asset.asset_path}:`,
					e
				);
			}
		}
	}

	private cleanupNoteFile(path: string): void {
		// Remove chunks and their embeddings
		const chunks = this.db.getChunksByNote(path);
		for (const chunk of chunks) {
			this.db.deleteEmbeddingsByOwner(chunk.chunk_id);
		}
		this.db.deleteChunksByNote(path);
		this.db.deleteMentionsByNote(path);
	}

	private cleanupAssetFile(path: string): void {
		this.db.deleteEmbeddingsByOwner(path);
		this.db.deleteMentionsByAsset(path);
		this.db.deleteAsset(path);
	}

	private cleanOrphanedAssets(): void {
		for (const asset of this.db.getAllAssets()) {
			const mentions = this.db.getMentionsByAsset(asset.asset_path);
			if (mentions.length === 0) {
				this.db.deleteEmbeddingsByOwner(asset.asset_path);
				this.db.deleteAsset(asset.asset_path);
				this.db.deleteFile(asset.asset_path);
				this.state.markClean(asset.asset_path);
			}
		}
	}

	private updateAssetReferenceCounts(): void {
		for (const asset of this.db.getAllAssets()) {
			const count = this.db.getMentionsByAsset(asset.asset_path).length;
			this.db.upsertAsset({ ...asset, reference_count: count });
		}
	}

	private syncAssetFileRecord(assetPath: string): void {
		const file = this.app.vault.getAbstractFileByPath(assetPath);
		if (
			!file ||
			!("extension" in file) ||
			typeof file.extension !== "string" ||
			!("stat" in file)
		) {
			return;
		}
		const assetFile = file as typeof file & {
			extension: string;
			stat: { mtime: number; size: number };
		};

		const existing = this.db.getFile(assetPath);
		const currentEmbedding = this.db.getEmbedding(
			assetPath,
			"asset",
			this.settings.embeddingProvider,
			this.settings.embeddingModel
		);
		const needsEmbedding =
			!currentEmbedding ||
			!existing ||
			existing.mtime_ms !== assetFile.stat.mtime ||
			existing.size_bytes !== assetFile.stat.size;

		this.db.upsertFile({
			path: assetPath,
			kind: "asset",
			ext: "." + assetFile.extension.toLowerCase(),
			mtime_ms: assetFile.stat.mtime,
			size_bytes: assetFile.stat.size,
			content_hash: existing?.content_hash ?? null,
			status: needsEmbedding ? "dirty" : "indexed",
			indexed_at_ms: existing?.indexed_at_ms ?? null,
			last_seen_scan_ms: existing?.last_seen_scan_ms ?? Date.now(),
			last_error: null,
		});
	}
}

/**
 * Build a lookup function that returns the heading path at a given character offset.
 */
function buildHeadingPathLookup(
	content: string
): (offset: number) => { json: string; text: string } {
	const headings: Array<{
		offset: number;
		level: number;
		text: string;
	}> = [];

	const headingRegex = /^(#{1,6})\s+(.+)$/gm;
	let match;
	while ((match = headingRegex.exec(content)) !== null) {
		if (match[1] && match[2]) {
			headings.push({
				offset: match.index,
				level: match[1].length,
				text: match[2].trim(),
			});
		}
	}

	return (offset: number) => {
		const stack: Array<{ level: number; text: string }> = [];

		for (const h of headings) {
			if (h.offset > offset) break;
			while (
				stack.length > 0 &&
				stack[stack.length - 1]!.level >= h.level
			) {
				stack.pop();
			}
			stack.push({ level: h.level, text: h.text });
		}

		const text = stack.map((s) => s.text).join(" / ");
		const json = JSON.stringify(
			stack.map((s) => ({ level: s.level, text: s.text }))
		);
		return { json, text };
	};
}

function guessMimeType(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		default:
			return "application/octet-stream";
	}
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
}
