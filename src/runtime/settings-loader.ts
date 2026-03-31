import type { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	type SimpleRAGSettings,
} from "../settings/types";
import { getConfigPath } from "./paths";

export interface SettingsLoadResult {
	settings: SimpleRAGSettings;
	warnings: string[];
	shouldPersist: boolean;
}

export async function loadValidatedSettings(
	plugin: Plugin
): Promise<SettingsLoadResult> {
	const configPath = getConfigPath(plugin);
	const adapter = plugin.app.vault.adapter;

	if (!(await adapter.exists(configPath))) {
		return {
			settings: { ...DEFAULT_SETTINGS },
			warnings: [],
			shouldPersist: false,
		};
	}

	try {
		const rawContent = await adapter.read(configPath);
		const parsed = JSON.parse(rawContent) as unknown;

		if (!isValidPartialSettings(parsed)) {
			const backupPath = await quarantineFile(adapter, configPath);
			return {
				settings: { ...DEFAULT_SETTINGS },
				warnings: [
					`SimpleRAG settings were invalid and moved to ${backupPath}. Default settings were loaded instead.`,
				],
				shouldPersist: true,
			};
		}

		return {
			settings: {
				...DEFAULT_SETTINGS,
				...parsed,
			},
			warnings: [],
			shouldPersist: false,
		};
	} catch {
		const backupPath = await quarantineFile(adapter, configPath);
		return {
			settings: { ...DEFAULT_SETTINGS },
			warnings: [
				`SimpleRAG settings could not be parsed and were moved to ${backupPath}. Default settings were loaded instead.`,
			],
			shouldPersist: true,
		};
	}
}

function isValidPartialSettings(
	value: unknown
): value is Partial<SimpleRAGSettings> {
	if (!isPlainObject(value)) {
		return false;
	}

	const record = value as Record<string, unknown>;
	return (
		isOptionalString(record.embeddingProvider) &&
		isOptionalString(record.embeddingModel) &&
		isOptionalString(record.embeddingBaseUrl) &&
		isOptionalString(record.embeddingApiToken) &&
		isOptionalBoolean(record.enableImageEmbedding) &&
		isOptionalBoolean(record.enableAIChat) &&
		isOptionalBoolean(record.enableRerank) &&
		isOptionalString(record.rerankProvider) &&
		isOptionalString(record.rerankModel) &&
		isOptionalPositiveNumber(record.recallPoolSize) &&
		isOptionalPositiveNumber(record.resultsPerQuery) &&
		isOptionalEnum(record.defaultResultTab, ["all", "notes", "images"]) &&
		isOptionalString(record.chatProvider) &&
		isOptionalString(record.chatModel) &&
		isOptionalString(record.chatBaseUrl) &&
		isOptionalString(record.chatApiToken) &&
		isOptionalPositiveNumber(record.shortNoteThreshold) &&
		isOptionalPositiveNumber(record.maxNotesInChatContext) &&
		isOptionalNonNegativeNumber(record.longNoteContextWindow) &&
		isOptionalBoolean(record.enableAIEvidenceSelection) &&
		isOptionalString(record.rerankBaseUrl) &&
		isOptionalString(record.rerankApiToken) &&
		isOptionalPositiveNumber(record.timeout) &&
		isOptionalNonNegativeNumber(record.retryCount) &&
		isOptionalPositiveNumber(record.maxConcurrentRequests) &&
		isOptionalBoolean(record.showSimilarityScores) &&
		isOptionalBoolean(record.enableDebugLogs)
	);
}

async function quarantineFile(
	adapter: Plugin["app"]["vault"]["adapter"],
	path: string
): Promise<string> {
	const backupPath = await nextBackupPath(adapter, path);
	await adapter.rename(path, backupPath);
	return backupPath;
}

async function nextBackupPath(
	adapter: Plugin["app"]["vault"]["adapter"],
	path: string
): Promise<string> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const dotIndex = path.lastIndexOf(".");
	const base = dotIndex >= 0 ? path.slice(0, dotIndex) : path;
	const ext = dotIndex >= 0 ? path.slice(dotIndex) : "";

	let attempt = 0;
	while (true) {
		const suffix =
			attempt === 0 ? `.corrupt-${timestamp}` : `.corrupt-${timestamp}-${attempt}`;
		const candidate = `${base}${suffix}${ext}`;
		if (!(await adapter.exists(candidate))) {
			return candidate;
		}
		attempt += 1;
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
	return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): boolean {
	return value === undefined || typeof value === "boolean";
}

function isOptionalPositiveNumber(value: unknown): boolean {
	return value === undefined || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

function isOptionalNonNegativeNumber(value: unknown): boolean {
	return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isOptionalEnum<T extends string>(
	value: unknown,
	allowed: T[]
): boolean {
	return value === undefined || (typeof value === "string" && allowed.includes(value as T));
}
