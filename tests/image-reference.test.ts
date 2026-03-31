import { describe, it, expect } from "vitest";
import { extractImageReferences } from "../src/indexing/links/image-reference-resolver";
import { createMockApp } from "./helpers";

function mockHeadingLookup(_offset: number): { json: string; text: string } {
	return { json: "[]", text: "" };
}

describe("extractImageReferences", () => {
	it("should extract wikilink image references", () => {
		const { app } = createMockApp({
			"assets/photo.png": { binary: new Uint8Array([1]) },
			"folder/diagram.jpg": { binary: new Uint8Array([1]) },
		});
		const content = `# My Note

Here is an image: ![[photo.png]]

And another: ![[folder/diagram.jpg|300]]
`;
		const mentions = extractImageReferences(
			app,
			"notes/test.md",
			content,
			mockHeadingLookup
		);

		expect(mentions.length).toBe(2);
		expect(mentions[0]!.asset_path).toBe("assets/photo.png");
		expect(mentions[0]!.link_kind).toBe("wikilink");
		expect(mentions[1]!.asset_path).toBe("folder/diagram.jpg");
		expect(mentions[1]!.link_kind).toBe("wikilink");
	});

	it("should extract markdown image references", () => {
		const { app } = createMockApp();
		const content = `# My Note

![Alt text](images/photo.png)

![](other/image.jpeg)
`;
		const mentions = extractImageReferences(
			app,
			"test.md",
			content,
			mockHeadingLookup
		);

		expect(mentions.length).toBe(2);
		expect(mentions[0]!.asset_path).toBe("images/photo.png");
		expect(mentions[0]!.link_kind).toBe("markdown-image");
		expect(mentions[1]!.asset_path).toBe("other/image.jpeg");
	});

	it("should skip non-image files", () => {
		const { app } = createMockApp();
		const content = `![[document.pdf]]
![](data.csv)
![[script.js]]
`;
		const mentions = extractImageReferences(
			app,
			"test.md",
			content,
			mockHeadingLookup
		);
		expect(mentions.length).toBe(0);
	});

	it("should skip external URLs", () => {
		const { app } = createMockApp();
		const content = `![Alt](https://example.com/image.png)
![Alt](http://example.com/photo.jpg)
`;
		const mentions = extractImageReferences(
			app,
			"test.md",
			content,
			mockHeadingLookup
		);
		expect(mentions.length).toBe(0);
	});

	it("should support webp and gif", () => {
		const { app } = createMockApp({
			"animation.gif": { binary: new Uint8Array([1]) },
			"modern.webp": { binary: new Uint8Array([1]) },
		});
		const content = `![[animation.gif]]
![[modern.webp]]
`;
		const mentions = extractImageReferences(
			app,
			"test.md",
			content,
			mockHeadingLookup
		);
		expect(mentions.length).toBe(2);
		expect(mentions[0]!.asset_path).toBe("animation.gif");
		expect(mentions[1]!.asset_path).toBe("modern.webp");
	});

	it("should handle empty content", () => {
		const { app } = createMockApp();
		const mentions = extractImageReferences(
			app,
			"test.md",
			"",
			mockHeadingLookup
		);
		expect(mentions.length).toBe(0);
	});

	it("should set correct mention metadata", () => {
		const { app } = createMockApp({
			"assets/photo.png": { binary: new Uint8Array([1]) },
		});
		const content = `![[photo.png]]`;
		const mentions = extractImageReferences(
			app,
			"notes/test.md",
			content,
			mockHeadingLookup
		);

		expect(mentions.length).toBe(1);
		expect(mentions[0]!.note_path).toBe("notes/test.md");
		expect(mentions[0]!.mention_index).toBe(0);
		expect(mentions[0]!.mention_id).toBe("notes/test.md#img#0");
		expect(mentions[0]!.raw_target).toBe("photo.png");
		expect(mentions[0]!.asset_path).toBe("assets/photo.png");
		expect(mentions[0]!.surrounding_text).toBeDefined();
	});

	it("should normalize paths with ./ prefix", () => {
		const { app } = createMockApp();
		const content = `![](./images/photo.png)`;
		const mentions = extractImageReferences(
			app,
			"test.md",
			content,
			mockHeadingLookup
		);

		expect(mentions.length).toBe(1);
		expect(mentions[0]!.asset_path).toBe("images/photo.png");
	});

	it("should resolve relative markdown image paths against the note directory", () => {
		const { app } = createMockApp();
		const content = `![](../images/pic.png)`;
		const mentions = extractImageReferences(
			app,
			"docs/design/note.md",
			content,
			mockHeadingLookup
		);

		expect(mentions).toHaveLength(1);
		expect(mentions[0]!.asset_path).toBe("docs/images/pic.png");
	});
});
