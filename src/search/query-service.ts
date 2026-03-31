import type { App } from "obsidian";
import type { Database } from "../storage/db";
import type { SimpleRAGSettings } from "../settings/types";
import type { EmbeddingProvider, RerankProvider } from "../providers/types";
import type { SearchResult } from "../types/domain";
import { vectorSearch } from "./vector-search";
import { getIndexMode } from "../settings/types";
import { arrayBufferToBase64 } from "../utils/base64";

/**
 * Orchestrates the search pipeline: query embedding → vector recall → optional rerank → result assembly.
 */
export class QueryService {
	private app: App;
	private db: Database;
	private settings: SimpleRAGSettings;
	private embeddingProvider: EmbeddingProvider;
	private rerankProvider: RerankProvider | null;

	constructor(
		app: App,
		db: Database,
		settings: SimpleRAGSettings,
		embeddingProvider: EmbeddingProvider,
		rerankProvider: RerankProvider | null
	) {
		this.app = app;
		this.db = db;
		this.settings = settings;
		this.embeddingProvider = embeddingProvider;
		this.rerankProvider = rerankProvider;
	}

	/**
	 * Execute a text search query.
	 */
	async searchText(query: string): Promise<SearchResult[]> {
		// 1. Generate query embedding
		const queryEmbedding = await this.embeddingProvider.embed({
			texts: [query],
		});

		const queryVector = queryEmbedding.vectors[0];
		if (!queryVector) {
			throw new Error("Failed to generate query embedding");
		}

		return this.runSearch(queryVector, query);
	}

	async searchImage(imagePath: string): Promise<SearchResult[]> {
		if (!this.settings.enableImageEmbedding) {
			throw new Error(
				"Image queries require image embedding to be enabled. Turn it on and rebuild the index first."
			);
		}

		if (!this.embeddingProvider.capability.supportsImage) {
			throw new Error(
				"Image queries require a multimodal embedding model. Enable image embedding and rebuild the index first."
			);
		}

		const file = this.app.vault.getAbstractFileByPath(imagePath);
		if (!file || !("extension" in file)) {
			throw new Error(`Image not found: ${imagePath}`);
		}

		const buffer = await this.app.vault.readBinary(file as any);
		const queryEmbedding = await this.embeddingProvider.embed({
			images: [arrayBufferToBase64(buffer)],
		});
		const queryVector = queryEmbedding.vectors[0];
		if (!queryVector) {
			throw new Error("Failed to generate query embedding for the selected image");
		}

		return this.runSearch(queryVector);
	}

	/**
	 * Assemble search results from vector matches.
	 */
	private assembleResults(
		matches: Array<{ ownerId: string; ownerType: string; score: number }>
	): SearchResult[] {
		const results: SearchResult[] = [];

		for (const match of matches) {
			if (match.ownerType === "note_chunk") {
				const chunk = this.db.getChunk(match.ownerId);
				if (!chunk) continue;

				results.push({
					type: "note",
					score: match.score,
					chunk,
					notePath: chunk.note_path,
					headingPath: chunk.heading_path_text,
					snippet:
						chunk.text.length > 200
							? chunk.text.slice(0, 200) + "…"
							: chunk.text,
				});
			} else if (match.ownerType === "asset") {
				const asset = this.db.getAsset(match.ownerId);
				if (!asset) continue;

				const mentions = this.db.getMentionsByAsset(
					asset.asset_path
				);
				const firstMention = mentions[0];

				results.push({
					type: "image",
					score: match.score,
					asset,
					mentions,
					notePath: firstMention?.note_path ?? "",
					headingPath: firstMention?.heading_path_text ?? "",
					snippet: `Image: ${asset.asset_path}`,
				});
			}
		}

		return results;
	}

	/**
	 * Rerank results using the rerank provider.
	 */
	private async rerank(
		query: string,
		results: SearchResult[]
	): Promise<SearchResult[]> {
		if (!this.rerankProvider) return results;

		try {
			const documents = results.map((r) =>
				r.type === "note"
					? r.snippet
					: `Image: ${r.asset?.asset_path ?? ""}`
			);

			const rerankResponse = await this.rerankProvider.rerank({
				query,
				documents,
			});

			const reranked = rerankResponse.rankings.map((ranking) => {
				const result = results[ranking.index];
				if (!result) return null;
				return {
					...result,
					score: ranking.score,
				};
			}).filter((r): r is SearchResult => r !== null);

			return reranked;
		} catch (e) {
			console.warn("[SimpleRAG] Rerank failed, falling back to vector scores:", e);
			return results;
		}
	}

	private async runSearch(
		queryVector: number[],
		rerankQuery?: string
	): Promise<SearchResult[]> {
		const allEmbeddings = this.getSearchEmbeddings(queryVector.length);
		const recallSize = this.settings.recallPoolSize;
		const matches = vectorSearch(queryVector, allEmbeddings, recallSize);
		let results = this.assembleResults(matches);

		if (
			rerankQuery &&
			this.settings.enableRerank &&
			this.rerankProvider &&
			results.length > 0
		) {
			results = await this.rerank(rerankQuery, results);
		}

		return results.slice(0, this.settings.resultsPerQuery);
	}

	private getSearchEmbeddings(dimension: number) {
		const allEmbeddings = this.db.getAllEmbeddings();
		if (allEmbeddings.length === 0) {
			throw new Error(
				"No indexed content is available yet. Scan the vault and update the index first."
			);
		}

		const indexMode = getIndexMode(this.settings);
		const filtered = allEmbeddings.filter((embedding) => {
			if (embedding.provider_id !== this.settings.embeddingProvider) {
				return false;
			}
			if (embedding.model_id !== this.settings.embeddingModel) {
				return false;
			}
			if (embedding.dimension !== dimension) {
				return false;
			}
			if (indexMode === "text-only" && embedding.owner_type !== "note_chunk") {
				return false;
			}
			return true;
		});

		if (filtered.length === 0) {
			throw new Error(
				"The current index does not match the active embedding settings. Rebuild the full index before searching."
			);
		}

		return filtered;
	}
}
