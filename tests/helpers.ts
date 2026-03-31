type MockFileSpec = {
	content?: string;
	binary?: Uint8Array;
	mtime?: number;
	size?: number;
};

type MockFile = {
	path: string;
	extension: string;
	stat: {
		mtime: number;
		size: number;
	};
	__content?: string;
	__binary?: Uint8Array;
};

function getExtension(path: string): string {
	return path.split(".").pop()?.toLowerCase() ?? "";
}

function createMockFile(path: string, spec: MockFileSpec): MockFile {
	const content = spec.content;
	const binary = spec.binary;
	const size =
		spec.size ??
		(content?.length ?? binary?.byteLength ?? 0);
	return {
		path,
		extension: getExtension(path),
		stat: {
			mtime: spec.mtime ?? 1,
			size,
		},
		__content: content,
		__binary: binary,
	};
}

export function createMockApp(initialFiles: Record<string, MockFileSpec> = {}) {
	const storage = new Map<string, string>();
	const files = new Map<string, MockFile>();

	for (const [path, spec] of Object.entries(initialFiles)) {
		files.set(path, createMockFile(path, spec));
	}

	const adapter = {
		async exists(path: string) {
			if (storage.has(path)) return true;
			const prefix = path.endsWith("/") ? path : `${path}/`;
			return Array.from(storage.keys()).some((key) => key.startsWith(prefix));
		},
		async read(path: string) {
			const value = storage.get(path);
			if (value == null) {
				throw new Error(`No file at ${path}`);
			}
			return value;
		},
		async write(path: string, content: string) {
			storage.set(path, content);
		},
		async mkdir(_path: string) {
			// noop for in-memory adapter
		},
	};

	const vault = {
		adapter,
		getFiles() {
			return Array.from(files.values());
		},
		getAbstractFileByPath(path: string) {
			return files.get(path) ?? null;
		},
		async cachedRead(file: MockFile) {
			return file.__content ?? "";
		},
		async readBinary(file: MockFile) {
			const bytes = file.__binary ?? new Uint8Array();
			return bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength
			);
		},
	};

	return {
		app: {
			vault,
			workspace: {},
		} as any,
		setTextFile(path: string, content: string, mtime = Date.now()) {
			files.set(
				path,
				createMockFile(path, {
					content,
					mtime,
				})
			);
		},
		setBinaryFile(path: string, binary: Uint8Array, mtime = Date.now()) {
			files.set(
				path,
				createMockFile(path, {
					binary,
					mtime,
				})
			);
		},
		removeFile(path: string) {
			files.delete(path);
		},
		getStoredFile(path: string) {
			return files.get(path);
		},
		storage,
	};
}
