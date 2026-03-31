import { describe, it, expect } from "vitest";
import { toVaultRelativePath } from "../src/runtime/paths";
import { getIndexMode } from "../src/settings/types";
import { DEFAULT_SETTINGS } from "../src/settings/types";
import { RuntimeState } from "../src/runtime/state";

describe("toVaultRelativePath", () => {
	it("should convert absolute path to vault relative", () => {
		const result = toVaultRelativePath(
			"C:/Users/test/vault/notes/test.md",
			"C:/Users/test/vault"
		);
		expect(result).toBe("notes/test.md");
	});

	it("should handle backslash separators", () => {
		const result = toVaultRelativePath(
			"C:\\Users\\test\\vault\\notes\\test.md",
			"C:\\Users\\test\\vault"
		);
		expect(result).toBe("notes/test.md");
	});

	it("should handle path without base", () => {
		const result = toVaultRelativePath("notes/test.md", "/other/vault");
		expect(result).toBe("notes/test.md");
	});
});

describe("getIndexMode", () => {
	it("should return text-only when image embedding is disabled", () => {
		const settings = { ...DEFAULT_SETTINGS, enableImageEmbedding: false };
		expect(getIndexMode(settings)).toBe("text-only");
	});

	it("should return multimodal when image embedding is enabled", () => {
		const settings = { ...DEFAULT_SETTINGS, enableImageEmbedding: true };
		expect(getIndexMode(settings)).toBe("multimodal");
	});
});

describe("RuntimeState", () => {
	it("should track dirty files", () => {
		const state = new RuntimeState();
		expect(state.getDirtyCount()).toBe(0);

		state.markDirty("notes/test.md");
		expect(state.getDirtyCount()).toBe(1);

		state.markDirty("notes/test2.md");
		expect(state.getDirtyCount()).toBe(2);

		// Duplicate should not increase count
		state.markDirty("notes/test.md");
		expect(state.getDirtyCount()).toBe(2);

		state.markClean("notes/test.md");
		expect(state.getDirtyCount()).toBe(1);

		state.clearDirty();
		expect(state.getDirtyCount()).toBe(0);
	});
});
