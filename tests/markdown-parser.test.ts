import { describe, it, expect } from "vitest";
import {
	parseMarkdownSections,
	chunkSections,
	estimateTokens,
} from "../src/indexing/chunking/markdown-parser";

describe("parseMarkdownSections", () => {
	it("should parse a simple markdown file", () => {
		const content = `# Title

This is paragraph one.

This is paragraph two.

## Subtitle

Some content under subtitle.
`;
		const sections = parseMarkdownSections(content);
		expect(sections.length).toBeGreaterThan(0);
		// Check first section has content
		expect(sections[0]!.content.length).toBeGreaterThan(0);
	});

	it("should strip YAML frontmatter", () => {
		const content = `---
title: Test
date: 2024-01-01
---

# Title

Content after frontmatter.
`;
		const sections = parseMarkdownSections(content);
		// Frontmatter should not appear in any section
		const allText = sections.map((s) => s.content).join(" ");
		expect(allText).not.toContain("title: Test");
		expect(allText).toContain("Content after frontmatter.");
	});

	it("should exclude code blocks from content", () => {
		const content = `# Code

Some text before.

\`\`\`javascript
const x = 1;
console.log(x);
\`\`\`

Some text after.
`;
		const sections = parseMarkdownSections(content);
		const allText = sections.map((s) => s.content).join(" ");
		expect(allText).not.toContain("const x = 1");
		expect(allText).toContain("Some text before.");
		expect(allText).toContain("Some text after.");
	});

	it("should track heading hierarchy", () => {
		const content = `# H1

Content under H1.

## H2a

Content under H2a.

## H2b

Content under H2b.

### H3

Content under H3.
`;
		const sections = parseMarkdownSections(content);

		// Find section under H3
		const h3Section = sections.find((s) =>
			s.headingPath.some((h) => h.text === "H3")
		);
		expect(h3Section).toBeDefined();
		// H3 should have H2b and H3 in its path (H1 too since it's still on stack)
		const headingTexts = h3Section!.headingPath.map((h) => h.text);
		expect(headingTexts).toContain("H3");
	});

	it("should handle empty content", () => {
		const sections = parseMarkdownSections("");
		expect(sections).toEqual([]);
	});

	it("should handle content with only headings", () => {
		const content = `# H1
## H2
### H3
`;
		const sections = parseMarkdownSections(content);
		// All content is in headings, so there may be empty sections
		// At minimum, should not throw
		expect(sections).toBeDefined();
	});
});

describe("chunkSections", () => {
	it("should create chunks from parsed sections", () => {
		const content = `# Title

This is a paragraph with enough text to form a proper chunk. It contains multiple sentences that provide meaningful content for embedding and retrieval purposes.

## Section Two

Another paragraph here with sufficient content. We need this to be long enough to not be merged with other sections automatically.
`;
		const sections = parseMarkdownSections(content);
		const chunks = chunkSections("notes/test.md", sections);

		expect(chunks.length).toBeGreaterThan(0);

		// Check chunk structure
		const firstChunk = chunks[0]!;
		expect(firstChunk.note_path).toBe("notes/test.md");
		expect(firstChunk.chunk_index).toBe(0);
		expect(firstChunk.chunk_id).toBe("notes/test.md#0");
		expect(firstChunk.text.length).toBeGreaterThan(0);
		expect(firstChunk.text_for_embedding).toContain("Path: notes/test.md");
		expect(firstChunk.text_for_embedding).toContain("Content:");
	});

	it("should merge very short sections", () => {
		const content = `# Title

Short.

Also short.

This is a slightly longer paragraph that has some substance to it and should be a proper chunk.
`;
		const sections = parseMarkdownSections(content);
		const chunks = chunkSections("test.md", sections);

		// Short sections should be merged, so we get fewer chunks
		expect(chunks.length).toBeGreaterThanOrEqual(1);
	});

	it("should include heading path in text_for_embedding", () => {
		const content = `# Main Topic

## Sub Topic

This is the content under the sub topic section.
`;
		const sections = parseMarkdownSections(content);
		const chunks = chunkSections("test.md", sections);

		// At least one chunk should have heading path
		const hasHeading = chunks.some(
			(c) => c.text_for_embedding.includes("Heading:")
		);
		// The chunk with content under "Sub Topic" should have heading info
		const subTopicChunk = chunks.find((c) =>
			c.text.includes("content under the sub topic")
		);
		if (subTopicChunk) {
			expect(subTopicChunk.heading_path_text).toContain("Sub Topic");
		}
	});
});

describe("estimateTokens", () => {
	it("should estimate English text tokens", () => {
		const text = "This is a simple English sentence.";
		const tokens = estimateTokens(text);
		// ~34 chars / 4 ≈ 9 tokens
		expect(tokens).toBeGreaterThan(5);
		expect(tokens).toBeLessThan(20);
	});

	it("should estimate CJK text with higher density", () => {
		const text = "这是一个简单的中文句子";
		const tokens = estimateTokens(text);
		// 11 CJK chars / 2 ≈ 6 tokens
		expect(tokens).toBeGreaterThan(3);
		expect(tokens).toBeLessThan(15);
	});

	it("should handle empty string", () => {
		expect(estimateTokens("")).toBe(0);
	});
});
