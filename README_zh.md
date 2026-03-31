# SimpleRAG

[English](README.md)

适用于 [Obsidian](https://obsidian.md) 的本地 RAG（检索增强生成）插件。对 Vault 进行语义索引、相似度搜索，并与笔记 AI 对话——全部使用你自己的 API 密钥。

## 功能特性

- **语义搜索** — 按含义而非关键词查找笔记。文本分块后生成向量，按余弦相似度排序。
- **多模态索引** — 可选将笔记中引用的图片（png、jpg、webp、gif）与文本一起嵌入向量。
- **以图搜索** — 选择已索引的图片，查找语义或视觉上相似的内容。
- **AI 对话** — 基于 Vault 内容提问。插件自动检索相关上下文并发送给对话模型，回答附带来源引用。
- **AI 证据筛选** — 可选让对话模型在回答前筛选最相关的证据片段，降低噪音和 token 消耗。
- **视觉理解** — 使用支持视觉的对话模型时，图片证据会以内联图片形式发送，支持视觉推理。
- **重排序** — 可选在向量召回后进行 rerank，提升结果精度。
- **流式响应** — 当 Provider 支持时，对话回复实时流式输出。
- **增量索引** — 更新时仅重新嵌入变更文件，也可随时执行全量重建。
- **索引完整性** — Provider/模型设置变更时自动检测索引不匹配，提示重建。

## 支持的 Provider

| 角色 | Provider | 说明 |
|------|----------|------|
| Embedding | OpenAI 兼容 | 任何遵循 OpenAI `/v1/embeddings` 格式的 API |
| Embedding | Gemini | Google `text-embedding-004`、`gemini-embedding-2-preview` 等 |
| Chat | OpenAI 兼容 | GPT-4o-mini、DeepSeek、Qwen 或任何兼容端点 |
| Chat | Gemini | Gemini 2.5 Flash 等，支持流式和视觉输入 |
| Rerank | OpenAI 兼容 | 任何遵循 rerank 请求格式的 API |

所有网络请求均通过你自己的 API 密钥发出，不会向你配置的 Provider 以外的第三方发送任何数据。

## 安装

### 从 Obsidian 社区插件安装（即将上线）

1. 打开 **设置 → 社区插件 → 浏览**。
2. 搜索 **SimpleRAG**。
3. 点击 **安装**，然后 **启用**。

### 手动安装

1. 从 [最新 Release](https://github.com/user/simple-rag/releases) 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 创建目录：`<你的Vault>/.obsidian/plugins/simple-rag/`。
3. 将三个文件复制到该目录。
4. 重启 Obsidian，在 **设置 → 社区插件** 中启用 **SimpleRAG**。

## 快速开始

1. 打开 **设置 → SimpleRAG**。
2. 选择 **Embedding Provider**（如 OpenAI 兼容），输入 API Token。
3. 执行命令 **SimpleRAG: Scan vault for changes**（启动时会自动执行）。
4. 执行 **SimpleRAG: Update index** 对笔记进行向量嵌入。
5. 点击左侧功能区的搜索图标（或执行 **SimpleRAG: Open search panel**）开始搜索。

启用 AI 对话：打开 **Enable AI Chat** 开关，配置 **Chat Provider** 和 Token，在搜索面板中直接提问即可。

## 命令

| 命令 | 说明 |
|------|------|
| **Open search panel** | 打开 SimpleRAG 侧边栏 |
| **Scan vault for changes** | 检测新增、修改和删除的文件 |
| **Update index** | 增量嵌入变更文件 |
| **Rebuild full index** | 清除所有数据并从头重建索引 |

## 设置概览

| 分类 | 主要设置项 |
|------|-----------|
| **Provider** | Embedding Provider/模型/URL/Token，Chat Provider/模型/URL/Token |
| **功能** | 启用图片嵌入、启用 AI 对话 |
| **检索** | 启用重排序、召回池大小、每次查询结果数、默认结果标签页 |
| **对话** | 短笔记阈值、上下文最大笔记数、上下文窗口、AI 证据筛选 |
| **网络** | Rerank Provider/URL/Token、超时时间、重试次数、最大并发请求数 |
| **调试** | 显示相似度分数、启用调试日志 |

所有 API Token 存储在 Obsidian 的插件数据目录中，设置界面以密码字段显示。

## 隐私与安全

- **本地优先**：所有索引和存储都在 Vault 内部完成，除你配置的 API Provider 外不涉及任何外部服务器。
- **你的密钥，你的数据**：API Token 存储在 Obsidian 插件数据目录中，仅发送到你指定的端点。
- **无遥测**：插件不收集任何分析或使用数据。
- **无远程代码执行**：插件不会拉取或执行远程脚本。

## 开发

需要 Node.js 18+。

```bash
npm install
npm run dev      # 监听模式
npm run build    # 生产构建（类型检查 + 打包）
npm test         # 运行测试
npm run lint     # ESLint 检查
```

## 许可证

[MIT](LICENSE)
