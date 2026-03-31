import { requestUrl } from "obsidian";
import type {
	RerankProvider,
	RerankCapability,
	RerankRequest,
	RerankResponse,
} from "../types";

export class OpenAICompatibleRerankProvider implements RerankProvider {
	readonly capability: RerankCapability;
	private baseUrl: string;
	private apiToken: string;
	private timeout: number;

	constructor(
		baseUrl: string,
		apiToken: string,
		modelId: string,
		timeout: number
	) {
		this.baseUrl = baseUrl.replace(/\/+$/, "");
		this.apiToken = apiToken;
		this.timeout = timeout;
		this.capability = {
			providerId: "openai-compatible",
			modelId,
			supportsTextRerank: true,
			supportsCrossModalRerank: false,
			maxDocumentsPerRequest: 100,
		};
	}

	async rerank(request: RerankRequest): Promise<RerankResponse> {
		if (request.documents.length === 0) {
			return { rankings: [] };
		}

		const body = {
			model: this.capability.modelId,
			query: request.query,
			documents: request.documents,
		};

		const response = await requestUrl({
			url: `${this.baseUrl}/rerank`,
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
				`Rerank API error ${response.status}: ${response.text}`
			);
		}

		const data = response.json as {
			results: Array<{ index: number; relevance_score: number }>;
		};

		const rankings = data.results
			.map((r) => ({ index: r.index, score: r.relevance_score }))
			.sort((a, b) => b.score - a.score);

		return { rankings };
	}
}
