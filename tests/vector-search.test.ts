import { describe, it, expect } from "vitest";
import {
	cosineSimilarity,
	vectorSearch,
} from "../src/search/vector-search";
import type { EmbeddingRecord } from "../src/types/domain";

describe("cosineSimilarity", () => {
	it("should return 1 for identical vectors", () => {
		const v = [1, 2, 3, 4, 5];
		expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
	});

	it("should return 0 for orthogonal vectors", () => {
		const a = [1, 0, 0];
		const b = [0, 1, 0];
		expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
	});

	it("should return -1 for opposite vectors", () => {
		const a = [1, 2, 3];
		const b = [-1, -2, -3];
		expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
	});

	it("should handle zero vectors", () => {
		const a = [0, 0, 0];
		const b = [1, 2, 3];
		expect(cosineSimilarity(a, b)).toBe(0);
	});

	it("should handle empty vectors", () => {
		expect(cosineSimilarity([], [])).toBe(0);
	});

	it("should return correct similarity for known vectors", () => {
		const a = [1, 1, 0];
		const b = [1, 0, 1];
		// dot=1, normA=sqrt(2), normB=sqrt(2), sim=1/2=0.5
		expect(cosineSimilarity(a, b)).toBeCloseTo(0.5, 5);
	});
});

describe("vectorSearch", () => {
	const embeddings: EmbeddingRecord[] = [
		{
			owner_id: "chunk-1",
			owner_type: "note_chunk",
			provider_id: "test",
			model_id: "test-model",
			modality: "text",
			dimension: 3,
			vector: [1, 0, 0],
			created_at_ms: Date.now(),
		},
		{
			owner_id: "chunk-2",
			owner_type: "note_chunk",
			provider_id: "test",
			model_id: "test-model",
			modality: "text",
			dimension: 3,
			vector: [0, 1, 0],
			created_at_ms: Date.now(),
		},
		{
			owner_id: "chunk-3",
			owner_type: "note_chunk",
			provider_id: "test",
			model_id: "test-model",
			modality: "text",
			dimension: 3,
			vector: [0.9, 0.1, 0],
			created_at_ms: Date.now(),
		},
		{
			owner_id: "asset-1",
			owner_type: "asset",
			provider_id: "test",
			model_id: "test-model",
			modality: "image",
			dimension: 3,
			vector: [0, 0, 1],
			created_at_ms: Date.now(),
		},
	];

	it("should return top K results sorted by score", () => {
		const query = [1, 0, 0];
		const results = vectorSearch(query, embeddings, 2);

		expect(results.length).toBe(2);
		// chunk-1 should be first (exact match)
		expect(results[0]!.ownerId).toBe("chunk-1");
		expect(results[0]!.score).toBeCloseTo(1.0, 5);
		// chunk-3 should be second (0.9, 0.1, 0 is close)
		expect(results[1]!.ownerId).toBe("chunk-3");
		expect(results[1]!.score).toBeGreaterThan(0.9);
	});

	it("should filter by owner type", () => {
		const query = [0, 0, 1];
		const results = vectorSearch(query, embeddings, 10, "asset");

		expect(results.length).toBe(1);
		expect(results[0]!.ownerId).toBe("asset-1");
	});

	it("should handle empty embeddings", () => {
		const results = vectorSearch([1, 0, 0], [], 10);
		expect(results.length).toBe(0);
	});

	it("should limit to topK", () => {
		const query = [0.5, 0.5, 0];
		const results = vectorSearch(query, embeddings, 1);
		expect(results.length).toBe(1);
	});
});
