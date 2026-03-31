import type { Plugin } from "obsidian";
import type { RuntimeState } from "./state";
import type { SimpleRAGSettings } from "../settings/types";

const TRACKED_IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"webp",
	"gif",
]);

export function registerVaultChangeTracking(
	plugin: Plugin,
	state: RuntimeState,
	getSettings: () => SimpleRAGSettings
): void {
	const markIfTracked = (path: string, extension?: string) => {
		const ext = extension ?? path.split(".").pop()?.toLowerCase();
		if (!ext) {
			return;
		}
		if (shouldTrackExtension(getSettings(), ext)) {
			state.markDirty(path);
		}
	};

	plugin.registerEvent(
		plugin.app.vault.on("create", (file) => {
			if ("extension" in file && typeof file.extension === "string") {
				markIfTracked(file.path, file.extension);
			}
		})
	);

	plugin.registerEvent(
		plugin.app.vault.on("modify", (file) => {
			if ("extension" in file && typeof file.extension === "string") {
				markIfTracked(file.path, file.extension);
			}
		})
	);

	plugin.registerEvent(
		plugin.app.vault.on("delete", (file) => {
			if ("extension" in file && typeof file.extension === "string") {
				markIfTracked(file.path, file.extension);
			}
		})
	);

	plugin.registerEvent(
		plugin.app.vault.on("rename", (file, oldPath) => {
			markIfTracked(oldPath);
			if ("extension" in file && typeof file.extension === "string") {
				markIfTracked(file.path, file.extension);
			}
		})
	);
}

export function shouldTrackExtension(
	settings: SimpleRAGSettings,
	extension: string
): boolean {
	const ext = extension.toLowerCase();
	if (ext === "md") {
		return true;
	}

	return settings.enableImageEmbedding && TRACKED_IMAGE_EXTENSIONS.has(ext);
}
