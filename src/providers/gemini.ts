import type { BinaryImagePayload } from "../types/media";

export const GEMINI_DEFAULT_BASE_URL =
	"https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_DEFAULT_CHAT_MODEL = "gemini-2.5-flash";
export const GEMINI_DEFAULT_TEXT_EMBEDDING_MODEL = "gemini-embedding-001";
export const GEMINI_DEFAULT_MULTIMODAL_EMBEDDING_MODEL =
	"gemini-embedding-2-preview";

export function normalizeGeminiBaseUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim();
	const normalized = (trimmed || GEMINI_DEFAULT_BASE_URL).replace(/\/+$/, "");

	if (hasExplicitGeminiApiVersion(normalized)) {
		return normalized;
	}

	return `${normalized}/v1beta`;
}

export function normalizeGeminiModelPath(modelId: string): string {
	return modelId.startsWith("models/") ? modelId : `models/${modelId}`;
}

export function isGeminiMultimodalEmbeddingModel(modelId: string): boolean {
	const normalized = modelId.replace(/^models\//, "").toLowerCase();
	return normalized.startsWith("gemini-embedding-2");
}

export function buildGeminiInlineDataPart(image: BinaryImagePayload): {
	inline_data: {
		mime_type: string;
		data: string;
	};
} {
	return {
		inline_data: {
			mime_type: image.mimeType,
			data: image.base64Data,
		},
	};
}

export function extractGeminiText(
	data: unknown
): string {
	const candidate = (data as {
		candidates?: Array<{
			content?: {
				parts?: Array<{ text?: string }>;
			};
		}>;
	})?.candidates?.[0];

	const parts = candidate?.content?.parts ?? [];
	return parts
		.map((part) => part.text ?? "")
		.filter(Boolean)
		.join("");
}

export function extractGeminiBlockReason(data: unknown): string | null {
	const promptBlock = (data as {
		promptFeedback?: { blockReason?: string };
	})?.promptFeedback?.blockReason;
	if (promptBlock) {
		return promptBlock;
	}

	const finishReason = (data as {
		candidates?: Array<{ finishReason?: string }>;
	})?.candidates?.[0]?.finishReason;
	if (finishReason && finishReason !== "STOP") {
		return finishReason;
	}

	return null;
}

function hasExplicitGeminiApiVersion(baseUrl: string): boolean {
	return /\/v\d+(?:alpha|beta)?$/i.test(baseUrl);
}
