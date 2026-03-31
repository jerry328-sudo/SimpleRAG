/** Capability descriptor for an embedding model. */
export interface EmbeddingCapability {
	providerId: string;
	modelId: string;
	supportsText: boolean;
	supportsImage: boolean;
	supportsCrossModal: boolean;
	dimension: number;
	maxInputTokens: number;
}

export interface EmbeddingRequest {
	texts?: string[];
	/** Base64-encoded images */
	images?: string[];
}

export interface EmbeddingResponse {
	vectors: number[][];
	dimension: number;
}

export interface EmbeddingProvider {
	readonly capability: EmbeddingCapability;
	embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

/** Capability descriptor for a rerank model. */
export interface RerankCapability {
	providerId: string;
	modelId: string;
	supportsTextRerank: boolean;
	supportsCrossModalRerank: boolean;
	maxDocumentsPerRequest: number;
}

export interface RerankRequest {
	query: string;
	documents: string[];
}

export interface RerankResponse {
	/** Indices sorted by relevance, most relevant first */
	rankings: Array<{ index: number; score: number }>;
}

export interface RerankProvider {
	readonly capability: RerankCapability;
	rerank(request: RerankRequest): Promise<RerankResponse>;
}

/** Capability descriptor for a chat model. */
export interface ChatCapability {
	providerId: string;
	modelId: string;
	supportsStreaming: boolean;
	supportsSystemPrompt: boolean;
	supportsVisionInput: boolean;
	maxContextTokens: number;
}

export interface ChatRequest {
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
	stream?: boolean;
}

export interface ChatStreamEvent {
	delta: string;
	done: boolean;
}

export interface ChatResponse {
	content: string;
}

export interface ChatProvider {
	readonly capability: ChatCapability;
	chat(request: ChatRequest): Promise<ChatResponse>;
	chatStream?(
		request: ChatRequest,
		onEvent: (event: ChatStreamEvent) => void
	): Promise<void>;
}
