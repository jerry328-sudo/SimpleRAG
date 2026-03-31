import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, SimpleRAGSettings } from "./settings/types";
import { SimpleRAGSettingTab } from "./settings/tab";
import { Database } from "./storage/db";
import { getDbPath } from "./runtime/paths";
import { RuntimeState } from "./runtime/state";
import { ProviderRegistry } from "./providers/registry";
import { registerVaultChangeTracking } from "./runtime/vault-change-tracker";
import { SimpleRAGService } from "./application/simple-rag-service";
import {
	SimpleRAGView,
	VIEW_TYPE_SIMPLE_RAG,
} from "./ui/views/search-view";
import type { SearchResult, IndexStats, ChatReference } from "./types/domain";
import { loadValidatedSettings } from "./runtime/settings-loader";

export default class SimpleRAGPlugin extends Plugin {
	settings: SimpleRAGSettings = DEFAULT_SETTINGS;
	state = new RuntimeState();
	private db!: Database;
	private service!: SimpleRAGService;
	private providerRegistry = new ProviderRegistry();

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize database
		const dbPath = getDbPath(this);
		this.db = new Database(this.app, dbPath);
		const dbWarnings = await this.db.load();
		dbWarnings.forEach((warning) => this.warnDataIssue(warning));
		this.service = new SimpleRAGService({
			app: this.app,
			db: this.db,
			state: this.state,
			providerRegistry: this.providerRegistry,
			getSettings: () => this.settings,
		});
		this.service.refreshStats();

		// Register the sidebar view
		this.registerView(VIEW_TYPE_SIMPLE_RAG, (leaf) => {
			return new SimpleRAGView(leaf, this);
		});

		// Ribbon icon to open the search panel
		this.addRibbonIcon("search", "Open search panel", () => {
			void this.activateView();
		});

		// Commands
		this.addCommand({
			id: "open-search-panel",
			name: "Open search panel",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "scan-changes",
			name: "Scan vault for changes",
			callback: async () => {
				await this.scanChanges();
				new Notice("Scan complete");
			},
		});

		this.addCommand({
			id: "update-index",
			name: "Update index",
			callback: async () => {
				await this.updateIndex();
				new Notice("Index updated");
			},
		});

		this.addCommand({
			id: "rebuild-index",
			name: "Rebuild full index",
			callback: async () => {
				await this.rebuildIndex();
				new Notice("Full rebuild complete");
			},
		});

		// Settings tab
		this.addSettingTab(new SimpleRAGSettingTab(this.app, this));

		registerVaultChangeTracking(this, this.state, () => this.settings);

		// Perform initial scan (deferred to avoid blocking startup)
		this.app.workspace.onLayoutReady(() => {
			void this.scanChanges();
		});
	}

	onunload(): void {
		void this.db.save();
	}

	async loadSettings(): Promise<void> {
		const result = await loadValidatedSettings(this);
		this.settings = result.settings;
		result.warnings.forEach((warning) => this.warnDataIssue(warning));
		if (result.shouldPersist) {
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ---- Public API for UI ----

	async scanChanges(): Promise<void> {
		try {
			const result = await this.service.scanChanges();
			this.refreshView();

			if (this.settings.enableDebugLogs) {
				console.debug(
					`[SimpleRAG] Scan: ${result.added.length} added, ${result.modified.length} modified, ${result.deleted.length} deleted`
				);
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`SimpleRAG: Scan failed — ${msg}`);
			console.error("[SimpleRAG] Scan error:", e);
		}
	}

	async updateIndex(): Promise<void> {
		try {
			const result = await this.service.updateIndex((current, total) => {
				if (this.settings.enableDebugLogs) {
					console.debug(
						`[SimpleRAG] Indexing ${current}/${total}`
					);
				}
			});

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
		}
	}

	async rebuildIndex(): Promise<void> {
		try {
			const result = await this.service.rebuildIndex(
				(current, total) => {
					if (this.settings.enableDebugLogs) {
						console.debug(
							`[SimpleRAG] Rebuilding ${current}/${total}`
						);
					}
				}
			);

			this.refreshView();

			new Notice(
				`SimpleRAG: Rebuilt index — ${result.indexed} files, ${result.errors} errors`
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`SimpleRAG: Rebuild failed — ${msg}`);
			console.error("[SimpleRAG] Rebuild error:", e);
		}
	}

	async clearIndex(): Promise<void> {
		await this.service.clearIndex();
		this.refreshView();
	}

	async search(query: string): Promise<SearchResult[]> {
		return this.service.searchText(query);
	}

	async searchByImage(imagePath: string): Promise<SearchResult[]> {
		return this.service.searchImage(imagePath);
	}

	async chat(
		question: string,
		searchResults: SearchResult[],
		history: Array<{ role: "user" | "assistant"; content: string }>
	): Promise<{ content: string; references: ChatReference[] }> {
		return this.service.chat(question, searchResults, history);
	}

	getIndexStats(): IndexStats {
		return this.service.getIndexStats();
	}

	listIndexedAssetPaths(): string[] {
		return this.service.listIndexedAssetPaths();
	}

	// ---- Private helpers ----

	private async activateView(): Promise<void> {
		const existing =
			this.app.workspace.getLeavesOfType(VIEW_TYPE_SIMPLE_RAG);
		if (existing.length > 0) {
			void this.app.workspace.revealLeaf(existing[0]!);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_SIMPLE_RAG,
				active: true,
			});
			void this.app.workspace.revealLeaf(leaf);
		}
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

	private warnDataIssue(message: string): void {
		console.warn(`[SimpleRAG] ${message}`);
		new Notice(message, 12000);
	}
}
