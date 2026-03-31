import type { App } from "obsidian";
import { ContextBuilder } from "../chat/context-builder";
import { ConversationService } from "../chat/conversation-service";
import { IndexManager } from "../indexing/index-manager";
import { VaultScanner } from "../indexing/scanner";
import type { RuntimeState } from "../runtime/state";
import { getIndexMode, type SimpleRAGSettings } from "../settings/types";
import type { Database } from "../storage/db";
import type { ChatReference, IndexStats, SearchResult } from "../types/domain";
import { ProviderRegistry } from "../providers/registry";
import { QueryService } from "../search/query-service";

export class SimpleRAGService {
	private app: App;
	private db: Database;
	private state: RuntimeState;
	private providerRegistry: ProviderRegistry;
	private getSettings: () => SimpleRAGSettings;

	constructor(options: {
		app: App;
		db: Database;
		state: RuntimeState;
		providerRegistry: ProviderRegistry;
		getSettings: () => SimpleRAGSettings;
	}) {
		this.app = options.app;
		this.db = options.db;
		this.state = options.state;
		this.providerRegistry = options.providerRegistry;
		this.getSettings = options.getSettings;
	}

	async scanChanges(): Promise<{
		added: string[];
		modified: string[];
		deleted: string[];
	}> {
		if (this.state.isScanning) {
			return { added: [], modified: [], deleted: [] };
		}
		this.state.isScanning = true;

		try {
			const scanner = new VaultScanner(
				this.app,
				this.db,
				this.getSettings()
			);
			const result = await scanner.scan();

			for (const path of this.state.dirtyFiles) {
				const file = this.db.getFile(path);
				if (file && file.status !== "dirty") {
					this.db.upsertFile({ ...file, status: "dirty" });
				}
			}

			this.refreshStats();
			return result;
		} finally {
			this.state.isScanning = false;
		}
	}

	async updateIndex(
		onProgress?: (current: number, total: number) => void
	): Promise<{ indexed: number; errors: number }> {
		if (this.state.isIndexing) {
			throw new Error("Indexing already in progress");
		}

		const settings = this.getSettings();
		this.assertEmbeddingReady(settings);
		this.state.isIndexing = true;

		try {
			const manager = new IndexManager(
				this.app,
				this.db,
				settings,
				this.state,
				this.providerRegistry.createEmbeddingProvider(settings)
			);
			const result = await manager.updateIndex(onProgress);
			this.state.clearDirty();
			this.refreshStats();
			return result;
		} finally {
			this.state.isIndexing = false;
		}
	}

	async rebuildIndex(
		onProgress?: (current: number, total: number) => void
	): Promise<{ indexed: number; errors: number }> {
		if (this.state.isIndexing) {
			throw new Error("Indexing already in progress");
		}

		const settings = this.getSettings();
		this.assertEmbeddingReady(settings);
		this.state.isIndexing = true;

		try {
			const manager = new IndexManager(
				this.app,
				this.db,
				settings,
				this.state,
				this.providerRegistry.createEmbeddingProvider(settings)
			);
			const result = await manager.rebuildIndex(onProgress);
			this.state.clearDirty();
			this.refreshStats();
			return result;
		} finally {
			this.state.isIndexing = false;
		}
	}

	async clearIndex(): Promise<void> {
		this.db.clearAll();
		await this.db.save();
		this.state.clearDirty();
		this.refreshStats();
	}

	async searchText(query: string): Promise<SearchResult[]> {
		const settings = this.getSettings();
		this.assertEmbeddingReady(settings);

		const rerankProvider =
			settings.enableRerank && settings.rerankApiToken
				? this.providerRegistry.createRerankProvider(settings)
				: null;

		const queryService = new QueryService(
			this.app,
			this.db,
			settings,
			this.providerRegistry.createEmbeddingProvider(settings),
			rerankProvider
		);

		return queryService.searchText(query);
	}

	async searchImage(imagePath: string): Promise<SearchResult[]> {
		const settings = this.getSettings();
		this.assertEmbeddingReady(settings);
		if (!settings.enableImageEmbedding) {
			throw new Error("Enable image embedding before running image search.");
		}

		const rerankProvider =
			settings.enableRerank && settings.rerankApiToken
				? this.providerRegistry.createRerankProvider(settings)
				: null;

		const queryService = new QueryService(
			this.app,
			this.db,
			settings,
			this.providerRegistry.createEmbeddingProvider(settings),
			rerankProvider
		);

		return queryService.searchImage(imagePath);
	}

	async chat(
		question: string,
		searchResults: SearchResult[],
		history: Array<{ role: "user" | "assistant"; content: string }>
	): Promise<{ content: string; references: ChatReference[] }> {
		const settings = this.getSettings();
		if (!settings.chatApiToken) {
			throw new Error("Please configure a chat API token in settings");
		}

		const validationErrors = this.providerRegistry.validateSettings(settings);
		if (validationErrors.length > 0) {
			throw new Error(validationErrors[0]!);
		}

		const service = new ConversationService(
			this.app,
			this.db,
			settings,
			this.providerRegistry.createChatProvider(settings)
		);
		return service.chat(question, searchResults, history);
	}

	getIndexStats(): IndexStats {
		const settings = this.getSettings();
		const dbStats = this.db.getStats();
		const lastScanAt = this.db.getMeta("last_scan_at");
		const lastIndexAt = this.db.getMeta("last_index_at");

		return {
			indexMode: getIndexMode(settings),
			lastScanAt: lastScanAt ? parseInt(lastScanAt, 10) : null,
			lastIndexAt: lastIndexAt ? parseInt(lastIndexAt, 10) : null,
			totalNotes: dbStats.totalNotes,
			totalChunks: dbStats.totalChunks,
			totalAssets: dbStats.totalAssets,
			dirtyFiles: dbStats.dirtyFiles + this.state.getDirtyCount(),
		};
	}

	listIndexedAssetPaths(): string[] {
		return this.db
			.getAllAssets()
			.map((asset) => asset.asset_path)
			.sort((a, b) => a.localeCompare(b));
	}

	refreshStats(): void {
		this.state.lastStats = this.getIndexStats();
	}

	private assertEmbeddingReady(settings: SimpleRAGSettings): void {
		if (!settings.embeddingApiToken) {
			throw new Error("Please configure an embedding API token in settings");
		}

		const validationErrors = this.providerRegistry.validateSettings(settings);
		if (validationErrors.length > 0) {
			throw new Error(validationErrors[0]!);
		}
	}
}
