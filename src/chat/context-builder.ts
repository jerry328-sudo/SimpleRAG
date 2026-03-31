import type { App } from "obsidian";
import type { Database } from "../storage/db";
import type { SimpleRAGSettings } from "../settings/types";
import type { SearchResult, NoteChunk, AssetMention } from "../types/domain";
import type { BinaryImagePayload } from "../types/media";
import { estimateTokens } from "../indexing/chunking/markdown-parser";
import { tryLoadVaultImagePayload } from "../media/image-loader";

export interface DocumentPacket {
	type: "note" | "image";
	path: string;
	headingPath: string;
	content: string;
	chunks: NoteChunk[];
	mentions: AssetMention[];
	score: number;
	imagePayload?: BinaryImagePayload;
}

/**
 * Builds document-level context for the chat model from search results.
 * Aggregates chunks by note, then either includes the full note or
 * a windowed excerpt depending on note size.
 */
export class ContextBuilder {
	private app: App;
	private db: Database;
	private settings: SimpleRAGSettings;

	constructor(app: App, db: Database, settings: SimpleRAGSettings) {
		this.app = app;
		this.db = db;
		this.settings = settings;
	}

	/**
	 * Build context from search results for the chat model.
	 */
	async buildContext(results: SearchResult[]): Promise<DocumentPacket[]> {
		// Group note results by note path
		const noteGroups = new Map<
			string,
			{ chunks: NoteChunk[]; maxScore: number }
		>();
		const imageResults = new Map<string, SearchResult>();

		for (const result of results) {
			if (result.type === "image" && result.asset) {
				const existingImage = imageResults.get(result.asset.asset_path);
				if (!existingImage || existingImage.score < result.score) {
					imageResults.set(result.asset.asset_path, result);
				}
				continue;
			}
			if (result.type !== "note" || !result.chunk) continue;

			const existing = noteGroups.get(result.notePath);
			if (existing) {
				existing.chunks.push(result.chunk);
				existing.maxScore = Math.max(existing.maxScore, result.score);
			} else {
				noteGroups.set(result.notePath, {
					chunks: [result.chunk],
					maxScore: result.score,
				});
			}
		}

		const noteCandidates = Array.from(noteGroups.entries()).map(
			([notePath, group]) => ({
				type: "note" as const,
				key: notePath,
				score: group.maxScore,
				chunks: group.chunks,
			})
		);
		const imageCandidates = Array.from(imageResults.values()).map(
			(result) => ({
				type: "image" as const,
				key: result.asset!.asset_path,
				score: result.score,
				result,
			})
		);

		const candidates = [...noteCandidates, ...imageCandidates]
			.sort((a, b) => b.score - a.score)
			.slice(0, this.settings.maxNotesInChatContext);

		const packets: DocumentPacket[] = [];
		for (const candidate of candidates) {
			if (candidate.type === "note") {
				const packet = await this.buildNotePacket(
					candidate.key,
					candidate.chunks,
					candidate.score
				);
				if (packet) {
					packets.push(packet);
				}
				continue;
			}

			const packet = await this.buildImagePacket(candidate.result);
			if (packet) {
				packets.push(packet);
			}
		}

		return packets;
	}

	private async buildNotePacket(
		notePath: string,
		hitChunks: NoteChunk[],
		score: number
	): Promise<DocumentPacket | null> {
		// Try to read the full note
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!file || !("extension" in file)) return null;

		const fullContent = await this.app.vault.cachedRead(file as any);
		const fullTokens = estimateTokens(fullContent);

		if (fullTokens < this.settings.shortNoteThreshold) {
			// Short note: include full content
			return {
				type: "note",
				path: notePath,
				headingPath: hitChunks[0]?.heading_path_text ?? "",
				content: fullContent,
				chunks: hitChunks,
				mentions: [],
				score,
			};
		}

		// Long note: use windowed excerpts around hit chunks
		const allNoteChunks = this.db.getChunksByNote(notePath);
		const hitIndices = new Set(hitChunks.map((c) => c.chunk_index));

		const windowSize = this.settings.longNoteContextWindow;
		const includedIndices = new Set<number>();

		for (const idx of hitIndices) {
			for (
				let i = Math.max(0, idx - windowSize);
				i <= Math.min(allNoteChunks.length - 1, idx + windowSize);
				i++
			) {
				includedIndices.add(i);
			}
		}

		const excerptChunks = allNoteChunks.filter((c) =>
			includedIndices.has(c.chunk_index)
		);

		const excerptContent = excerptChunks
			.map((c) => {
				const prefix = c.heading_path_text
					? `[${c.heading_path_text}]\n`
					: "";
				return prefix + c.text;
			})
			.join("\n\n---\n\n");

		return {
			type: "note",
			path: notePath,
			headingPath: hitChunks[0]?.heading_path_text ?? "",
			content: excerptContent,
			chunks: excerptChunks,
			mentions: [],
			score,
		};
	}

	private async buildImagePacket(
		result: SearchResult
	): Promise<DocumentPacket | null> {
		if (result.type !== "image" || !result.asset) return null;

		const mentions =
			result.mentions ??
			this.db.getMentionsByAsset(result.asset.asset_path);
		const headingPath = mentions[0]?.heading_path_text ?? "";
		const mentionText = mentions.length
			? mentions
					.slice(0, 5)
					.map((mention, index) => {
						const parts = [
							`${index + 1}. Note: ${mention.note_path}`,
						];
						if (mention.heading_path_text) {
							parts.push(`Heading: ${mention.heading_path_text}`);
						}
						if (mention.surrounding_text) {
							parts.push(`Context: ${mention.surrounding_text}`);
						}
						return parts.join("\n");
					})
					.join("\n\n")
			: "No note references were available for this image.";
		const imagePayload = await this.buildImagePayload(
			result.asset.asset_path
		);

		return {
			type: "image",
			path: result.asset.asset_path,
			headingPath,
			content: `Image asset: ${result.asset.asset_path}\n\nReferenced by:\n${mentionText}`,
			chunks: [],
			mentions,
			score: result.score,
			imagePayload,
		};
	}

	private async buildImagePayload(
		assetPath: string
	): Promise<BinaryImagePayload | undefined> {
		return tryLoadVaultImagePayload(this.app, assetPath);
	}

	/**
	 * Format document packets into a context string for the chat prompt.
	 */
	formatContextForPrompt(packets: DocumentPacket[]): string {
		return packets
			.map((p, i) => {
				const label = p.type === "note" ? "Document" : "Image";
				return `[${label} ${i + 1}: ${p.path}]\n${p.content}`;
			})
			.join("\n\n===\n\n");
	}
}
