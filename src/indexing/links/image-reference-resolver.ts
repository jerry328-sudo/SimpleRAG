import { normalizePath, type App } from "obsidian";
import type { AssetMention, LinkKind } from "../../types/domain";

interface ImageRef {
	rawTarget: string;
	linkKind: LinkKind;
	lineIndex: number;
	charIndex: number;
}

const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".webp",
	".gif",
]);

/**
 * Resolve image references from Markdown content.
 * Supports `![[image.png]]` (wikilink) and `![alt](path)` (markdown-image).
 */
export function extractImageReferences(
	app: App,
	notePath: string,
	content: string,
	headingPathAtOffset: (offset: number) => { json: string; text: string }
): AssetMention[] {
	const mentions: AssetMention[] = [];
	let mentionIndex = 0;

	// Wikilink images: ![[path|optional size]]
	const wikilinkRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
	let match;

	while ((match = wikilinkRegex.exec(content)) !== null) {
		const target = match[1];
		if (!target || !isImagePath(target)) continue;

		const heading = headingPathAtOffset(match.index);
		const surrounding = getSurroundingText(content, match.index, 200);

		const resolvedTarget = resolveWikiLinkPath(app, notePath, target);
		if (!resolvedTarget) continue;

		mentions.push({
			mention_id: `${notePath}#img#${mentionIndex}`,
			asset_path: resolvedTarget,
			note_path: notePath,
			mention_index: mentionIndex,
			heading_path_json: heading.json,
			heading_path_text: heading.text,
			raw_target: target,
			link_kind: "wikilink",
			surrounding_text: surrounding,
			near_chunk_id: null,
		});
		mentionIndex++;
	}

	// Markdown images: ![alt](path)
	const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	while ((match = mdImageRegex.exec(content)) !== null) {
		const target = match[2];
		if (!target || !isImagePath(target)) continue;
		// Skip external URLs
		if (target.startsWith("http://") || target.startsWith("https://")) continue;

		const heading = headingPathAtOffset(match.index);
		const surrounding = getSurroundingText(content, match.index, 200);

		const resolvedTarget = resolveMarkdownImagePath(notePath, target);
		if (!resolvedTarget) continue;

		mentions.push({
			mention_id: `${notePath}#img#${mentionIndex}`,
			asset_path: resolvedTarget,
			note_path: notePath,
			mention_index: mentionIndex,
			heading_path_json: heading.json,
			heading_path_text: heading.text,
			raw_target: target,
			link_kind: "markdown-image",
			surrounding_text: surrounding,
			near_chunk_id: null,
		});
		mentionIndex++;
	}

	return mentions;
}

function isImagePath(path: string): boolean {
	const lower = path.toLowerCase();
	return Array.from(IMAGE_EXTENSIONS).some((ext) => lower.endsWith(ext));
}

function resolveWikiLinkPath(
	app: App,
	notePath: string,
	target: string
): string | null {
	const normalizedTarget = normalizeTarget(target);
	const resolvedFile = app.metadataCache.getFirstLinkpathDest(
		normalizedTarget,
		notePath
	);

	if (resolvedFile?.path) {
		return resolvedFile.path;
	}

	return resolveMarkdownImagePath(notePath, normalizedTarget);
}

function resolveMarkdownImagePath(
	notePath: string,
	target: string
): string | null {
	const normalizedTarget = normalizeTarget(target);
	if (!normalizedTarget) {
		return null;
	}

	if (normalizedTarget.startsWith("/")) {
		return normalizePath(normalizedTarget.slice(1));
	}

	const noteDirectory = notePath.includes("/")
		? notePath.slice(0, notePath.lastIndexOf("/"))
		: "";
	if (!noteDirectory) {
		return normalizePath(normalizedTarget);
	}

	return normalizePath(`${noteDirectory}/${normalizedTarget}`);
}

function normalizeTarget(target: string): string {
	let normalized = decodeURIComponent(target.trim());
	normalized = normalized.replace(/^<|>$/g, "");
	normalized = normalized.replace(/\\/g, "/");
	if (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}
	return normalized;
}

function getSurroundingText(
	content: string,
	index: number,
	radius: number
): string {
	const start = Math.max(0, index - radius);
	const end = Math.min(content.length, index + radius);
	return content.slice(start, end).replace(/\s+/g, " ").trim();
}
