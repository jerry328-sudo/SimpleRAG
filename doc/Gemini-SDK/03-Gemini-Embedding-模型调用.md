# Gemini Embedding 模型调用

## 1. 这一层在项目里负责什么

在 `SimpleRAG` 里，Embedding 负责：

- 为文本 chunk 生成向量
- 在多模态模式下为图片生成向量
- 后续如果扩展，也可以为 PDF、音频、视频生成向量

Gemini 的主入口是：

```ts
ai.models.embedContent(...)
```

## 2. 当前最关键的两个模型

官方 Embeddings 文档里，当前最值得关注的是：

- `gemini-embedding-001`
  - 纯文本 embedding
  - 稳定可用
- `gemini-embedding-2-preview`
  - 多模态 embedding
  - 支持文本、图片、视频、音频、PDF
  - 跨模态映射到统一向量空间

## 3. 一条重要规则：不要混用不同 embedding 空间

官方明确说明：

- `gemini-embedding-001`
- `gemini-embedding-2-preview`

这两个模型的 embedding 空间不兼容。

对项目的直接约束：

- 只要从 `001` 切到 `2-preview`
  - 必须全量重建索引
- 只要换成另一个 embedding 模型
  - 也必须全量重建索引

这和我们现有的项目边界文档完全一致。

## 4. 最小文本 embedding 调用

### JavaScript

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.embedContent({
  model: "gemini-embedding-001",
  contents: "RAG 会先召回相关文档，再把它们提供给 LLM。",
});

console.log(response.embeddings[0].values);
```

### REST

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": {
      "parts": [
        { "text": "RAG 会先召回相关文档，再把它们提供给 LLM。" }
      ]
    }
  }'
```

## 5. 批量 embedding

Gemini 支持一次性传多个条目。

```ts
const response = await ai.models.embedContent({
  model: "gemini-embedding-001",
  contents: [
    "什么是向量数据库？",
    "如何做 chunking？",
    "Rerank 的作用是什么？",
  ],
});

for (const embedding of response.embeddings) {
  console.log(embedding.values.length);
}
```

这对 RAG 建库很重要，因为：

- 你不应该每个 chunk 都单独发一次请求
- 应该在 provider 层做合理分批

## 6. `gemini-embedding-001` 的任务类型

官方给 `gemini-embedding-001` 提供了 `taskType`。

典型值包括：

- `SEMANTIC_SIMILARITY`
- `CLASSIFICATION`
- `CLUSTERING`
- `RETRIEVAL_DOCUMENT`
- `RETRIEVAL_QUERY`
- `CODE_RETRIEVAL_QUERY`
- `QUESTION_ANSWERING`
- `FACT_VERIFICATION`

### 对 RAG 最重要的是哪两个

- 文档建索引：
  - `RETRIEVAL_DOCUMENT`
- 用户查询：
  - `RETRIEVAL_QUERY`

### JavaScript 示例

```ts
const queryEmbedding = await ai.models.embedContent({
  model: "gemini-embedding-001",
  contents: "如何做增量索引？",
  config: {
    taskType: "RETRIEVAL_QUERY",
  },
});

const docEmbedding = await ai.models.embedContent({
  model: "gemini-embedding-001",
  contents: "增量索引通常依赖文件变更检测和脏数据集合。",
  config: {
    taskType: "RETRIEVAL_DOCUMENT",
  },
});
```

## 7. `gemini-embedding-2-preview` 的任务方式不一样

官方特别强调：

- `gemini-embedding-2-preview` 不使用 `taskType`
- 纯文本任务建议通过“任务前缀”来告诉模型当前是做检索、问答、分类还是相似度比较

### 7.1 检索用例

查询建议格式：

```text
task: search result | query: 如何更新 Obsidian 索引？
```

文档建议格式：

```text
title: 索引更新 | text: 发生文件变更后，只对 dirty 文件做重建。
```

### 7.2 对称任务

比如分类、聚类、句子相似度，查询和文档可以用同一种格式。

## 8. 输出维度

官方文档给出的结论：

- `gemini-embedding-001` 和 `gemini-embedding-2-preview` 都支持可变维度
- 支持范围：128 到 3072
- 推荐常见值：768、1536、3072

### JavaScript

```ts
const response = await ai.models.embedContent({
  model: "gemini-embedding-001",
  contents: "什么是 rerank？",
  config: {
    outputDimensionality: 768,
  },
});
```

## 9. 归一化

官方文档明确说：

- 3072 维 embedding 已归一化
- 其他维度如果你要做余弦相似度，建议自己先归一化

### JavaScript 示例

```ts
function normalize(vec: number[]) {
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
  if (!norm) return vec;
  return vec.map((x) => x / norm);
}
```

对本项目的建议：

- 如果后端相似度统一用 cosine similarity
  - 对非 3072 维向量在写入或查询前统一归一化

## 10. 多模态 embedding

`gemini-embedding-2-preview` 是 Gemini API 当前最关键的多模态 embedding 模型。

它支持：

- 文本
- 图片
- 视频
- 音频
- PDF

而且这些模态映射到同一个 embedding 空间中。

这意味着理论上可以支持：

- 文搜文
- 文搜图
- 图搜图
- 图搜文

这正好对齐我们项目的多模态检索设计。

## 11. 多模态 embedding 的限制

官方文档中的关键限制：

- 总输入 token 上限：8192
- 图片：每请求最多 6 张，格式为 PNG、JPEG
- 音频：最长 80 秒，格式为 MP3、WAV
- 视频：最长 120 秒，格式为 MP4、MOV
- PDF：最多 6 页

这意味着对 `SimpleRAG` 来说：

- 多模态索引最好从“图片”开始
- 不要第一版就把 PDF、视频一起塞进同一条建库链路

## 12. 图片 embedding：最小示例

```ts
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const base64Image = fs.readFileSync("example.png", { encoding: "base64" });

const response = await ai.models.embedContent({
  model: "gemini-embedding-2-preview",
  contents: [
    {
      inlineData: {
        mimeType: "image/png",
        data: base64Image,
      },
    },
  ],
});

console.log(response.embeddings[0].values);
```

## 13. 聚合 embedding vs 多条 embedding

这是官方文档里一个非常关键但很容易忽略的点。

### 13.1 一个 `content` 里放多个 `parts`

会得到一个聚合 embedding。

例如：

```ts
contents: {
  parts: [
    { text: "一张关于索引结构的示意图" },
    { inlineData: { mimeType: "image/png", data: imgBase64 } },
  ],
}
```

这更适合：

- “图片 + 描述” 作为同一个对象
- 为一个复合对象生成一个统一向量

### 13.2 `contents` 数组里放多个条目

会得到多个 embedding。

例如：

```ts
contents: [
  "这是一段文本",
  { inlineData: { mimeType: "image/png", data: imgBase64 } },
]
```

这更适合：

- 一次请求生成多个独立向量
- 批量建索引

## 14. 在 `SimpleRAG` 里的推荐策略

### 文本模式

- 模型：
  - `gemini-embedding-001`
- 文档：
  - `RETRIEVAL_DOCUMENT`
- 查询：
  - `RETRIEVAL_QUERY`

### 多模态模式

- 模型：
  - `gemini-embedding-2-preview`
- 文本：
  - 用任务前缀格式化
- 图片：
  - 直接用图片数据或 Files API 文件引用
- 开关切换后：
  - 强制全量重建索引

## 15. 不建议的做法

- 不要把 `001` 和 `2-preview` 的向量混在同一个可搜索集合里
- 不要只换配置不重建索引
- 不要在 `gemini-embedding-2-preview` 上继续沿用 `taskType`
- 不要忽略向量维度变化
- 不要把“一个复合对象的聚合 embedding”和“多个独立对象的 embedding”混为一谈

## 16. 官方来源

- Embeddings：<https://ai.google.dev/gemini-api/docs/embeddings?hl=zh-CN>
- 模型总览：<https://ai.google.dev/gemini-api/docs/models?hl=zh-CN>
