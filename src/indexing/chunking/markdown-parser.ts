import type { NoteChunk } from "../../types/domain";

interface HeadingNode {
	level: number;
	text: string;
}

interface ParsedSection {
	headingPath: HeadingNode[];
	content: string;
	charStart: number;
	charEnd: number;
}

/**
 * Parse a Markdown file into sections based on heading hierarchy.
 * Strips YAML frontmatter and code blocks.
 */
export function parseMarkdownSections(content: string): ParsedSection[] {
	const sections: ParsedSection[] = [];

	// Strip YAML frontmatter
	let body = content;
	let offset = 0;
	const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
	if (frontmatterMatch) {
		offset = frontmatterMatch[0].length;
		body = content.slice(offset);
	}

	// Remove code blocks (replace with empty to preserve positions)
	const codeBlockRegex = /```[\s\S]*?```/g;
	const cleanBody = body.replace(codeBlockRegex, (match) =>
		" ".repeat(match.length)
	);

	const lines = cleanBody.split(/\r?\n/);
	const headingStack: HeadingNode[] = [];
	let currentContent = "";
	let sectionStart = offset;
	let currentPos = offset;

	function flushSection(): void {
		const trimmed = currentContent.trim();
		if (trimmed.length > 0) {
			sections.push({
				headingPath: [...headingStack],
				content: trimmed,
				charStart: sectionStart,
				charEnd: currentPos,
			});
		}
		currentContent = "";
		sectionStart = currentPos;
	}

	for (const line of lines) {
		const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

		if (headingMatch && headingMatch[1] && headingMatch[2]) {
			flushSection();
			const level = headingMatch[1].length;
			const text = headingMatch[2].trim();

			// Pop headings at same or deeper level
			while (
				headingStack.length > 0 &&
				headingStack[headingStack.length - 1]!.level >= level
			) {
				headingStack.pop();
			}
			headingStack.push({ level, text });
			sectionStart = currentPos;
		} else {
			currentContent += line + "\n";
		}

		currentPos += line.length + 1; // +1 for newline
	}

	flushSection();

	return sections;
}

/**
 * Estimate token count from text (rough: ~4 chars per token for English,
 * ~2 chars per token for CJK).
 */
export function estimateTokens(text: string): number {
	// Count CJK characters
	const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
	const nonCjk = text.length - cjkCount;
	return Math.ceil(nonCjk / 4 + cjkCount / 2);
}

const MAX_CHUNK_TOKENS = 512;
const MIN_CHUNK_TOKENS = 32;

/**
 * Split parsed sections into chunks suitable for embedding.
 * Merges short sections, splits long ones.
 */
export function chunkSections(
	notePath: string,
	sections: ParsedSection[]
): NoteChunk[] {
	const chunks: NoteChunk[] = [];
	let chunkIndex = 0;
	let pendingContent = "";
	let pendingHeadings: HeadingNode[] = [];
	let pendingStart = 0;
	let pendingEnd = 0;

	function formatHeadingPath(headings: HeadingNode[]): string {
		return headings.map((h) => h.text).join(" / ");
	}

	function formatHeadingJson(headings: HeadingNode[]): string {
		return JSON.stringify(headings.map((h) => ({ level: h.level, text: h.text })));
	}

	function buildTextForEmbedding(
		path: string,
		headingText: string,
		content: string
	): string {
		let result = `Path: ${path}\n`;
		if (headingText) {
			result += `Heading: ${headingText}\n`;
		}
		result += `Content:\n${content}`;
		return result;
	}

	function emitChunk(
		text: string,
		headings: HeadingNode[],
		charStart: number,
		charEnd: number
	): void {
		const headingText = formatHeadingPath(headings);
		const textForEmb = buildTextForEmbedding(notePath, headingText, text);
		chunks.push({
			chunk_id: `${notePath}#${chunkIndex}`,
			note_path: notePath,
			chunk_index: chunkIndex,
			heading_path_json: formatHeadingJson(headings),
			heading_path_text: headingText,
			text,
			text_for_embedding: textForEmb,
			char_start: charStart,
			char_end: charEnd,
			token_estimate: estimateTokens(textForEmb),
		});
		chunkIndex++;
	}

	for (const section of sections) {
		const tokens = estimateTokens(section.content);

		if (tokens < MIN_CHUNK_TOKENS && pendingContent.length > 0) {
			// Merge with pending
			pendingContent += "\n" + section.content;
			pendingEnd = section.charEnd;
			const mergedTokens = estimateTokens(pendingContent);
			if (mergedTokens >= MAX_CHUNK_TOKENS) {
				emitChunk(
					pendingContent.trim(),
					pendingHeadings,
					pendingStart,
					pendingEnd
				);
				pendingContent = "";
			}
			continue;
		}

		// Flush pending if exists
		if (pendingContent.trim().length > 0) {
			emitChunk(
				pendingContent.trim(),
				pendingHeadings,
				pendingStart,
				pendingEnd
			);
			pendingContent = "";
		}

		if (tokens > MAX_CHUNK_TOKENS) {
			// Split long section
			const subChunks = splitLongText(section.content, MAX_CHUNK_TOKENS);
			for (const sub of subChunks) {
				emitChunk(
					sub,
					section.headingPath,
					section.charStart,
					section.charEnd
				);
			}
		} else if (tokens < MIN_CHUNK_TOKENS) {
			// Start pending
			pendingContent = section.content;
			pendingHeadings = section.headingPath;
			pendingStart = section.charStart;
			pendingEnd = section.charEnd;
		} else {
			emitChunk(
				section.content,
				section.headingPath,
				section.charStart,
				section.charEnd
			);
		}
	}

	// Flush remaining pending
	if (pendingContent.trim().length > 0) {
		emitChunk(
			pendingContent.trim(),
			pendingHeadings,
			pendingStart,
			pendingEnd
		);
	}

	return chunks;
}

/**
 * Split a long text block into smaller chunks by paragraph boundaries.
 */
function splitLongText(text: string, maxTokens: number): string[] {
	const paragraphs = text.split(/\n\s*\n/);
	const results: string[] = [];
	let current = "";

	for (const para of paragraphs) {
		const candidate = current ? current + "\n\n" + para : para;
		if (estimateTokens(candidate) > maxTokens && current.length > 0) {
			results.push(current.trim());
			current = para;
		} else {
			current = candidate;
		}
	}

	if (current.trim().length > 0) {
		results.push(current.trim());
	}

	// If a single result is still too long, split by sentences
	const finalResults: string[] = [];
	for (const chunk of results) {
		if (estimateTokens(chunk) > maxTokens * 2) {
			const sentences = chunk.split(/(?<=[.!?。！？\n])\s+/);
			let cur = "";
			for (const s of sentences) {
				const cand = cur ? cur + " " + s : s;
				if (estimateTokens(cand) > maxTokens && cur.length > 0) {
					finalResults.push(cur.trim());
					cur = s;
				} else {
					cur = cand;
				}
			}
			if (cur.trim().length > 0) {
				finalResults.push(cur.trim());
			}
		} else {
			finalResults.push(chunk);
		}
	}

	return finalResults;
}
