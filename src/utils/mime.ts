export function imageMimeTypeFromExtension(extension: string): string {
	switch (extension.toLowerCase()) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		default:
			return "application/octet-stream";
	}
}

export function imageMimeTypeFromPath(path: string): string {
	return imageMimeTypeFromExtension(path.split(".").pop() ?? "");
}
