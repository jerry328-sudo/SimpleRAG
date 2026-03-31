import { describe, it, expect } from "vitest";
import { Database } from "../src/storage/db";
import { VaultScanner } from "../src/indexing/scanner";
import { DEFAULT_SETTINGS } from "../src/settings/types";
import { createMockApp } from "./helpers";

describe("VaultScanner", () => {
	it("ignores unreferenced images when image embedding is disabled", async () => {
		const { app } = createMockApp({
			"notes/a.md": { content: "# Note", mtime: 1 },
			"assets/pic.png": { binary: new Uint8Array([1, 2, 3]), mtime: 1 },
		});

		const db = new Database(app, "storage/test.json");
		const scanner = new VaultScanner(app, db, {
			...DEFAULT_SETTINGS,
			enableImageEmbedding: false,
		});

		await scanner.scan();

		expect(db.getFile("notes/a.md")).toBeDefined();
		expect(db.getFile("assets/pic.png")).toBeUndefined();
	});
});
