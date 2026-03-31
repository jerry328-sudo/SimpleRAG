import { TFile } from "obsidian";

export function asTFile(value: unknown): TFile | null {
	return isTFile(value) ? value : null;
}

function isTFile(value: unknown): value is TFile {
	if (typeof TFile === "function" && value instanceof TFile) {
		return true;
	}

	return isTFileLike(value);
}

function isTFileLike(value: unknown): value is TFile {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.path === "string" &&
		typeof candidate.extension === "string" &&
		typeof candidate.stat === "object" &&
		candidate.stat !== null
	);
}
