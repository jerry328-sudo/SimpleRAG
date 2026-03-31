/** Vault-relative path using '/' separator, no absolute paths */
export type VaultPath = string;

export type FileKind = "note" | "asset";

export type FileStatus = "indexed" | "dirty" | "deleted" | "skipped" | "error";

export type IndexMode = "text-only" | "multimodal";

export type OwnerType = "note_chunk" | "asset";

export type EmbeddingModality = "text" | "image" | "multimodal";

export type LinkKind = "wikilink" | "markdown-image";

export interface FileRecord {
	path: VaultPath;
	kind: FileKind;
	ext: string;
	mtime_ms: number;
	size_bytes: number;
	content_hash: string | null;
	status: FileStatus;
	indexed_at_ms: number | null;
	last_seen_scan_ms: number | null;
	last_error: string | null;
}

export interface NoteChunk {
	chunk_id: string;
	note_path: VaultPath;
	chunk_index: number;
	heading_path_json: string;
	heading_path_text: string;
	text: string;
	text_for_embedding: string;
	char_start: number | null;
	char_end: number | null;
	token_estimate: number | null;
}

export interface AssetRecord {
	asset_path: VaultPath;
	mime_type: string | null;
	reference_count: number;
	indexed_at_ms: number | null;
}

export interface AssetMention {
	mention_id: string;
	asset_path: VaultPath;
	note_path: VaultPath;
	mention_index: number;
	heading_path_json: string;
	heading_path_text: string;
	raw_target: string;
	link_kind: LinkKind;
	surrounding_text: string | null;
	near_chunk_id: string | null;
}

export interface EmbeddingRecord {
	owner_id: string;
	owner_type: OwnerType;
	provider_id: string;
	model_id: string;
	modality: EmbeddingModality;
	dimension: number;
	vector: number[];
	created_at_ms: number;
}

export interface SearchResult {
	type: "note" | "image";
	score: number;
	chunk?: NoteChunk;
	asset?: AssetRecord;
	mentions?: AssetMention[];
	notePath: VaultPath;
	headingPath: string;
	snippet: string;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatReference {
	index: number;
	type: "note" | "image";
	path: VaultPath;
	headingPath: string;
	snippet: string;
}

export interface ChatResponse {
	content: string;
	references: ChatReference[];
}

export interface IndexStats {
	indexMode: IndexMode;
	lastScanAt: number | null;
	lastIndexAt: number | null;
	totalNotes: number;
	totalChunks: number;
	totalAssets: number;
	dirtyFiles: number;
}
