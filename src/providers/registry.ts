import type { SimpleRAGSettings } from "../settings/types";
import type {
	EmbeddingProvider,
	RerankProvider,
	ChatProvider,
} from "./types";
import { OpenAICompatibleEmbeddingProvider } from "./embedding/openai-compatible";
import { OpenAICompatibleRerankProvider } from "./rerank/openai-compatible";
import { OpenAICompatibleChatProvider } from "./chat/openai-compatible";

/**
 * Creates and returns the appropriate provider instances based on current settings.
 */
export class ProviderRegistry {
	createEmbeddingProvider(settings: SimpleRAGSettings): EmbeddingProvider {
		return new OpenAICompatibleEmbeddingProvider(
			settings.embeddingBaseUrl,
			settings.embeddingApiToken,
			settings.embeddingModel,
			settings.timeout,
			settings.enableImageEmbedding
		);
	}

	createRerankProvider(settings: SimpleRAGSettings): RerankProvider {
		return new OpenAICompatibleRerankProvider(
			settings.rerankBaseUrl,
			settings.rerankApiToken,
			settings.rerankModel,
			settings.timeout
		);
	}

	createChatProvider(settings: SimpleRAGSettings): ChatProvider {
		return new OpenAICompatibleChatProvider(
			settings.chatBaseUrl,
			settings.chatApiToken,
			settings.chatModel,
			settings.timeout
		);
	}
}
