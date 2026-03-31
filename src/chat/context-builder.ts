import type { App } from "obsidian";
import type { Database } from "../storage/db";
import type { SimpleRAGSettings } from "../settings/types";
import type { SearchResult, NoteChunk } from "../types/domain";
import { estimateTokens } from "../indexing/chunking/markdown-parser";

interface DocumentPacket {
	notePath: string;
	content: string;
	chunks: NoteChunk[];
	score: number;
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
		// Group results by note path
		const noteGroups = new Map<
			string,
			{ chunks: NoteChunk[]; maxScore: number }
		>();

		for (const result of results) {
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

		// Sort by max score descending
		const sorted = Array.from(noteGroups.entries()).sort(
			(a, b) => b[1].maxScore - a[1].maxScore
		);

		// Take top N notes
		const topNotes = sorted.slice(0, this.settings.maxNotesInChatContext);

		const packets: DocumentPacket[] = [];

		for (const [notePath, group] of topNotes) {
			const packet = await this.buildPacket(
				notePath,
				group.chunks,
				group.maxScore
			);
			if (packet) {
				packets.push(packet);
			}
		}

		return packets;
	}

	private async buildPacket(
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
				notePath,
				content: fullContent,
				chunks: hitChunks,
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
			notePath,
			content: excerptContent,
			chunks: excerptChunks,
			score,
		};
	}

	/**
	 * Format document packets into a context string for the chat prompt.
	 */
	formatContextForPrompt(packets: DocumentPacket[]): string {
		return packets
			.map((p, i) => {
				return `[Document ${i + 1}: ${p.notePath}]\n${p.content}`;
			})
			.join("\n\n===\n\n");
	}
}
