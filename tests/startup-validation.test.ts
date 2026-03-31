import { describe, it, expect } from "vitest";
import { Database } from "../src/storage/db";
import { DEFAULT_SETTINGS } from "../src/settings/types";
import { loadValidatedSettings } from "../src/runtime/settings-loader";
import { createMockApp } from "./helpers";

describe("startup validation", () => {
	it("backs up invalid settings and falls back to defaults", async () => {
		const { app, storage } = createMockApp();
		const configPath = ".obsidian/plugins/simple-rag/data.json";
		storage.set(
			configPath,
			JSON.stringify({
				embeddingModel: 123,
			})
		);

		const result = await loadValidatedSettings({
			app,
			manifest: { id: "simple-rag" },
		} as any);

		expect(result.settings).toEqual(DEFAULT_SETTINGS);
		expect(result.warnings).toHaveLength(1);
		expect(result.shouldPersist).toBe(true);
		expect(storage.has(configPath)).toBe(false);
		expect(
			Array.from(storage.keys()).some((key) =>
				key.startsWith(
					".obsidian/plugins/simple-rag/data.corrupt-"
				)
			)
		).toBe(true);
	});

	it("backs up invalid database files and loads an empty schema", async () => {
		const { app, storage } = createMockApp();
		const dbPath = ".obsidian/plugins/simple-rag/storage/rag-index.json";
		storage.set(
			dbPath,
			JSON.stringify({
				schema_meta: {
					schema_version: "1",
				},
				files: "not-an-object",
			})
		);

		const db = new Database(app, dbPath);
		const warnings = await db.load();

		expect(warnings).toHaveLength(1);
		expect(db.getMeta("schema_version")).toBe("1");
		expect(db.getAllFiles()).toHaveLength(0);
		expect(storage.has(dbPath)).toBe(false);
		expect(
			Array.from(storage.keys()).some((key) =>
				key.startsWith(
					".obsidian/plugins/simple-rag/storage/rag-index.corrupt-"
				)
			)
		).toBe(true);
	});
});
