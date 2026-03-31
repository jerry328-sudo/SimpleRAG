import type { Database } from "../storage/db";
import type { SimpleRAGSettings } from "../settings/types";
import type { EmbeddingProvider, RerankProvider } from "../providers/types";
import type { SearchResult } from "../types/domain";
import { vectorSearch } from "./vector-search";

/**
 * Orchestrates the search pipeline: query embedding → vector recall → optional rerank → result assembly.
 */
export class QueryService {
	private db: Database;
	private settings: SimpleRAGSettings;
	private embeddingProvider: EmbeddingProvider;
	private rerankProvider: RerankProvider | null;

	constructor(
		db: Database,
		settings: SimpleRAGSettings,
		embeddingProvider: EmbeddingProvider,
		rerankProvider: RerankProvider | null
	) {
		this.db = db;
		this.settings = settings;
		this.embeddingProvider = embeddingProvider;
		this.rerankProvider = rerankProvider;
	}

	/**
	 * Execute a text search query.
	 */
	async search(query: string): Promise<SearchResult[]> {
		// 1. Generate query embedding
		const queryEmbedding = await this.embeddingProvider.embed({
			texts: [query],
		});

		const queryVector = queryEmbedding.vectors[0];
		if (!queryVector) {
			throw new Error("Failed to generate query embedding");
		}

		// 2. Vector recall
		const allEmbeddings = this.db.getAllEmbeddings();
		const recallSize = this.settings.recallPoolSize;
		const matches = vectorSearch(queryVector, allEmbeddings, recallSize);

		// 3. Assemble preliminary results
		let results = this.assembleResults(matches);

		// 4. Optional rerank
		if (
			this.settings.enableRerank &&
			this.rerankProvider &&
			results.length > 0
		) {
			results = await this.rerank(query, results);
		}

		// 5. Return top N
		return results.slice(0, this.settings.resultsPerQuery);
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
}
