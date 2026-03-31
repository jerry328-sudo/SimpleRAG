import { ItemView, WorkspaceLeaf } from "obsidian";
import type SimpleRAGPlugin from "../../main";
import type { SearchResult, ChatReference } from "../../types/domain";
import { getIndexMode } from "../../settings/types";

export const VIEW_TYPE_SIMPLE_RAG = "simple-rag-view";

export class SimpleRAGView extends ItemView {
	plugin: SimpleRAGPlugin;
	private searchResults: SearchResult[] = [];
	private chatHistory: Array<{
		role: "user" | "assistant";
		content: string;
	}> = [];
	private activeTab: "all" | "notes" | "images" = "all";

	constructor(leaf: WorkspaceLeaf, plugin: SimpleRAGPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SIMPLE_RAG;
	}

	getDisplayText(): string {
		return "SimpleRAG";
	}

	getIcon(): string {
		return "search";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("simple-rag-container");

		this.renderStatusPanel(container);
		this.renderSearchBox(container);
		this.renderResultTabs(container);
		this.renderResultList(container);

		if (this.plugin.settings.enableAIChat) {
			this.renderChatPanel(container);
		}
	}

	// ---- Status Panel ----
	private renderStatusPanel(container: HTMLElement): void {
		const panel = container.createDiv("simple-rag-status-panel");

		const stats = this.plugin.getIndexStats();
		const mode = getIndexMode(this.plugin.settings);

		const statusLine = panel.createDiv("simple-rag-status-line");
		statusLine.createSpan({
			text: `${mode}`,
			cls: "simple-rag-badge",
		});
		statusLine.createSpan({
			text: `${stats.totalNotes} notes · ${stats.totalChunks} chunks`,
		});
		if (stats.dirtyFiles > 0) {
			statusLine.createSpan({
				text: ` · ${stats.dirtyFiles} pending`,
				cls: "simple-rag-dirty-count",
			});
		}

		const buttons = panel.createDiv("simple-rag-status-buttons");

		const scanBtn = buttons.createEl("button", { text: "Scan" });
		scanBtn.addEventListener("click", async () => {
			scanBtn.disabled = true;
			scanBtn.setText("Scanning…");
			await this.plugin.scanChanges();
			this.render();
		});

		const indexBtn = buttons.createEl("button", { text: "Update index" });
		indexBtn.addEventListener("click", async () => {
			indexBtn.disabled = true;
			indexBtn.setText("Indexing…");
			await this.plugin.updateIndex();
			this.render();
		});
	}

	// ---- Search Box ----
	private renderSearchBox(container: HTMLElement): void {
		const searchBox = container.createDiv("simple-rag-search-box");

		const input = searchBox.createEl("input", {
			type: "text",
			placeholder: "Search your vault…",
			cls: "simple-rag-search-input",
		});

		const searchBtn = searchBox.createEl("button", {
			text: "Search",
			cls: "simple-rag-search-btn",
		});

		const doSearch = async () => {
			const query = input.value.trim();
			if (!query) return;

			searchBtn.disabled = true;
			searchBtn.setText("Searching…");

			try {
				this.searchResults = await this.plugin.search(query);
				this.chatHistory = [];
				this.currentReferences = [];
				this.render();
			} catch (e) {
				const msg =
					e instanceof Error ? e.message : "Search failed";
				this.showError(container, msg);
				searchBtn.disabled = false;
				searchBtn.setText("Search");
			}
		};

		searchBtn.addEventListener("click", doSearch);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				doSearch();
			}
		});
	}

	// ---- Result Tabs ----
	private renderResultTabs(container: HTMLElement): void {
		const tabs = container.createDiv("simple-rag-tabs");

		const tabItems: Array<{ key: "all" | "notes" | "images"; label: string }> = [
			{ key: "all", label: "All" },
			{ key: "notes", label: "Notes" },
			{ key: "images", label: "Images" },
		];

		for (const tab of tabItems) {
			const btn = tabs.createEl("button", {
				text: tab.label,
				cls: `simple-rag-tab ${this.activeTab === tab.key ? "active" : ""}`,
			});
			btn.addEventListener("click", () => {
				this.activeTab = tab.key;
				this.render();
			});
		}
	}

	// ---- Result List ----
	private renderResultList(container: HTMLElement): void {
		const list = container.createDiv("simple-rag-results");

		const filtered = this.filterResults();

		if (this.searchResults.length === 0) {
			list.createDiv({
				text: "No results yet. Enter a search query above.",
				cls: "simple-rag-empty",
			});
			return;
		}

		if (filtered.length === 0) {
			list.createDiv({
				text: "No results for this filter.",
				cls: "simple-rag-empty",
			});
			return;
		}

		for (const result of filtered) {
			this.renderResultItem(list, result);
		}
	}

	private filterResults(): SearchResult[] {
		if (this.activeTab === "all") return this.searchResults;
		if (this.activeTab === "notes")
			return this.searchResults.filter((r) => r.type === "note");
		return this.searchResults.filter((r) => r.type === "image");
	}

	private renderResultItem(
		container: HTMLElement,
		result: SearchResult
	): void {
		const item = container.createDiv("simple-rag-result-item");

		// Type badge
		const header = item.createDiv("simple-rag-result-header");
		header.createSpan({
			text: result.type === "note" ? "Note" : "Image",
			cls: `simple-rag-type-badge simple-rag-type-${result.type}`,
		});

		// Score
		if (this.plugin.settings.showSimilarityScores) {
			header.createSpan({
				text: `${(result.score * 100).toFixed(1)}%`,
				cls: "simple-rag-score",
			});
		}

		// Path
		item.createDiv({
			text: result.notePath,
			cls: "simple-rag-result-path",
		});

		// Heading path
		if (result.headingPath) {
			item.createDiv({
				text: result.headingPath,
				cls: "simple-rag-result-heading",
			});
		}

		// Snippet
		item.createDiv({
			text: result.snippet,
			cls: "simple-rag-result-snippet",
		});

		// Actions
		const actions = item.createDiv("simple-rag-result-actions");

		const openBtn = actions.createEl("button", { text: "Open" });
		openBtn.addEventListener("click", async () => {
			const file =
				this.plugin.app.vault.getAbstractFileByPath(result.notePath);
			if (file) {
				await this.plugin.app.workspace.openLinkText(
					result.notePath,
					""
				);
			}
		});
	}

	// ---- Chat Panel ----
	private renderChatPanel(container: HTMLElement): void {
		if (this.searchResults.length === 0) return;

		const chatPanel = container.createDiv("simple-rag-chat-panel");
		chatPanel.createEl("h4", { text: "Chat" });

		// Chat history
		const history = chatPanel.createDiv("simple-rag-chat-history");
		for (const msg of this.chatHistory) {
			const msgDiv = history.createDiv(
				`simple-rag-chat-msg simple-rag-chat-${msg.role}`
			);
			msgDiv.createDiv({
				text: msg.role === "user" ? "You" : "AI",
				cls: "simple-rag-chat-role",
			});
			msgDiv.createDiv({
				text: msg.content,
				cls: "simple-rag-chat-content",
			});
		}

		// References
		if (this.currentReferences.length > 0) {
			const refsDiv = chatPanel.createDiv("simple-rag-chat-references");
			refsDiv.createEl("h5", { text: "Sources" });
			for (const ref of this.currentReferences) {
				const refItem = refsDiv.createDiv("simple-rag-ref-item");
				refItem.createSpan({
					text: `[${ref.index}] `,
					cls: "simple-rag-ref-index",
				});
				const link = refItem.createEl("a", {
					text: ref.path,
					cls: "simple-rag-ref-link",
				});
				link.addEventListener("click", async () => {
					await this.plugin.app.workspace.openLinkText(
						ref.path,
						""
					);
				});
				if (ref.headingPath) {
					refItem.createSpan({
						text: ` › ${ref.headingPath}`,
						cls: "simple-rag-ref-heading",
					});
				}
			}
		}

		// Input
		const chatInput = chatPanel.createDiv("simple-rag-chat-input");
		const textarea = chatInput.createEl("textarea", {
			placeholder: "Ask about the search results…",
			cls: "simple-rag-chat-textarea",
		});

		const sendBtn = chatInput.createEl("button", {
			text: "Send",
			cls: "simple-rag-chat-send",
		});

		sendBtn.addEventListener("click", async () => {
			const question = textarea.value.trim();
			if (!question) return;

			textarea.value = "";
			sendBtn.disabled = true;
			sendBtn.setText("Thinking…");

			this.chatHistory.push({ role: "user", content: question });

			try {
				const result = await this.plugin.chat(
					question,
					this.searchResults,
					this.chatHistory.slice(0, -1)
				);

				this.chatHistory.push({
					role: "assistant",
					content: result.content,
				});
				this.currentReferences = result.references;
			} catch (e) {
				const msg =
					e instanceof Error ? e.message : "Chat failed";
				this.chatHistory.push({
					role: "assistant",
					content: `Error: ${msg}`,
				});
			}

			this.render();
		});

		textarea.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				sendBtn.click();
			}
		});
	}

	private currentReferences: ChatReference[] = [];

	private showError(container: HTMLElement, message: string): void {
		const existing = container.querySelector(".simple-rag-error");
		if (existing) existing.remove();

		const errDiv = container.createDiv("simple-rag-error");
		errDiv.setText(message);
		setTimeout(() => errDiv.remove(), 5000);
	}

	/**
	 * Called by the plugin when index stats change.
	 */
	refresh(): void {
		this.render();
	}
}
