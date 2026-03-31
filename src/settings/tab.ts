import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
} from "obsidian";
import type SimpleRAGPlugin from "../main";
import { getIndexMode } from "./types";
import { ProviderRegistry } from "../providers/registry";

export class SimpleRAGSettingTab extends PluginSettingTab {
	plugin: SimpleRAGPlugin;
	private registry = new ProviderRegistry();

	constructor(app: App, plugin: SimpleRAGPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ---- Group A: Providers ----
		containerEl.createEl("h2", { text: "Providers" });

		new Setting(containerEl)
			.setName("Embedding provider")
			.setDesc("Provider used to generate embeddings")
			.addDropdown((dropdown) => {
				for (const option of this.registry.listEmbeddingProviders()) {
					dropdown.addOption(option.id, option.label);
				}
				dropdown
					.setValue(this.plugin.settings.embeddingProvider)
					.onChange(async (value) => {
						this.plugin.settings.embeddingProvider = value;
						await this.plugin.saveSettings();
						this.showRebuildWarning(containerEl);
					});
			});

		new Setting(containerEl)
			.setName("Embedding base URL")
			.setDesc("Base URL for the embedding API (OpenAI-compatible)")
			.addText((text) =>
				text
					.setPlaceholder("https://api.openai.com/v1")
					.setValue(this.plugin.settings.embeddingBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.embeddingBaseUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Embedding model")
			.setDesc("Model name for generating embeddings")
			.addText((text) =>
				text
					.setPlaceholder("text-embedding-3-small")
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value;
						await this.plugin.saveSettings();
						this.showRebuildWarning(containerEl);
					})
			);

		new Setting(containerEl)
			.setName("Embedding API token")
			.setDesc("API token for the embedding provider")
			.addText((text) => {
				text.inputEl.type = "password";
				return text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.embeddingApiToken)
					.onChange(async (value) => {
						this.plugin.settings.embeddingApiToken = value;
						await this.plugin.saveSettings();
					});
			});

		// ---- Group B: Features ----
		containerEl.createEl("h2", { text: "Features" });

		new Setting(containerEl)
			.setName("Enable image embedding")
			.setDesc(
				"Index images referenced in notes (requires multimodal embedding model). Changing this requires a full index rebuild."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableImageEmbedding)
					.onChange(async (value) => {
						this.plugin.settings.enableImageEmbedding = value;
						await this.plugin.saveSettings();
						this.showRebuildWarning(containerEl);
					})
			);

		new Setting(containerEl)
			.setName("Enable AI chat")
			.setDesc(
				"Enable chat mode to ask questions based on search results"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAIChat)
					.onChange(async (value) => {
						this.plugin.settings.enableAIChat = value;
						await this.plugin.saveSettings();
					})
			);

		// ---- Group C: Index status ----
		containerEl.createEl("h2", { text: "Index status" });

		const stats = this.plugin.getIndexStats();
		const statusDiv = containerEl.createDiv("simple-rag-index-status");

		statusDiv.createEl("p", {
			text: `Index mode: ${getIndexMode(this.plugin.settings)}`,
		});
		statusDiv.createEl("p", {
			text: `Last scan: ${stats.lastScanAt ? new Date(stats.lastScanAt).toLocaleString() : "Never"}`,
		});
		statusDiv.createEl("p", {
			text: `Last index update: ${stats.lastIndexAt ? new Date(stats.lastIndexAt).toLocaleString() : "Never"}`,
		});
		statusDiv.createEl("p", {
			text: `Notes indexed: ${stats.totalNotes}`,
		});
		statusDiv.createEl("p", {
			text: `Chunks indexed: ${stats.totalChunks}`,
		});
		statusDiv.createEl("p", {
			text: `Images indexed: ${stats.totalAssets}`,
		});
		statusDiv.createEl("p", {
			text: `Dirty files: ${stats.dirtyFiles}`,
		});

		new Setting(containerEl)
			.setName("Scan changes")
			.setDesc("Scan vault for changed files")
			.addButton((btn) =>
				btn.setButtonText("Scan changes").onClick(async () => {
					await this.plugin.scanChanges();
					new Notice("Scan complete");
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Update index")
			.setDesc("Index dirty files")
			.addButton((btn) =>
				btn.setButtonText("Update index").onClick(async () => {
					await this.plugin.updateIndex();
					new Notice("Index update complete");
					this.display();
				})
			);

		new Setting(containerEl)
			.setName("Rebuild full index")
			.setDesc(
				"Clear and rebuild the entire index. Required after changing embedding model or toggling image embedding."
			)
			.addButton((btn) =>
				btn
					.setButtonText("Rebuild full index")
					.setWarning()
					.onClick(async () => {
						const confirmed = await this.confirmAction(
							"Rebuild full index",
							"This will clear the current index, scan the vault again, and rebuild everything. Continue?"
						);
						if (confirmed) {
							await this.plugin.rebuildIndex();
							new Notice("Full index rebuild complete");
							this.display();
						}
					})
			);

		// ---- Advanced ----
		const advancedDetails = containerEl.createEl("details");
		advancedDetails.createEl("summary", { text: "Advanced settings" });

		// Retrieval
		advancedDetails.createEl("h3", { text: "Retrieval" });

		new Setting(advancedDetails)
			.setName("Enable rerank")
			.setDesc("Use a reranking model to improve search result ordering")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableRerank)
					.onChange(async (value) => {
						this.plugin.settings.enableRerank = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(advancedDetails)
			.setName("Rerank provider")
			.addDropdown((dropdown) => {
				for (const option of this.registry.listRerankProviders()) {
					dropdown.addOption(option.id, option.label);
				}
				dropdown
					.setValue(this.plugin.settings.rerankProvider)
					.onChange(async (value) => {
						this.plugin.settings.rerankProvider = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(advancedDetails)
			.setName("Rerank model")
			.addText((text) =>
				text
					.setPlaceholder("rerank-v1")
					.setValue(this.plugin.settings.rerankModel)
					.onChange(async (value) => {
						this.plugin.settings.rerankModel = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(advancedDetails)
			.setName("Recall pool size")
			.setDesc("Number of candidates to retrieve before reranking")
			.addText((text) =>
				text
					.setPlaceholder("50")
					.setValue(String(this.plugin.settings.recallPoolSize))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.recallPoolSize = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(advancedDetails)
			.setName("Results per query")
			.setDesc("Number of final results to show")
			.addText((text) =>
				text
					.setPlaceholder("10")
					.setValue(String(this.plugin.settings.resultsPerQuery))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.resultsPerQuery = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(advancedDetails)
			.setName("Default result tab")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("all", "All")
					.addOption("notes", "Notes")
					.addOption("images", "Images")
					.setValue(this.plugin.settings.defaultResultTab)
					.onChange(async (value) => {
						this.plugin.settings.defaultResultTab =
							value as typeof this.plugin.settings.defaultResultTab;
						await this.plugin.saveSettings();
					})
			);

		// Chat
		advancedDetails.createEl("h3", { text: "Chat" });

		new Setting(advancedDetails)
			.setName("Chat provider")
			.addDropdown((dropdown) => {
				for (const option of this.registry.listChatProviders()) {
					dropdown.addOption(option.id, option.label);
				}
				dropdown
					.setValue(this.plugin.settings.chatProvider)
					.onChange(async (value) => {
						this.plugin.settings.chatProvider = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(advancedDetails)
			.setName("Chat base URL")
			.addText((text) =>
				text
					.setPlaceholder("https://api.openai.com/v1")
					.setValue(this.plugin.settings.chatBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.chatBaseUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(advancedDetails)
			.setName("Chat model")
			.addText((text) =>
				text
					.setPlaceholder("gpt-4o-mini")
					.setValue(this.plugin.settings.chatModel)
					.onChange(async (value) => {
						this.plugin.settings.chatModel = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(advancedDetails)
			.setName("Chat API token")
			.addText((text) => {
				text.inputEl.type = "password";
				return text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.chatApiToken)
					.onChange(async (value) => {
						this.plugin.settings.chatApiToken = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(advancedDetails)
			.setName("Short note threshold")
			.setDesc("Notes below this token estimate are sent in full")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.shortNoteThreshold))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.shortNoteThreshold = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(advancedDetails)
			.setName("Max notes in chat context")
			.addText((text) =>
				text
					.setValue(
						String(this.plugin.settings.maxNotesInChatContext)
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxNotesInChatContext = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(advancedDetails)
			.setName("Long note context window")
			.setDesc("How many neighboring chunks to include around a hit")
			.addText((text) =>
				text
					.setValue(
						String(this.plugin.settings.longNoteContextWindow)
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.longNoteContextWindow = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(advancedDetails)
			.setName("Enable AI evidence selection")
			.setDesc(
				"Use LLM to filter and compress evidence before final answer"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAIEvidenceSelection)
					.onChange(async (value) => {
						this.plugin.settings.enableAIEvidenceSelection = value;
						await this.plugin.saveSettings();
					})
			);

		// Network
		advancedDetails.createEl("h3", { text: "Network" });

		new Setting(advancedDetails)
			.setName("Rerank base URL")
			.addText((text) =>
				text
					.setPlaceholder("https://api.openai.com/v1")
					.setValue(this.plugin.settings.rerankBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.rerankBaseUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(advancedDetails)
			.setName("Rerank API token")
			.addText((text) => {
				text.inputEl.type = "password";
				return text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.rerankApiToken)
					.onChange(async (value) => {
						this.plugin.settings.rerankApiToken = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(advancedDetails)
			.setName("Timeout (ms)")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.timeout))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.timeout = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(advancedDetails)
			.setName("Max concurrent requests")
			.addText((text) =>
				text
					.setValue(
						String(this.plugin.settings.maxConcurrentRequests)
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxConcurrentRequests = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(advancedDetails)
			.setName("Retry count")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.retryCount))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.retryCount = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// Debug
		advancedDetails.createEl("h3", { text: "Debug & maintenance" });

		new Setting(advancedDetails)
			.setName("Show similarity scores")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSimilarityScores)
					.onChange(async (value) => {
						this.plugin.settings.showSimilarityScores = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(advancedDetails)
			.setName("Enable debug logs")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableDebugLogs)
					.onChange(async (value) => {
						this.plugin.settings.enableDebugLogs = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(advancedDetails)
			.setName("Clear local index")
			.setDesc("Delete all indexed data")
			.addButton((btn) =>
				btn
					.setButtonText("Clear index")
					.setWarning()
					.onClick(async () => {
						const confirmed = await this.confirmAction(
							"Clear local index",
							"This will delete all indexed data. Continue?"
						);
						if (confirmed) {
							await this.plugin.clearIndex();
							new Notice("Index cleared");
							this.display();
						}
					})
			);
	}

	private showRebuildWarning(container: HTMLElement): void {
		const existing = container.querySelector(".simple-rag-rebuild-warning");
		if (existing) return;
		const warning = container.createDiv("simple-rag-rebuild-warning");
		warning.setText(
			"⚠ Embedding model or image embedding changed. A full index rebuild is required."
		);
		warning.style.color = "var(--text-error)";
		warning.style.marginTop = "8px";
	}

	private async confirmAction(
		title: string,
		message: string
	): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new ConfirmActionModal(
				this.app,
				title,
				message,
				resolve
			);
			modal.open();
		});
	}
}

class ConfirmActionModal extends Modal {
	private title: string;
	private message: string;
	private onResolve: (confirmed: boolean) => void;

	constructor(
		app: App,
		title: string,
		message: string,
		onResolve: (confirmed: boolean) => void
	) {
		super(app);
		this.title = title;
		this.message = message;
		this.onResolve = onResolve;
	}

	onOpen(): void {
		this.contentEl.empty();
		this.contentEl.createEl("h3", { text: this.title });
		this.contentEl.createEl("p", { text: this.message });

		const actions = this.contentEl.createDiv("simple-rag-confirm-actions");
		const cancelBtn = actions.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.onResolve(false);
			this.close();
		});

		const confirmBtn = actions.createEl("button", { text: "Confirm" });
		confirmBtn.addClass("mod-warning");
		confirmBtn.addEventListener("click", () => {
			this.onResolve(true);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
