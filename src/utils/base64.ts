export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
}

export function toDataUrl(base64: string, mimeType: string): string {
	return `data:${mimeType};base64,${base64}`;
}

export function arrayBufferToDataUrl(
	buffer: ArrayBuffer,
	mimeType: string
): string {
	return toDataUrl(arrayBufferToBase64(buffer), mimeType);
}

export function parseDataUrl(value: string):
	| { mimeType: string; data: string }
	| null {
	const match = value.match(/^data:([^;,]+);base64,(.+)$/);
	if (!match) {
		return null;
	}

	return {
		mimeType: match[1]!,
		data: match[2]!,
	};
}
