import type {
	EmbeddingProvider,
	EmbeddingCapability,
	EmbeddingRequest,
	EmbeddingResponse,
} from "../types";
import { requestWithRetry } from "../request";
import { imagePayloadToDataUrl } from "../../utils/base64";

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
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
		retryCount: number,
		supportsImage: boolean
	) {
		this.baseUrl = baseUrl.replace(/\/+$/, "");
		this.apiToken = apiToken;
		this.timeout = timeout;
		this.retryCount = retryCount;
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
			for (const img of request.images) {
				inputs.push(imagePayloadToDataUrl(img));
			}
		}

		if (inputs.length === 0) {
			return { vectors: [], dimension: 0 };
		}

		const body: Record<string, unknown> = {
			model: this.capability.modelId,
			input: inputs,
		};

		const response = await requestWithRetry({
			url: `${this.baseUrl}/embeddings`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiToken}`,
			},
			body: JSON.stringify(body),
			timeoutMs: this.timeout,
			retryCount: this.retryCount,
			requestLabel: "Embedding request",
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
