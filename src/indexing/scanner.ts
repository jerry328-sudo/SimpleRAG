import type { App, TFile } from "obsidian";
import type { Database } from "../storage/db";
import type { FileRecord } from "../types/domain";

/**
 * Scans the vault for Markdown and image files, comparing with database records
 * to identify new, modified, and deleted files.
 */
export class VaultScanner {
	private app: App;
	private db: Database;

	constructor(app: App, db: Database) {
		this.app = app;
		this.db = db;
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

		// Gather all vault files
		const vaultFiles = this.app.vault.getFiles();
		const vaultPaths = new Set<string>();

		for (const file of vaultFiles) {
			if (!this.isSupported(file)) continue;

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

	private isSupported(file: TFile): boolean {
		const ext = file.extension.toLowerCase();
		// Markdown notes
		if (ext === "md") return true;
		// Image assets
		if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return true;
		return false;
	}

	private getFileKind(file: TFile): "note" | "asset" {
		return file.extension.toLowerCase() === "md" ? "note" : "asset";
	}

	private getExt(file: TFile): string {
		return "." + file.extension.toLowerCase();
	}
}
