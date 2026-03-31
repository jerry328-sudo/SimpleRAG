import type {
	EmbeddingCapability,
	EmbeddingProvider,
	EmbeddingRequest,
	EmbeddingResponse,
} from "../types";
import { requestWithRetry } from "../request";
import {
	buildGeminiInlineDataPart,
	isGeminiMultimodalEmbeddingModel,
	normalizeGeminiBaseUrl,
	normalizeGeminiModelPath,
} from "../gemini";

type GeminiBatchEmbedResponse = {
	embeddings?: Array<{ values?: number[] }>;
};

type GeminiSingleEmbedResponse = {
	embedding?: { values?: number[] };
};

export class GeminiEmbeddingProvider implements EmbeddingProvider {
	readonly capability: EmbeddingCapability;
	private baseUrl: string;
	private apiToken: string;
	private timeout: number;
	private retryCount: number;

	constructor(
		baseUrl: string,
		apiToken: string,
		modelId: string,
		timeout: number,
		retryCount: number
	) {
		const supportsImage = isGeminiMultimodalEmbeddingModel(modelId);
		this.baseUrl = normalizeGeminiBaseUrl(baseUrl);
		this.apiToken = apiToken;
		this.timeout = timeout;
		this.retryCount = retryCount;
		this.capability = {
			providerId: "gemini",
			modelId,
			supportsText: true,
			supportsImage,
			supportsCrossModal: supportsImage,
			dimension: 3072,
			maxInputTokens: supportsImage ? 8192 : 2048,
		};
	}

	async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
		const modelPath = normalizeGeminiModelPath(this.capability.modelId);
		const requests: Array<Record<string, unknown>> = [];

		for (const text of request.texts ?? []) {
			requests.push({
				model: modelPath,
				content: {
					parts: [{ text }],
				},
			});
		}

		for (const image of request.images ?? []) {
			if (!this.capability.supportsImage) {
				throw new Error(
					"The selected Gemini embedding model does not support image inputs."
				);
			}

			requests.push({
				model: modelPath,
				content: {
					parts: [buildGeminiInlineDataPart(image)],
				},
			});
		}

		if (requests.length === 0) {
			return { vectors: [], dimension: 0 };
		}

		const singleRequest = requests.length === 1;
		const response = await requestWithRetry({
			url: `${this.baseUrl}/${modelPath}:${singleRequest ? "embedContent" : "batchEmbedContents"}`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": this.apiToken,
			},
			body: JSON.stringify(singleRequest ? requests[0] : { requests }),
			timeoutMs: this.timeout,
			retryCount: this.retryCount,
			requestLabel: "Gemini embedding request",
		});

		if (response.status !== 200) {
			throw new Error(
				`Gemini embedding API error ${response.status}: ${response.text}`
			);
		}

		const vectors = singleRequest
			? [
					((response.json as GeminiSingleEmbedResponse).embedding?.values ??
						[]) as number[],
			  ]
			: (((response.json as GeminiBatchEmbedResponse).embeddings ?? []).map(
					(embedding) => embedding.values ?? []
			  ) as number[][]);

		const dimension = vectors[0]?.length ?? 0;
		return { vectors, dimension };
	}
}
