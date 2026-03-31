import type { App, TFile } from "obsidian";
import type { Database } from "../storage/db";
import type { SimpleRAGSettings } from "../settings/types";

/**
 * Scans the vault for Markdown and image files, comparing with database records
 * to identify new, modified, and deleted files.
 */
export class VaultScanner {
	private app: App;
	private db: Database;
	private settings: SimpleRAGSettings;

	constructor(app: App, db: Database, settings: SimpleRAGSettings) {
		this.app = app;
		this.db = db;
		this.settings = settings;
	}

	/**
	 * Perform a lightweight scan comparing vault files against the database.
	 * Does not read file contents — only metadata (path, mtime, size).
	 * Returns paths that have changed.
	 */
	async scan(): Promise<{
		added: string[];
		modified: string[];
		deleted: string[];
	}> {
		const added: string[] = [];
		const modified: string[] = [];
		const deleted: string[] = [];

		const now = Date.now();

		const trackedAssetPaths = new Set(
			this.settings.enableImageEmbedding
				? this.db
						.getFilesByKind("asset")
						.map((file) => file.path)
				: []
		);

		// Gather all vault files
		const vaultFiles = this.app.vault.getFiles();
		const vaultPaths = new Set<string>();

		for (const file of vaultFiles) {
			if (!this.isSupported(file, trackedAssetPaths)) continue;

			const path = file.path;
			vaultPaths.add(path);

			const existing = this.db.getFile(path);

			if (!existing) {
				// New file
				added.push(path);
				this.db.upsertFile({
					path,
					kind: this.getFileKind(file),
					ext: this.getExt(file),
					mtime_ms: file.stat.mtime,
					size_bytes: file.stat.size,
					content_hash: null,
					status: "dirty",
					indexed_at_ms: null,
					last_seen_scan_ms: now,
					last_error: null,
				});
			} else if (
				existing.mtime_ms !== file.stat.mtime ||
				existing.size_bytes !== file.stat.size
			) {
				// Modified file
				modified.push(path);
				this.db.upsertFile({
					...existing,
					mtime_ms: file.stat.mtime,
					size_bytes: file.stat.size,
					status: "dirty",
					last_seen_scan_ms: now,
					last_error: null,
				});
			} else {
				// Unchanged — update scan timestamp only
				this.db.upsertFile({
					...existing,
					last_seen_scan_ms: now,
				});
			}
		}

		// Find deleted files (in db but not in vault)
		for (const record of this.db.getAllFiles()) {
			if (!vaultPaths.has(record.path)) {
				deleted.push(record.path);
				this.db.upsertFile({
					...record,
					status: "deleted",
					last_seen_scan_ms: now,
				});
			}
		}

		this.db.setMeta("last_scan_at", String(now));
		await this.db.save();

		return { added, modified, deleted };
	}

	private isSupported(file: TFile, trackedAssetPaths: Set<string>): boolean {
		const ext = file.extension.toLowerCase();
		// Markdown notes
		if (ext === "md") return true;
		// Only track images that are already referenced/indexed when multimodal
		if (!this.settings.enableImageEmbedding) return false;
		if (!["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return false;
		return trackedAssetPaths.has(file.path);
	}

	private getFileKind(file: TFile): "note" | "asset" {
		return file.extension.toLowerCase() === "md" ? "note" : "asset";
	}

	private getExt(file: TFile): string {
		return "." + file.extension.toLowerCase();
	}
}
