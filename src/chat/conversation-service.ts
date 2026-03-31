import type { Database } from "../storage/db";
import type { SimpleRAGSettings } from "../settings/types";
import type {
	ChatProvider,
	ChatStreamEvent,
	ChatMessage,
	ChatContentPart,
} from "../providers/types";
import type { SearchResult, ChatReference } from "../types/domain";
import type { App } from "obsidian";
import { ContextBuilder, type DocumentPacket } from "./context-builder";
import { EvidenceSelector } from "./evidence-selector";

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
	private evidenceSelector: EvidenceSelector;

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
		this.evidenceSelector = new EvidenceSelector(chatProvider);
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
		const packets = await this.getContextPackets(userMessage, searchResults);
		const messages = this.buildMessages(
			userMessage,
			packets,
			conversationHistory
		);

		const response = await this.chatProvider.chat({ messages });

		// Build references from packets
		const references: ChatReference[] = packets.map((p, i) => ({
			index: i + 1,
			type: p.type,
			path: p.path,
			headingPath: p.headingPath,
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
		const packets = await this.getContextPackets(userMessage, searchResults);
		const messages = this.buildMessages(
			userMessage,
			packets,
			conversationHistory
		);

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
			type: p.type,
			path: p.path,
			headingPath: p.headingPath,
			snippet:
				p.content.length > 200
					? p.content.slice(0, 200) + "…"
					: p.content,
		}));
	}

	private async getContextPackets(
		userMessage: string,
		searchResults: SearchResult[]
	): Promise<DocumentPacket[]> {
		const packets = await this.contextBuilder.buildContext(searchResults);
		if (!this.settings.enableAIEvidenceSelection) {
			return packets;
		}
		return this.evidenceSelector.select(userMessage, packets);
	}

	private buildMessages(
		userMessage: string,
		packets: DocumentPacket[],
		conversationHistory: Array<{
			role: "user" | "assistant";
			content: string;
		}>
	): ChatMessage[] {
		const messages: ChatMessage[] = [
			{ role: "system", content: SYSTEM_PROMPT },
			{
				role: "user",
				content: this.buildContextMessageContent(packets),
			},
		];

		for (const item of conversationHistory) {
			messages.push({
				role: item.role,
				content: item.content,
			});
		}

		messages.push({
			role: "user",
			content: userMessage,
		});

		return messages;
	}

	private buildContextMessageContent(
		packets: DocumentPacket[]
	): string | ChatContentPart[] {
		const contextText = this.contextBuilder.formatContextForPrompt(packets);
		if (!this.chatProvider.capability.supportsVisionInput) {
			return `Here are the relevant documents:\n\n${contextText}`;
		}

		const parts: ChatContentPart[] = [
			{
				type: "text",
				text: "Here are the relevant documents and images. Use them as the only evidence source.",
			},
		];

		for (let i = 0; i < packets.length; i++) {
			const packet = packets[i]!;
			parts.push({
				type: "text",
				text: `[${i + 1}] ${packet.type.toUpperCase()} ${packet.path}\n${packet.content}`,
			});
			if (packet.type === "image" && packet.imagePayload) {
				parts.push({
					type: "image",
					image: packet.imagePayload,
				});
			}
		}

		return parts;
	}
}
