# SimpleRAG

[中文文档](README_zh.md)

Local RAG (Retrieval-Augmented Generation) plugin for [Obsidian](https://obsidian.md). Index your vault, search with semantic similarity, and chat with your notes — all powered by your own API keys.

## Features

- **Semantic search** — Find notes by meaning, not just keywords. Chunks are embedded and ranked by cosine similarity.
- **Multimodal indexing** — Optionally embed images (png, jpg, webp, gif) referenced in your notes alongside text chunks.
- **Image search** — Search by image: select an indexed image and find visually or semantically similar content.
- **AI chat** — Ask questions about your vault. The plugin retrieves relevant context and sends it to a chat model with source citations.
- **AI evidence selection** — Optionally let the chat model pick the most relevant evidence packets before answering, reducing noise and token cost.
- **Vision support** — When using a vision-capable chat model, image evidence is sent as inline images for visual reasoning.
- **Reranking** — Optional rerank pass to improve result precision after vector recall.
- **Streaming responses** — Chat answers stream in real-time when the provider supports it.
- **Incremental indexing** — Only changed files are re-embedded on update. Full rebuild is available when needed.
- **Index integrity** — Automatic mismatch detection when provider/model settings change; prompts for rebuild.

## Supported Providers

| Role | Provider | Notes |
|------|----------|-------|
| Embedding | OpenAI-compatible | Any API following the OpenAI `/v1/embeddings` format |
| Embedding | Gemini | Google `text-embedding-004`, `gemini-embedding-2-preview`, etc. |
| Chat | OpenAI-compatible | GPT-4o-mini, DeepSeek, Qwen, or any compatible endpoint |
| Chat | Gemini | Gemini 2.5 Flash, etc. with streaming and vision |
| Rerank | OpenAI-compatible | Any API following a rerank request format |

All network calls go through your own API keys. No data is sent to third parties beyond the provider you configure.

## Installation

### From Obsidian Community Plugins (coming soon)

1. Open **Settings → Community plugins → Browse**.
2. Search for **SimpleRAG**.
3. Click **Install**, then **Enable**.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/user/simple-rag/releases).
2. Create a folder: `<YourVault>/.obsidian/plugins/simple-rag/`.
3. Copy the three files into that folder.
4. Restart Obsidian and enable **SimpleRAG** in **Settings → Community plugins**.

## Quick Start

1. Open **Settings → SimpleRAG**.
2. Choose an **Embedding provider** (e.g., OpenAI-compatible) and enter your API token.
3. Run the command **SimpleRAG: Scan vault for changes** (or it runs automatically on startup).
4. Run **SimpleRAG: Update index** to embed your notes.
5. Click the search icon in the left ribbon (or run **SimpleRAG: Open search panel**) to start searching.

To enable chat: toggle **Enable AI Chat**, configure a **Chat provider** and token, then ask questions in the search panel.

## Commands

| Command | Description |
|---------|-------------|
| **Open search panel** | Open the SimpleRAG sidebar |
| **Scan vault for changes** | Detect new, modified, and deleted files |
| **Update index** | Embed dirty files incrementally |
| **Rebuild full index** | Clear everything and re-index from scratch |

## Settings Overview

| Category | Key Settings |
|----------|-------------|
| **Providers** | Embedding provider/model/URL/token, Chat provider/model/URL/token |
| **Features** | Enable image embedding, Enable AI chat |
| **Retrieval** | Enable rerank, recall pool size, results per query, default result tab |
| **Chat** | Short note threshold, max notes in context, context window, AI evidence selection |
| **Network** | Rerank provider/URL/token, timeout, retry count, max concurrent requests |
| **Debug** | Show similarity scores, enable debug logs |

All API tokens are stored locally in Obsidian's plugin data and displayed as password fields in settings.

## Privacy & Security

- **Local-first**: All indexing and storage happens inside your vault. No external server is involved beyond the API providers you configure.
- **Your keys, your data**: API tokens are stored in Obsidian's plugin data directory, never transmitted except to the endpoints you specify.
- **No telemetry**: The plugin does not collect any analytics or usage data.
- **No remote code execution**: The plugin does not fetch or execute remote scripts.

## Development

Requires Node.js 18+.

```bash
npm install
npm run dev      # Watch mode
npm run build    # Production build (type-check + bundle)
npm test         # Run tests
npm run lint     # ESLint
```

## License

[MIT](LICENSE)
