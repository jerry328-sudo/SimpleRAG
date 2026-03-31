import type { IndexStats, VaultPath } from "../types/domain";

/**
 * Mutable runtime state for the plugin — not persisted to data.json.
 * Tracks dirty files, indexing progress, and UI state.
 */
export class RuntimeState {
	/** Set of vault-relative paths that need re-indexing */
	dirtyFiles: Set<VaultPath> = new Set();

	/** Whether an indexing operation is currently running */
	isIndexing = false;

	/** Whether a scan is currently running */
	isScanning = false;

	/** Cached index stats, refreshed after index operations */
	lastStats: IndexStats = {
		indexMode: "text-only",
		lastScanAt: null,
		lastIndexAt: null,
		totalNotes: 0,
		totalChunks: 0,
		totalAssets: 0,
		dirtyFiles: 0,
	};

	markDirty(path: VaultPath): void {
		this.dirtyFiles.add(path);
	}

	markClean(path: VaultPath): void {
		this.dirtyFiles.delete(path);
	}

	clearDirty(): void {
		this.dirtyFiles.clear();
	}

	getDirtyCount(): number {
		return this.dirtyFiles.size;
	}
}
