import type { App, TFile } from "obsidian";
import type { BinaryImagePayload } from "../types/media";
import { arrayBufferToImagePayload } from "../utils/base64";
import { imageMimeTypeFromExtension, imageMimeTypeFromPath } from "../utils/mime";
import { asTFile } from "../utils/obsidian-file";

export interface LoadedVaultImage {
	file: TFile;
	buffer: ArrayBuffer;
	payload: BinaryImagePayload;
}

export function getVaultImageFile(
	app: App,
	assetPath: string
): TFile | null {
	return asTFile(app.vault.getAbstractFileByPath(assetPath));
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

	const buffer = await app.vault.readBinary(file);
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
