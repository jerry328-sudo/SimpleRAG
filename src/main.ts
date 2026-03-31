import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, SimpleRAGSettings, getIndexMode } from "./settings/types";
import { SimpleRAGSettingTab } from "./settings/tab";
import { Database } from "./storage/db";
import { getDbPath, getStorageDir } from "./runtime/paths";
import { RuntimeState } from "./runtime/state";
import { ProviderRegistry } from "./providers/registry";
import { VaultScanner } from "./indexing/scanner";
import { IndexManager } from "./indexing/index-manager";
import { QueryService } from "./search/query-service";
import { ConversationService } from "./chat/conversation-service";
import {
	SimpleRAGView,
	VIEW_TYPE_SIMPLE_RAG,
} from "./ui/views/search-view";
import type { SearchResult, IndexStats, ChatReference } from "./types/domain";

export default class SimpleRAGPlugin extends Plugin {
	settings: SimpleRAGSettings = DEFAULT_SETTINGS;
	db!: Database;
	state = new RuntimeState();
	private providerRegistry = new ProviderRegistry();

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize database
		const dbPath = getDbPath(this);
		this.db = new Database(this.app, dbPath);
		await this.db.load();

		// Register the sidebar view
		this.registerView(VIEW_TYPE_SIMPLE_RAG, (leaf) => {
			return new SimpleRAGView(leaf, this);
		});

		// Ribbon icon to open the search panel
		this.addRibbonIcon("search", "SimpleRAG", () => {
			this.activateView();
		});

		// Commands
		this.addCommand({
			id: "open-search-panel",
			name: "Open search panel",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "scan-changes",
			name: "Scan vault for changes",
			callback: async () => {
				await this.scanChanges();
				new Notice("SimpleRAG: Scan complete");
			},
		});

		this.addCommand({
			id: "update-index",
			name: "Update index",
			callback: async () => {
				await this.updateIndex();
				new Notice("SimpleRAG: Index updated");
			},
		});

		this.addCommand({
			id: "rebuild-index",
			name: "Rebuild full index",
			callback: async () => {
				await this.rebuildIndex();
				new Notice("SimpleRAG: Full rebuild complete");
			},
		});

		// Settings tab
		this.addSettingTab(new SimpleRAGSettingTab(this.app, this));

		// Listen for vault events
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if ("extension" in file && file.extension === "md") {
					this.state.markDirty(file.path);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if ("extension" in file && file.extension === "md") {
					this.state.markDirty(file.path);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.state.markDirty(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.state.markDirty(oldPath);
				if ("extension" in file && file.extension === "md") {
					this.state.markDirty(file.path);
				}
			})
		);

		// Perform initial scan (deferred to avoid blocking startup)
		this.app.workspace.onLayoutReady(async () => {
			await this.scanChanges();
		});
	}

	async onunload(): Promise<void> {
		await this.db.save();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SimpleRAGSettings>
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ---- Public API for UI ----

	async scanChanges(): Promise<void> {
		if (this.state.isScanning) return;
		this.state.isScanning = true;

		try {
			const scanner = new VaultScanner(this.app, this.db);
			const result = await scanner.scan();

			// Merge scanner-found dirty files with runtime state
			for (const path of this.state.dirtyFiles) {
				const file = this.db.getFile(path);
				if (file && file.status !== "dirty") {
					this.db.upsertFile({ ...file, status: "dirty" });
				}
			}

			this.refreshStats();
			this.refreshView();

			if (this.settings.enableDebugLogs) {
				console.log(
					`[SimpleRAG] Scan: ${result.added.length} added, ${result.modified.length} modified, ${result.deleted.length} deleted`
				);
			}
		} finally {
			this.state.isScanning = false;
		}
	}

	async updateIndex(): Promise<void> {
		if (this.state.isIndexing) {
			new Notice("SimpleRAG: Indexing already in progress");
			return;
		}

		if (!this.settings.embeddingApiToken) {
			new Notice("SimpleRAG: Please configure an embedding API token in settings");
			return;
		}

		this.state.isIndexing = true;

		try {
			const embeddingProvider =
				this.providerRegistry.createEmbeddingProvider(this.settings);

			const indexManager = new IndexManager(
				this.app,
				this.db,
				this.settings,
				this.state,
				embeddingProvider
			);

			const result = await indexManager.updateIndex((current, total) => {
				if (this.settings.enableDebugLogs) {
					console.log(
						`[SimpleRAG] Indexing ${current}/${total}`
					);
				}
			});

			this.state.clearDirty();
			this.refreshStats();
			this.refreshView();

			if (result.errors > 0) {
				new Notice(
					`SimpleRAG: Indexed ${result.indexed} files, ${result.errors} errors`
				);
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`SimpleRAG: Index failed — ${msg}`);
			console.error("[SimpleRAG] Index error:", e);
		} finally {
			this.state.isIndexing = false;
		}
	}

	async rebuildIndex(): Promise<void> {
		if (this.state.isIndexing) {
			new Notice("SimpleRAG: Indexing already in progress");
			return;
		}

		if (!this.settings.embeddingApiToken) {
			new Notice("SimpleRAG: Please configure an embedding API token in settings");
			return;
		}

		this.state.isIndexing = true;

		try {
			const embeddingProvider =
				this.providerRegistry.createEmbeddingProvider(this.settings);

			const indexManager = new IndexManager(
				this.app,
				this.db,
				this.settings,
				this.state,
				embeddingProvider
			);

			const result = await indexManager.rebuildIndex(
				(current, total) => {
					if (this.settings.enableDebugLogs) {
						console.log(
							`[SimpleRAG] Rebuilding ${current}/${total}`
						);
					}
				}
			);

			this.state.clearDirty();
			this.refreshStats();
			this.refreshView();

			new Notice(
				`SimpleRAG: Rebuilt index — ${result.indexed} files, ${result.errors} errors`
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`SimpleRAG: Rebuild failed — ${msg}`);
			console.error("[SimpleRAG] Rebuild error:", e);
		} finally {
			this.state.isIndexing = false;
		}
	}

	async clearIndex(): Promise<void> {
		this.db.clearAll();
		await this.db.save();
		this.state.clearDirty();
		this.refreshStats();
		this.refreshView();
	}

	async search(query: string): Promise<SearchResult[]> {
		if (!this.settings.embeddingApiToken) {
			throw new Error("Please configure an embedding API token in settings");
		}

		const embeddingProvider =
			this.providerRegistry.createEmbeddingProvider(this.settings);

		let rerankProvider = null;
		if (this.settings.enableRerank && this.settings.rerankApiToken) {
			rerankProvider =
				this.providerRegistry.createRerankProvider(this.settings);
		}

		const queryService = new QueryService(
			this.db,
			this.settings,
			embeddingProvider,
			rerankProvider
		);

		return queryService.search(query);
	}

	async chat(
		question: string,
		searchResults: SearchResult[],
		history: Array<{ role: "user" | "assistant"; content: string }>
	): Promise<{ content: string; references: ChatReference[] }> {
		if (!this.settings.chatApiToken) {
			throw new Error("Please configure a chat API token in settings");
		}

		const chatProvider =
			this.providerRegistry.createChatProvider(this.settings);

		const conversation = new ConversationService(
			this.app,
			this.db,
			this.settings,
			chatProvider
		);

		return conversation.chat(question, searchResults, history);
	}

	getIndexStats(): IndexStats {
		const dbStats = this.db.getStats();
		const lastScanAt = this.db.getMeta("last_scan_at");
		const lastIndexAt = this.db.getMeta("last_index_at");

		return {
			indexMode: getIndexMode(this.settings),
			lastScanAt: lastScanAt ? parseInt(lastScanAt, 10) : null,
			lastIndexAt: lastIndexAt ? parseInt(lastIndexAt, 10) : null,
			totalNotes: dbStats.totalNotes,
			totalChunks: dbStats.totalChunks,
			totalAssets: dbStats.totalAssets,
			dirtyFiles: dbStats.dirtyFiles + this.state.getDirtyCount(),
		};
	}

	// ---- Private helpers ----

	private async activateView(): Promise<void> {
		const existing =
			this.app.workspace.getLeavesOfType(VIEW_TYPE_SIMPLE_RAG);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]!);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_SIMPLE_RAG,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	private refreshStats(): void {
		this.state.lastStats = this.getIndexStats();
	}

	private refreshView(): void {
		const leaves =
			this.app.workspace.getLeavesOfType(VIEW_TYPE_SIMPLE_RAG);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof SimpleRAGView) {
				view.refresh();
			}
		}
	}
}
