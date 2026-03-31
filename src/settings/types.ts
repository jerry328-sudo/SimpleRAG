import { IndexMode } from "../types/domain";

export interface SimpleRAGSettings {
	// Group A: Providers
	embeddingProvider: string;
	embeddingModel: string;
	embeddingBaseUrl: string;
	embeddingApiToken: string;

	// Group B: Features
	enableImageEmbedding: boolean;
	enableAIChat: boolean;

	// Advanced - Retrieval
	enableRerank: boolean;
	rerankProvider: string;
	rerankModel: string;
	recallPoolSize: number;
	resultsPerQuery: number;
	defaultResultTab: "all" | "notes" | "images";

	// Advanced - Chat
	chatProvider: string;
	chatModel: string;
	chatBaseUrl: string;
	chatApiToken: string;
	shortNoteThreshold: number;
	maxNotesInChatContext: number;
	longNoteContextWindow: number;
	enableAIEvidenceSelection: boolean;

	// Advanced - Network
	rerankBaseUrl: string;
	rerankApiToken: string;
	timeout: number;
	retryCount: number;
	maxConcurrentRequests: number;

	// Advanced - Debug
	showSimilarityScores: boolean;
	enableDebugLogs: boolean;
}

export const DEFAULT_SETTINGS: SimpleRAGSettings = {
	embeddingProvider: "openai-compatible",
	embeddingModel: "text-embedding-3-small",
	embeddingBaseUrl: "https://api.openai.com/v1",
	embeddingApiToken: "",

	enableImageEmbedding: false,
	enableAIChat: false,

	enableRerank: false,
	rerankProvider: "openai-compatible",
	rerankModel: "rerank-v1",
	recallPoolSize: 50,
	resultsPerQuery: 10,
	defaultResultTab: "all",

	chatProvider: "openai-compatible",
	chatModel: "gpt-4o-mini",
	chatBaseUrl: "https://api.openai.com/v1",
	chatApiToken: "",
	shortNoteThreshold: 10000,
	maxNotesInChatContext: 5,
	longNoteContextWindow: 3,
	enableAIEvidenceSelection: false,

	rerankBaseUrl: "https://api.openai.com/v1",
	rerankApiToken: "",
	timeout: 30000,
	retryCount: 2,
	maxConcurrentRequests: 5,

	showSimilarityScores: false,
	enableDebugLogs: false,
};

export function getIndexMode(settings: SimpleRAGSettings): IndexMode {
	return settings.enableImageEmbedding ? "multimodal" : "text-only";
}
