import type { Database } from "../storage/db";
import type { SimpleRAGSettings } from "../settings/types";
import type { ChatProvider, ChatStreamEvent } from "../providers/types";
import type { SearchResult, ChatReference } from "../types/domain";
import type { App } from "obsidian";
import { ContextBuilder } from "./context-builder";

const SYSTEM_PROMPT = `You are a helpful research assistant. Answer the user's question based ONLY on the provided documents.

Rules:
1. Only use information from the provided documents.
2. Cite your sources using [N] notation where N is the document number.
3. If the documents don't contain enough information to answer, say so clearly.
4. Be concise and accurate.
5. Use the same language as the user's question.`;

export interface ConversationResult {
	content: string;
	references: ChatReference[];
}

/**
 * Manages the chat conversation based on search results.
 */
export class ConversationService {
	private app: App;
	private db: Database;
	private settings: SimpleRAGSettings;
	private chatProvider: ChatProvider;
	private contextBuilder: ContextBuilder;

	constructor(
		app: App,
		db: Database,
		settings: SimpleRAGSettings,
		chatProvider: ChatProvider
	) {
		this.app = app;
		this.db = db;
		this.settings = settings;
		this.chatProvider = chatProvider;
		this.contextBuilder = new ContextBuilder(app, db, settings);
	}

	/**
	 * Send a chat message with context from search results.
	 */
	async chat(
		userMessage: string,
		searchResults: SearchResult[],
		conversationHistory: Array<{
			role: "user" | "assistant";
			content: string;
		}>
	): Promise<ConversationResult> {
		const packets = await this.contextBuilder.buildContext(searchResults);
		const contextText =
			this.contextBuilder.formatContextForPrompt(packets);

		const messages = [
			{ role: "system" as const, content: SYSTEM_PROMPT },
			{
				role: "user" as const,
				content: `Here are the relevant documents:\n\n${contextText}`,
			},
			...conversationHistory,
			{ role: "user" as const, content: userMessage },
		];

		const response = await this.chatProvider.chat({ messages });

		// Build references from packets
		const references: ChatReference[] = packets.map((p, i) => ({
			index: i + 1,
			type: "note" as const,
			path: p.notePath,
			headingPath:
				p.chunks[0]?.heading_path_text ?? "",
			snippet:
				p.content.length > 200
					? p.content.slice(0, 200) + "…"
					: p.content,
		}));

		return {
			content: response.content,
			references,
		};
	}

	/**
	 * Stream a chat response.
	 */
	async chatStream(
		userMessage: string,
		searchResults: SearchResult[],
		conversationHistory: Array<{
			role: "user" | "assistant";
			content: string;
		}>,
		onEvent: (event: ChatStreamEvent) => void
	): Promise<ChatReference[]> {
		const packets = await this.contextBuilder.buildContext(searchResults);
		const contextText =
			this.contextBuilder.formatContextForPrompt(packets);

		const messages = [
			{ role: "system" as const, content: SYSTEM_PROMPT },
			{
				role: "user" as const,
				content: `Here are the relevant documents:\n\n${contextText}`,
			},
			...conversationHistory,
			{ role: "user" as const, content: userMessage },
		];

		if (this.chatProvider.chatStream) {
			await this.chatProvider.chatStream(
				{ messages, stream: true },
				onEvent
			);
		} else {
			// Fallback to non-streaming
			const response = await this.chatProvider.chat({ messages });
			onEvent({ delta: response.content, done: true });
		}

		return packets.map((p, i) => ({
			index: i + 1,
			type: "note" as const,
			path: p.notePath,
			headingPath:
				p.chunks[0]?.heading_path_text ?? "",
			snippet:
				p.content.length > 200
					? p.content.slice(0, 200) + "…"
					: p.content,
		}));
	}
}
