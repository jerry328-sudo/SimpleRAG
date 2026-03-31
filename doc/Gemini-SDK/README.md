# Gemini SDK 文档索引

整理时间：2026-03-31

本目录用于整理 Google 官方 Gemini API 文档中，与 `SimpleRAG` 后续接入最相关的能力：

- LLM 文本生成
- Chat / 流式输出
- Embedding 模型
- 多模态输入
- Files API
- Google Search / URL Context / Function Calling 等联网与工具能力

## 这套文档怎么用

如果你只是想快速接入：

1. 先看 `01-Gemini-快速开始与认证`
2. 再看 `02-Gemini-LLM-文本生成与聊天`
3. 如果要做向量检索，看 `03-Gemini-Embedding-模型调用`
4. 如果要做图片、PDF、音频等输入，看 `04-Gemini-多模态输入与-Files-API`
5. 如果要让模型联网或调用外部工具，看 `05-Gemini-联网、工具调用与外部能力`
6. 如果要落到本项目里，看 `06-Gemini-在-SimpleRAG-中的接入建议`

## 文档列表

1. [[01-Gemini-快速开始与认证]]
2. [[02-Gemini-LLM-文本生成与聊天]]
3. [[03-Gemini-Embedding-模型调用]]
4. [[04-Gemini-多模态输入与-Files-API]]
5. [[05-Gemini-联网、工具调用与外部能力]]
6. [[06-Gemini-在-SimpleRAG-中的接入建议]]

## 适用范围

- 以官方 Gemini API 文档为主
- 以 JavaScript / TypeScript 调用为重点，因为 `SimpleRAG` 是 Obsidian 插件项目
- 同时补充 REST 结构，便于调试和抓包

## 使用前提

- 你已经有 Google AI Studio 的 API Key
- 你知道本项目后续会把模型调用封装进 Provider，而不是把厂商 SDK 写死在业务层
- 你接受这里的内容主要是“实现导向的整理”，不是对官方文档的逐句翻译

## 重要说明

- Gemini 的模型名称、预览版状态、支持的工具组合、价格和限制变化都比较快。
- 本目录内容基于 2026-03-31 当天查阅的官方文档整理。
- 真正上线前，请再对照官方模型页、价格页、速率限制页和发布说明做一次复核。

## 官方来源

- Gemini API 快速开始：
  - <https://ai.google.dev/gemini-api/docs/quickstart?hl=zh-cn>
- 文本生成：
  - <https://ai.google.dev/gemini-api/docs/text-generation>
- 结构化输出：
  - <https://ai.google.dev/gemini-api/docs/structured-output?hl=zh-CN>
- Embeddings：
  - <https://ai.google.dev/gemini-api/docs/embeddings?hl=zh-CN>
- 图片理解：
  - <https://ai.google.dev/gemini-api/docs/image-understanding?hl=zh-cn>
- Files API：
  - <https://ai.google.dev/gemini-api/docs/files>
- Grounding with Google Search：
  - <https://ai.google.dev/gemini-api/docs/google-search>
- URL Context：
  - <https://ai.google.dev/gemini-api/docs/url-context>
- Function Calling：
  - <https://ai.google.dev/gemini-api/docs/function-calling>
- Token counting：
  - <https://ai.google.dev/gemini-api/docs/tokens>
- 模型总览：
  - <https://ai.google.dev/gemini-api/docs/models?hl=zh-CN>
