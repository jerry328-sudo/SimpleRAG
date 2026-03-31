import type { SimpleRAGSettings } from "../settings/types";
import type {
	ChatProvider,
	EmbeddingProvider,
	RerankProvider,
} from "./types";
import { GeminiChatProvider } from "./chat/gemini";
import { OpenAICompatibleChatProvider } from "./chat/openai-compatible";
import { GeminiEmbeddingProvider } from "./embedding/gemini";
import { OpenAICompatibleEmbeddingProvider } from "./embedding/openai-compatible";
import { OpenAICompatibleRerankProvider } from "./rerank/openai-compatible";
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

interface EmbeddingProviderDefinition extends ProviderOption {
	create(settings: SimpleRAGSettings): EmbeddingProvider;
	validate?(settings: SimpleRAGSettings): string | null;
}

interface RerankProviderDefinition extends ProviderOption {
	create(settings: SimpleRAGSettings): RerankProvider;
}

interface ChatProviderDefinition extends ProviderOption {
	create(settings: SimpleRAGSettings): ChatProvider;
}

export const EMBEDDING_PROVIDERS: EmbeddingProviderDefinition[] = [
	{
		id: "openai-compatible",
		label: "OpenAI-compatible",
		defaultBaseUrl: "https://api.openai.com/v1",
		defaultModel: "text-embedding-3-small",
		multimodalModel: "text-embedding-3-small",
		validate(settings) {
			if (
				settings.enableImageEmbedding &&
				settings.embeddingModel.toLowerCase().startsWith("text-embedding-")
			) {
				return "Image embedding requires a multimodal embedding model. The current model looks text-only.";
			}
			return null;
		},
		create(settings) {
			return new OpenAICompatibleEmbeddingProvider(
				settings.embeddingBaseUrl,
				settings.embeddingApiToken,
				settings.embeddingModel,
				settings.timeout,
				settings.retryCount,
				settings.enableImageEmbedding
			);
		},
	},
	{
		id: "gemini",
		label: "Gemini",
		defaultBaseUrl: GEMINI_DEFAULT_BASE_URL,
		defaultModel: GEMINI_DEFAULT_TEXT_EMBEDDING_MODEL,
		multimodalModel: GEMINI_DEFAULT_MULTIMODAL_EMBEDDING_MODEL,
		validate(settings) {
			if (
				settings.enableImageEmbedding &&
				!isGeminiMultimodalEmbeddingModel(settings.embeddingModel)
			) {
				return "Gemini image embedding requires a multimodal Gemini embedding model such as gemini-embedding-2-preview.";
			}
			return null;
		},
		create(settings) {
			return new GeminiEmbeddingProvider(
				settings.embeddingBaseUrl,
				settings.embeddingApiToken,
				settings.embeddingModel,
				settings.timeout,
				settings.retryCount
			);
		},
	},
];

export const RERANK_PROVIDERS: RerankProviderDefinition[] = [
	{
		id: "openai-compatible",
		label: "OpenAI-compatible",
		defaultBaseUrl: "https://api.openai.com/v1",
		defaultModel: "rerank-v1",
		create(settings) {
			return new OpenAICompatibleRerankProvider(
				settings.rerankBaseUrl,
				settings.rerankApiToken,
				settings.rerankModel,
				settings.timeout,
				settings.retryCount
			);
		},
	},
];

export const CHAT_PROVIDERS: ChatProviderDefinition[] = [
	{
		id: "openai-compatible",
		label: "OpenAI-compatible",
		defaultBaseUrl: "https://api.openai.com/v1",
		defaultModel: "gpt-4o-mini",
		create(settings) {
			return new OpenAICompatibleChatProvider(
				settings.chatBaseUrl,
				settings.chatApiToken,
				settings.chatModel,
				settings.timeout,
				settings.retryCount
			);
		},
	},
	{
		id: "gemini",
		label: "Gemini",
		defaultBaseUrl: GEMINI_DEFAULT_BASE_URL,
		defaultModel: GEMINI_DEFAULT_CHAT_MODEL,
		create(settings) {
			return new GeminiChatProvider(
				settings.chatBaseUrl,
				settings.chatApiToken,
				settings.chatModel,
				settings.timeout,
				settings.retryCount
			);
		},
	},
];

function findProvider<T extends ProviderOption>(
	providers: T[],
	providerId: string
): T | undefined {
	return providers.find((provider) => provider.id === providerId);
}

export function getEmbeddingProviderOption(
	providerId: string
): ProviderOption | undefined {
	return findProvider(EMBEDDING_PROVIDERS, providerId);
}

export function getRerankProviderOption(
	providerId: string
): ProviderOption | undefined {
	return findProvider(RERANK_PROVIDERS, providerId);
}

export function getChatProviderOption(
	providerId: string
): ProviderOption | undefined {
	return findProvider(CHAT_PROVIDERS, providerId);
}

export function getRecommendedEmbeddingModel(
	providerId: string,
	enableImageEmbedding: boolean
): string {
	const option = getEmbeddingProviderOption(providerId);
	if (!option) {
		return "";
	}

	if (enableImageEmbedding) {
		return option.multimodalModel ?? option.defaultModel ?? "";
	}

	return option.defaultModel ?? option.multimodalModel ?? "";
}

export function applyEmbeddingProviderDefaults(
	settings: SimpleRAGSettings,
	previousProviderId: string,
	nextProviderId: string
): void {
	const previous = getEmbeddingProviderOption(previousProviderId);
	const next = getEmbeddingProviderOption(nextProviderId);
	if (!next) {
		return;
	}

	if (
		!settings.embeddingBaseUrl.trim() ||
		settings.embeddingBaseUrl === previous?.defaultBaseUrl
	) {
		settings.embeddingBaseUrl = next.defaultBaseUrl ?? "";
	}

	const currentModel = settings.embeddingModel.trim();
	const previousDefaults = new Set(
		[previous?.defaultModel, previous?.multimodalModel].filter(Boolean)
	);
	if (!currentModel || previousDefaults.has(currentModel)) {
		settings.embeddingModel = getRecommendedEmbeddingModel(
			nextProviderId,
			settings.enableImageEmbedding
		);
	}
}

export function syncEmbeddingModelToCurrentMode(
	settings: SimpleRAGSettings
): void {
	const option = getEmbeddingProviderOption(settings.embeddingProvider);
	if (!option) {
		return;
	}

	const currentModel = settings.embeddingModel.trim();
	const knownDefaults = new Set(
		[option.defaultModel, option.multimodalModel].filter(Boolean)
	);
	if (!currentModel || knownDefaults.has(currentModel)) {
		settings.embeddingModel = getRecommendedEmbeddingModel(
			settings.embeddingProvider,
			settings.enableImageEmbedding
		);
	}
}

export function applyChatProviderDefaults(
	settings: SimpleRAGSettings,
	previousProviderId: string,
	nextProviderId: string
): void {
	const previous = getChatProviderOption(previousProviderId);
	const next = getChatProviderOption(nextProviderId);
	if (!next) {
		return;
	}

	if (
		!settings.chatBaseUrl.trim() ||
		settings.chatBaseUrl === previous?.defaultBaseUrl
	) {
		settings.chatBaseUrl = next.defaultBaseUrl ?? "";
	}

	if (
		!settings.chatModel.trim() ||
		settings.chatModel === previous?.defaultModel
	) {
		settings.chatModel = next.defaultModel ?? "";
	}
}

export function validateEmbeddingProviderSettings(
	settings: SimpleRAGSettings
): string | null {
	return (
		findProvider(EMBEDDING_PROVIDERS, settings.embeddingProvider)?.validate?.(
			settings
		) ?? null
	);
}
