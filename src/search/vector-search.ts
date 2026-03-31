import type { EmbeddingRecord } from "../types/domain";

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;

	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}

	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) return 0;

	return dot / denom;
}

export interface VectorMatch {
	ownerId: string;
	ownerType: string;
	score: number;
}

/**
 * Brute-force vector search over all embeddings.
 * Returns top K matches sorted by cosine similarity.
 */
export function vectorSearch(
	queryVector: number[],
	embeddings: EmbeddingRecord[],
	topK: number,
	ownerTypeFilter?: string
): VectorMatch[] {
	const filtered = ownerTypeFilter
		? embeddings.filter((e) => e.owner_type === ownerTypeFilter)
		: embeddings;

	const scored: VectorMatch[] = filtered.map((emb) => ({
		ownerId: emb.owner_id,
		ownerType: emb.owner_type,
		score: cosineSimilarity(queryVector, emb.vector),
	}));

	scored.sort((a, b) => b.score - a.score);

	return scored.slice(0, topK);
}
