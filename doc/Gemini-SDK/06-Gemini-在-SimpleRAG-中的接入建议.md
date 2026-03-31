# Gemini 在 SimpleRAG 中的接入建议

## 1. 这份文档的定位

前面几篇讲的是 Gemini API 自身怎么调用。

这一篇只讲一件事：

- 如果把 Gemini 接进 `SimpleRAG`，Provider 和功能边界应该怎么落

这里既基于官方 Gemini 文档，也基于本项目现有架构文档：

- `doc/01-SimpleRAG-RAG-详细设计与实施计划.md`
- `doc/02-SimpleRAG-项目规范与边界.md`
- `doc/03-SimpleRAG-项目架构与构建思路.md`

## 2. Gemini 和项目模块的对应关系

建议这样映射：

- `EmbeddingProvider`
  - Gemini 对应 `embedContent`
- `ChatProvider`
  - Gemini 对应 `generateContent` / `generateContentStream`
- `RerankProvider`
  - Gemini 没有一个“项目文档里已明确使用”的独立 rerank API
  - 如果后续要用 Gemini 做证据筛选或二次排序，应作为 LLM 阶段而不是硬编码成传统 rerank endpoint

## 3. 建议的 provider 配置项

### 必要项

- `apiKey`
- `chatModel`
- `embeddingModel`

### 可选项

- `enableGoogleSearchGrounding`
- `enableUrlContext`
- `enableFunctionCalling`
- `embeddingOutputDimensionality`
- `useStreaming`
- `thinkingLevel`

### 不建议第一版就暴露的项

- 过多的低层 sampling 参数
- 多套互相冲突的工具组合开关
- 让用户直接输入任意 JSON schema

## 4. 文本模式怎么接

如果项目运行在纯文本索引模式：

### 推荐

- embedding：
  - `gemini-embedding-001`
- chat：
  - `gemini-2.5-flash`

### 调用策略

- 文档 chunk：
  - `RETRIEVAL_DOCUMENT`
- 查询：
  - `RETRIEVAL_QUERY`

### 为什么这样最稳

- 纯文本模式不需要多模态 embedding
- `gemini-embedding-001` 对 RAG 检索路径更直接
- 切换成本也更清晰

## 5. 多模态模式怎么接

如果项目开启图片 embedding：

### 推荐

- embedding：
  - `gemini-embedding-2-preview`
- chat：
  - 选支持图片理解的 Gemini 文本模型

### 关键规则

- 文本和图片都要进同一个 embedding 空间
- 文本格式要按 Embeddings 2 的任务前缀方式处理
- 图片关闭 / 开启切换时，必须全量重建索引

### 为什么

因为官方已经明确：

- `gemini-embedding-001`
- `gemini-embedding-2-preview`

空间不兼容。

## 6. 在项目里的具体落点

### 6.1 索引阶段

文本模式：

- 读 markdown chunk
- 格式化文本
- `embedContent`
- 存本地向量

多模态模式：

- 读 markdown chunk
- 找出被 markdown 引用的图片
- 文本走 `embedContent`
- 图片也走 `embedContent`
- 统一写入本地索引

### 6.2 搜索阶段

文本查询：

- 生成 query embedding
- 本地向量检索
- 返回 chunk / image 结果

图片查询：

- 只在多模态模式允许
- 生成图片 embedding
- 本地向量检索

### 6.3 聊天阶段

- 把检索结果聚合成 document packets
- 可选：让 Gemini 做 evidence selection
- 最终再用 Gemini 生成回答

## 7. Gemini 做 evidence selection 的建议

项目现在已经有“可选 AI evidence selection”概念。

如果这个阶段用 Gemini，建议：

- 不要直接把所有原始 chunk 全量丢进去
- 先做本地召回和本地截断
- 只把 top K 候选和必要元数据交给模型
- 输出用结构化 JSON

推荐输出结构：

```json
{
  "selected_ids": ["chunk-1", "chunk-3", "asset-2"],
  "reasons": [
    "chunk-1 directly answers the query",
    "asset-2 is visually relevant to the user question"
  ]
}
```

## 8. Gemini 做聊天的建议

### 系统提示

建议固定强调这几条：

- 只能基于检索证据回答
- 不足以支持回答时必须说明
- 回答要保留引用
- 不要把 Google Search 引用和本地笔记引用混淆

### 流式

如果 UI 支持流式显示，优先用：

- `generateContentStream`

### 多模态聊天

如果当前证据里包含图片：

- 文本 chunk 直接放文本
- 图片走 `inlineData` 或 file URI

## 9. Gemini 联网能力在本项目里怎么放

### Google Search

适合：

- 补充公开网页实时信息

不适合：

- 直接代替本地 RAG

### URL Context

适合：

- 用户显式给 URL 时
- 需要对指定网页做深读时

### Function Calling

适合：

- 让模型反向调用本地搜索、笔记读取、资产查询等内部函数
- 接企业私有搜索接口

## 10. Base URL 怎么理解

Gemini 官方文档里的 REST 示例通常都直接使用：

```text
https://generativelanguage.googleapis.com
```

所以对 Gemini provider 来说：

- 默认 Base URL 应该是官方固定值
- 一般不需要像 OpenAI-compatible provider 那样鼓励用户随意改

但如果项目设置页统一要求保留 `Base URL` 字段，也可以：

- 默认填官方地址
- 普通用户不建议修改

## 11. 对项目状态管理的影响

如果选 Gemini 作为 embedding provider，本项目必须把以下元数据写入本地索引状态：

- `embedding_provider = gemini`
- `embedding_model`
- `embedding_dimension`
- `index_mode`

只要这些有任何变化：

- 搜索应拒绝静默混用旧向量
- 必须提示用户重建索引

## 12. 建议的实现顺序

如果未来真的要加 Gemini provider，建议按这个顺序：

1. 先实现纯文本 `EmbeddingProvider`
2. 再实现纯文本 `ChatProvider`
3. 接着补 `generateContentStream`
4. 再补多模态 embedding
5. 再补多模态聊天
6. 最后再接 Google Search / URL Context / Function Calling

原因：

- 这样风险最可控
- 每一步都能和当前项目架构自然对齐

## 13. 当前不建议一开始做的事

- 不要一开始就同时接 Google Search、URL Context、Function Calling 三套联网模式
- 不要把 Gemini 写成一个特殊分支，绕过 provider 抽象
- 不要在文本模式和多模态模式间复用同一套旧 embedding
- 不要把“结构化输出”和“本地引用机制”混成一套

## 14. 推荐阅读顺序

如果你准备真正把 Gemini 接入项目，推荐这样读：

1. [[01-Gemini-快速开始与认证]]
2. [[03-Gemini-Embedding-模型调用]]
3. [[02-Gemini-LLM-文本生成与聊天]]
4. [[04-Gemini-多模态输入与-Files-API]]
5. [[05-Gemini-联网、工具调用与外部能力]]

## 15. 官方来源

- Gemini API 快速开始：
  - <https://ai.google.dev/gemini-api/docs/quickstart?hl=zh-cn>
- 文本生成：
  - <https://ai.google.dev/gemini-api/docs/text-generation>
- Embeddings：
  - <https://ai.google.dev/gemini-api/docs/embeddings?hl=zh-CN>
- Files API：
  - <https://ai.google.dev/gemini-api/docs/files>
- Google Search：
  - <https://ai.google.dev/gemini-api/docs/google-search>
- URL Context：
  - <https://ai.google.dev/gemini-api/docs/url-context>
- Function Calling：
  - <https://ai.google.dev/gemini-api/docs/function-calling>
