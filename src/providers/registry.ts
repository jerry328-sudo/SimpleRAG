import type { SimpleRAGSettings } from "../settings/types";
import type {
	EmbeddingProvider,
	RerankProvider,
	ChatProvider,
} from "./types";
import { OpenAICompatibleEmbeddingProvider } from "./embedding/openai-compatible";
import { OpenAICompatibleRerankProvider } from "./rerank/openai-compatible";
import { OpenAICompatibleChatProvider } from "./chat/openai-compatible";
import { GeminiEmbeddingProvider } from "./embedding/gemini";
import { GeminiChatProvider } from "./chat/gemini";
import {
	GEMINI_DEFAULT_BASE_URL,
	GEMINI_DEFAULT_CHAT_MODEL,
	GEMINI_DEFAULT_MULTIMODAL_EMBEDDING_MODEL,
	GEMINI_DEFAULT_TEXT_EMBEDDING_MODEL,
	isGeminiMultimodalEmbeddingModel,
} from "./gemini";

export interface ProviderOption {
	id: string;
	label: string;
	defaultBaseUrl?: string;
	defaultModel?: string;
	multimodalModel?: string;
}

const EMBEDDING_PROVIDER_OPTIONS: ProviderOption[] = [
	{
		id: "openai-compatible",
		label: "OpenAI-compatible",
		defaultBaseUrl: "https://api.openai.com/v1",
		defaultModel: "text-embedding-3-small",
		multimodalModel: "text-embedding-3-small",
	},
	{
		id: "gemini",
		label: "Gemini",
		defaultBaseUrl: GEMINI_DEFAULT_BASE_URL,
		defaultModel: GEMINI_DEFAULT_TEXT_EMBEDDING_MODEL,
		multimodalModel: GEMINI_DEFAULT_MULTIMODAL_EMBEDDING_MODEL,
	},
];

const RERANK_PROVIDER_OPTIONS: ProviderOption[] = [
	{
		id: "openai-compatible",
		label: "OpenAI-compatible",
		defaultBaseUrl: "https://api.openai.com/v1",
		defaultModel: "rerank-v1",
	},
];

const CHAT_PROVIDER_OPTIONS: ProviderOption[] = [
	{
		id: "openai-compatible",
		label: "OpenAI-compatible",
		defaultBaseUrl: "https://api.openai.com/v1",
		defaultModel: "gpt-4o-mini",
	},
	{
		id: "gemini",
		label: "Gemini",
		defaultBaseUrl: GEMINI_DEFAULT_BASE_URL,
		defaultModel: GEMINI_DEFAULT_CHAT_MODEL,
	},
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

	getEmbeddingProviderOption(providerId: string): ProviderOption | undefined {
		return EMBEDDING_PROVIDER_OPTIONS.find((provider) => provider.id === providerId);
	}

	getRerankProviderOption(providerId: string): ProviderOption | undefined {
		return RERANK_PROVIDER_OPTIONS.find((provider) => provider.id === providerId);
	}

	getChatProviderOption(providerId: string): ProviderOption | undefined {
		return CHAT_PROVIDER_OPTIONS.find((provider) => provider.id === providerId);
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

		if (settings.enableImageEmbedding) {
			if (
				settings.embeddingProvider === "gemini" &&
				!isGeminiMultimodalEmbeddingModel(settings.embeddingModel)
			) {
				errors.push(
					"Gemini image embedding requires a multimodal Gemini embedding model such as gemini-embedding-2-preview."
				);
			} else if (
				settings.embeddingProvider === "openai-compatible" &&
				settings.embeddingModel.toLowerCase().startsWith("text-embedding-")
			) {
				errors.push(
					"Image embedding requires a multimodal embedding model. The current model looks text-only."
				);
			}
		}

		return errors;
	}

	createEmbeddingProvider(settings: SimpleRAGSettings): EmbeddingProvider {
		this.assertProvider(settings.embeddingProvider, EMBEDDING_PROVIDER_OPTIONS, "embedding");

		switch (settings.embeddingProvider) {
			case "gemini":
				return new GeminiEmbeddingProvider(
					settings.embeddingBaseUrl,
					settings.embeddingApiToken,
					settings.embeddingModel,
					settings.timeout,
					settings.retryCount
				);
			case "openai-compatible":
			default:
				return new OpenAICompatibleEmbeddingProvider(
					settings.embeddingBaseUrl,
					settings.embeddingApiToken,
					settings.embeddingModel,
					settings.timeout,
					settings.retryCount,
					settings.enableImageEmbedding
				);
		}
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

		switch (settings.chatProvider) {
			case "gemini":
				return new GeminiChatProvider(
					settings.chatBaseUrl,
					settings.chatApiToken,
					settings.chatModel,
					settings.timeout,
					settings.retryCount
				);
			case "openai-compatible":
			default:
				return new OpenAICompatibleChatProvider(
					settings.chatBaseUrl,
					settings.chatApiToken,
					settings.chatModel,
					settings.timeout,
					settings.retryCount
				);
		}
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
