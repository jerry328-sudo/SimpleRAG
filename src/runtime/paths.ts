import type { Plugin } from "obsidian";

/**
 * Compute runtime directory paths within the plugin's private directory.
 */
export function getPluginDir(plugin: Plugin): string {
	const manifest = plugin.manifest;
	return `${plugin.app.vault.configDir}/plugins/${manifest.id}`;
}

export function getStorageDir(plugin: Plugin): string {
	return `${getPluginDir(plugin)}/storage`;
}

export function getDbPath(plugin: Plugin): string {
	return `${getStorageDir(plugin)}/rag-index.json`;
}

/**
 * Normalize an absolute OS path to a vault-relative path using '/' separators.
 */
export function toVaultRelativePath(
	absolutePath: string,
	vaultBasePath: string
): string {
	let relative = absolutePath;
	if (relative.startsWith(vaultBasePath)) {
		relative = relative.slice(vaultBasePath.length);
	}
	// Normalize separators and remove leading slash
	relative = relative.replace(/\\/g, "/");
	if (relative.startsWith("/")) {
		relative = relative.slice(1);
	}
	return relative;
}
