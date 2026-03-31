import { requestUrl } from "obsidian";
import type {
	EmbeddingProvider,
	EmbeddingCapability,
	EmbeddingRequest,
	EmbeddingResponse,
} from "../types";

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
	readonly capability: EmbeddingCapability;
	private baseUrl: string;
	private apiToken: string;
	private timeout: number;

	constructor(
		baseUrl: string,
		apiToken: string,
		modelId: string,
		timeout: number,
		supportsImage: boolean
	) {
		this.baseUrl = baseUrl.replace(/\/+$/, "");
		this.apiToken = apiToken;
		this.timeout = timeout;
		this.capability = {
			providerId: "openai-compatible",
			modelId,
			supportsText: true,
			supportsImage,
			supportsCrossModal: supportsImage,
			dimension: 0, // determined at runtime
			maxInputTokens: 8192,
		};
	}

	async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
		const inputs: string[] = [];

		if (request.texts) {
			inputs.push(...request.texts);
		}

		if (request.images && this.capability.supportsImage) {
			// For multimodal models, images are sent as data URIs
			for (const img of request.images) {
				inputs.push(img);
			}
		}

		if (inputs.length === 0) {
			return { vectors: [], dimension: 0 };
		}

		const body: Record<string, unknown> = {
			model: this.capability.modelId,
			input: inputs,
		};

		const response = await requestUrl({
			url: `${this.baseUrl}/embeddings`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiToken}`,
			},
			body: JSON.stringify(body),
			throw: false,
		});

		if (response.status !== 200) {
			throw new Error(
				`Embedding API error ${response.status}: ${response.text}`
			);
		}

		const data = response.json as {
			data: Array<{ embedding: number[]; index: number }>;
		};

		// Sort by index to maintain order
		const sorted = data.data.sort((a, b) => a.index - b.index);
		const vectors = sorted.map((d) => d.embedding);
		const dimension = vectors[0]?.length ?? 0;

		return { vectors, dimension };
	}
}
