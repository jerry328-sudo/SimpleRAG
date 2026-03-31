import type { SimpleRAGSettings } from "../settings/types";
import type {
	ChatProvider,
	EmbeddingProvider,
	RerankProvider,
} from "./types";
import {
	CHAT_PROVIDERS,
	EMBEDDING_PROVIDERS,
	RERANK_PROVIDERS,
	getChatProviderOption,
	getEmbeddingProviderOption,
	getRerankProviderOption,
	type ProviderOption,
	validateEmbeddingProviderSettings,
} from "./catalog";

export class ProviderRegistry {
	listEmbeddingProviders(): ProviderOption[] {
		return EMBEDDING_PROVIDERS;
	}

	listRerankProviders(): ProviderOption[] {
		return RERANK_PROVIDERS;
	}

	listChatProviders(): ProviderOption[] {
		return CHAT_PROVIDERS;
	}

	getEmbeddingProviderOption(providerId: string): ProviderOption | undefined {
		return getEmbeddingProviderOption(providerId);
	}

	getRerankProviderOption(providerId: string): ProviderOption | undefined {
		return getRerankProviderOption(providerId);
	}

	getChatProviderOption(providerId: string): ProviderOption | undefined {
		return getChatProviderOption(providerId);
	}

	validateSettings(settings: SimpleRAGSettings): string[] {
		const errors: string[] = [];

		if (!getEmbeddingProviderOption(settings.embeddingProvider)) {
			errors.push(
				`Unsupported embedding provider: ${settings.embeddingProvider}`
			);
		}

		if (
			settings.enableRerank &&
			!getRerankProviderOption(settings.rerankProvider)
		) {
			errors.push(
				`Unsupported rerank provider: ${settings.rerankProvider}`
			);
		}

		if (
			settings.enableAIChat &&
			!getChatProviderOption(settings.chatProvider)
		) {
			errors.push(`Unsupported chat provider: ${settings.chatProvider}`);
		}

		const embeddingError = validateEmbeddingProviderSettings(settings);
		if (embeddingError) {
			errors.push(embeddingError);
		}

		return errors;
	}

	createEmbeddingProvider(settings: SimpleRAGSettings): EmbeddingProvider {
		const definition = EMBEDDING_PROVIDERS.find(
			(provider) => provider.id === settings.embeddingProvider
		);
		if (!definition) {
			throw new Error(
				`Unsupported embedding provider: ${settings.embeddingProvider}`
			);
		}
		return definition.create(settings);
	}

	createRerankProvider(settings: SimpleRAGSettings): RerankProvider {
		const definition = RERANK_PROVIDERS.find(
			(provider) => provider.id === settings.rerankProvider
		);
		if (!definition) {
			throw new Error(
				`Unsupported rerank provider: ${settings.rerankProvider}`
			);
		}
		return definition.create(settings);
	}

	createChatProvider(settings: SimpleRAGSettings): ChatProvider {
		const definition = CHAT_PROVIDERS.find(
			(provider) => provider.id === settings.chatProvider
		);
		if (!definition) {
			throw new Error(
				`Unsupported chat provider: ${settings.chatProvider}`
			);
		}
		return definition.create(settings);
	}
}
