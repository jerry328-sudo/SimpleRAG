import type { App } from "obsidian";
import type { BinaryImagePayload } from "../types/media";
import { arrayBufferToImagePayload } from "../utils/base64";
import { imageMimeTypeFromExtension, imageMimeTypeFromPath } from "../utils/mime";

type VaultBinaryFile = {
	path: string;
	extension: string;
	stat?: {
		mtime: number;
		size: number;
	};
};

function asVaultBinaryFile(file: unknown): VaultBinaryFile | null {
	if (
		typeof file !== "object" ||
		file === null ||
		!("path" in file) ||
		!("extension" in file) ||
		typeof (file as { path?: unknown }).path !== "string" ||
		typeof (file as { extension?: unknown }).extension !== "string"
	) {
		return null;
	}

	return file as VaultBinaryFile;
}

export interface LoadedVaultImage {
	file: VaultBinaryFile;
	buffer: ArrayBuffer;
	payload: BinaryImagePayload;
}

export function getVaultImageFile(
	app: App,
	assetPath: string
): VaultBinaryFile | null {
	return asVaultBinaryFile(app.vault.getAbstractFileByPath(assetPath));
}

export async function loadVaultImagePayload(
	app: App,
	assetPath: string
): Promise<BinaryImagePayload> {
	return (await loadVaultImageData(app, assetPath)).payload;
}

export async function loadVaultImageData(
	app: App,
	assetPath: string
): Promise<LoadedVaultImage> {
	const file = getVaultImageFile(app, assetPath);
	if (!file) {
		throw new Error(`Image not found: ${assetPath}`);
	}

	const buffer = await app.vault.readBinary(file as any);
	return {
		file,
		buffer,
		payload: arrayBufferToImagePayload(
			buffer,
			imageMimeTypeFromExtension(file.extension)
		),
	};
}

export async function tryLoadVaultImagePayload(
	app: App,
	assetPath: string
): Promise<BinaryImagePayload | undefined> {
	try {
		return await loadVaultImagePayload(app, assetPath);
	} catch {
		return undefined;
	}
}

export function getImageMimeTypeForPath(assetPath: string): string {
	return imageMimeTypeFromPath(assetPath);
}
