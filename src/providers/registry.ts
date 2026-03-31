import type { SimpleRAGSettings } from "../settings/types";
import type {
	EmbeddingProvider,
	RerankProvider,
	ChatProvider,
} from "./types";
import { OpenAICompatibleEmbeddingProvider } from "./embedding/openai-compatible";
import { OpenAICompatibleRerankProvider } from "./rerank/openai-compatible";
import { OpenAICompatibleChatProvider } from "./chat/openai-compatible";

export interface ProviderOption {
	id: string;
	label: string;
}

const EMBEDDING_PROVIDER_OPTIONS: ProviderOption[] = [
	{ id: "openai-compatible", label: "OpenAI-compatible" },
];

const RERANK_PROVIDER_OPTIONS: ProviderOption[] = [
	{ id: "openai-compatible", label: "OpenAI-compatible" },
];

const CHAT_PROVIDER_OPTIONS: ProviderOption[] = [
	{ id: "openai-compatible", label: "OpenAI-compatible" },
];

/**
 * Creates and returns the appropriate provider instances based on current settings.
 */
export class ProviderRegistry {
	listEmbeddingProviders(): ProviderOption[] {
		return EMBEDDING_PROVIDER_OPTIONS;
	}

	listRerankProviders(): ProviderOption[] {
		return RERANK_PROVIDER_OPTIONS;
	}

	listChatProviders(): ProviderOption[] {
		return CHAT_PROVIDER_OPTIONS;
	}

	validateSettings(settings: SimpleRAGSettings): string[] {
		const errors: string[] = [];

		if (!this.hasProvider(settings.embeddingProvider, EMBEDDING_PROVIDER_OPTIONS)) {
			errors.push(`Unsupported embedding provider: ${settings.embeddingProvider}`);
		}

		if (settings.enableRerank && !this.hasProvider(settings.rerankProvider, RERANK_PROVIDER_OPTIONS)) {
			errors.push(`Unsupported rerank provider: ${settings.rerankProvider}`);
		}

		if (settings.enableAIChat && !this.hasProvider(settings.chatProvider, CHAT_PROVIDER_OPTIONS)) {
			errors.push(`Unsupported chat provider: ${settings.chatProvider}`);
		}

		if (
			settings.enableImageEmbedding &&
			settings.embeddingModel.toLowerCase().startsWith("text-embedding-")
		) {
			errors.push(
				"Image embedding requires a multimodal embedding model. The current model looks text-only."
			);
		}

		return errors;
	}

	createEmbeddingProvider(settings: SimpleRAGSettings): EmbeddingProvider {
		this.assertProvider(settings.embeddingProvider, EMBEDDING_PROVIDER_OPTIONS, "embedding");

		return new OpenAICompatibleEmbeddingProvider(
			settings.embeddingBaseUrl,
			settings.embeddingApiToken,
			settings.embeddingModel,
			settings.timeout,
			settings.retryCount,
			settings.enableImageEmbedding
		);
	}

	createRerankProvider(settings: SimpleRAGSettings): RerankProvider {
		this.assertProvider(settings.rerankProvider, RERANK_PROVIDER_OPTIONS, "rerank");

		return new OpenAICompatibleRerankProvider(
			settings.rerankBaseUrl,
			settings.rerankApiToken,
			settings.rerankModel,
			settings.timeout,
			settings.retryCount
		);
	}

	createChatProvider(settings: SimpleRAGSettings): ChatProvider {
		this.assertProvider(settings.chatProvider, CHAT_PROVIDER_OPTIONS, "chat");

		return new OpenAICompatibleChatProvider(
			settings.chatBaseUrl,
			settings.chatApiToken,
			settings.chatModel,
			settings.timeout,
			settings.retryCount
		);
	}

	private hasProvider(providerId: string, providers: ProviderOption[]): boolean {
		return providers.some((provider) => provider.id === providerId);
	}

	private assertProvider(
		providerId: string,
		providers: ProviderOption[],
		kind: string
	): void {
		if (!this.hasProvider(providerId, providers)) {
			throw new Error(`Unsupported ${kind} provider: ${providerId}`);
		}
	}
}
