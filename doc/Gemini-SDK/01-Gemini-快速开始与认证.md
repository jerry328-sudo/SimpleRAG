# Gemini 快速开始与认证

## 1. 目标

这份文档回答 4 个最基础的问题：

1. Gemini API 最小调用长什么样
2. JavaScript / TypeScript 项目应该怎么接
3. `generateContent` 请求体的基本结构是什么
4. 本项目里后续怎么保存和使用 API Key

## 2. 先建立一个最小心智模型

Gemini API 里最常用的两个入口是：

- `models.generateContent`
  - 用于 LLM 文本生成、多模态理解、聊天式对话、结构化输出、工具调用
- `models.embedContent`
  - 用于向量化文本、图片、音频、视频、PDF 等内容

在 `SimpleRAG` 里，这两条会分别落到：

- `ChatProvider`
- `EmbeddingProvider`

也就是说，Gemini 接入本项目时，最关键的并不是“如何写一段 demo”，而是把这两个 API 映射到我们已有的 provider 抽象中。

## 3. 获取 API Key

官方入口：

- Google AI Studio：<https://aistudio.google.com/>

Gemini 官方文档默认假设 API Key 放在环境变量 `GEMINI_API_KEY` 中。但对 Obsidian 插件来说，不能把这件事当成前提，因为用户通常不会给桌面插件单独配置 shell 环境变量。

所以对本项目的建议是：

- 文档和本地 demo 可以使用 `GEMINI_API_KEY`
- 真正插件实现里应把 Key 存在插件设置里
- 调用时再把 Key 传给 provider 客户端

## 4. JavaScript SDK 安装

官方 JavaScript SDK 包名：

```bash
npm install @google/genai
```

对于本项目，后续通常会把它包在 provider 实现里，而不是在业务代码里到处直接 `new GoogleGenAI(...)`。

## 5. 最小文本生成调用

### 5.1 JavaScript

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "用一句话解释什么是向量检索。",
});

console.log(response.text);
```

### 5.2 REST

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          { "text": "用一句话解释什么是向量检索。" }
        ]
      }
    ]
  }'
```

说明：

- SDK 里常用 `contents: "..."` 的简写形式
- REST 里要显式写成 `contents -> parts -> text`
- `model` 不是固定值，真正上线前要以官方模型页为准

## 6. `generateContent` 请求结构

最常见的几个字段：

- `model`
  - 选哪个 Gemini 模型
- `contents`
  - 用户输入内容，可以是纯文本，也可以是文本 + 图片 + 文件等多模态组合
- `config`
  - 生成配置，例如系统提示、温度、停止序列、结构化输出、工具调用

可以把它理解成：

```ts
await ai.models.generateContent({
  model: "...",
  contents: ...,
  config: ...,
});
```

其中：

- `contents` 决定“给模型看什么”
- `config` 决定“让模型怎么回答”

## 7. `contents` 的三种常见写法

### 7.1 直接传字符串

最适合单轮文本请求：

```ts
contents: "总结这段文本"
```

### 7.2 传单个内容对象

适合显式控制 `parts`：

```ts
contents: {
  role: "user",
  parts: [
    { text: "请总结这张图片" },
  ],
}
```

### 7.3 传历史消息数组

适合手动构造多轮对话：

```ts
contents: [
  {
    role: "user",
    parts: [{ text: "你好" }],
  },
  {
    role: "model",
    parts: [{ text: "你好，我可以帮你做笔记检索。" }],
  },
  {
    role: "user",
    parts: [{ text: "继续解释 RAG。" }],
  },
]
```

## 8. 本项目里推荐的认证方式

对于 `SimpleRAG`，建议不要依赖环境变量，而是走下面这套路径：

1. 用户在设置页填写 Gemini API Key
2. 插件把 Key 保存在插件私有配置中
3. Provider 初始化时读取配置
4. 发请求时显式传入 `apiKey`

这样做的好处：

- 更符合 Obsidian 插件使用方式
- 用户不需要配置系统环境变量
- 更容易做 provider 切换

## 9. 如何选择 SDK 还是 REST

### 优先用 SDK 的场景

- 正常业务接入
- 想直接使用 `generateContent`、`embedContent`、`files.upload`
- 想用更自然的 TypeScript 对象结构

### 优先用 REST 的场景

- 排查请求结构问题
- 对照抓包看真实请求
- 在没有 SDK 的环境中做最小复现

对 `SimpleRAG` 的结论：

- 生产代码优先 SDK
- 文档、测试和定位问题时保留 REST 对照

## 10. 计费与 token 的最小认知

Gemini 官方提供两种常见 token 观察方式：

- 调用 `countTokens`
  - 在发送请求前估算输入大小
- 查看响应里的 `usage_metadata`
  - 看输入 token、输出 token、总 token

这对本项目有两层意义：

- 聊天模式里要控制上下文大小
- 多模态模式下图片、PDF、URL 工具也会占 token

## 11. 对本项目的最低落地建议

如果只是先把 Gemini 接进 `SimpleRAG`，建议第一步只做：

- Chat：
  - `generateContent`
- Embedding：
  - `embedContent`
- 配置：
  - `apiKey`
  - `chatModel`
  - `embeddingModel`

先不要一上来就把 Search grounding、URL Context、Function Calling、Files API 全部混进第一版 provider。

## 12. 你接下来应该看哪篇

- 如果你要接文本生成、聊天、流式输出、结构化输出：
  - 看 [[02-Gemini-LLM-文本生成与聊天]]
- 如果你要接向量模型：
  - 看 [[03-Gemini-Embedding-模型调用]]
- 如果你要接图片、PDF 等输入：
  - 看 [[04-Gemini-多模态输入与-Files-API]]

## 13. 官方来源

- 快速开始：<https://ai.google.dev/gemini-api/docs/quickstart?hl=zh-cn>
- 文本生成：<https://ai.google.dev/gemini-api/docs/text-generation>
- Token 计数：<https://ai.google.dev/gemini-api/docs/tokens>
- 模型总览：<https://ai.google.dev/gemini-api/docs/models?hl=zh-CN>
