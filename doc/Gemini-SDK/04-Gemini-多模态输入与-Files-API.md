# Gemini 多模态输入与 Files API

## 1. 为什么这篇很重要

`SimpleRAG` 后续如果要支持：

- 图片理解
- 图片 embedding
- PDF 输入
- 音频 / 视频输入

就一定会涉及两个核心问题：

1. 多模态数据怎么放进 `contents`
2. 文件是直接内嵌，还是先上传再引用

## 2. 多模态输入的基本结构

Gemini 的多模态输入本质上还是 `contents.parts`，只不过 `part` 不再只有 `text`，还可以是：

- `inlineData`
- `fileData`
- SDK 封装后的上传文件对象

### JavaScript：文本 + 图片

```ts
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    {
      inlineData: {
        mimeType: "image/png",
        data: imageBase64,
      },
    },
    {
      text: "请解释这张图和检索流程的关系。",
    },
  ],
});
```

## 3. 什么时候用 `inlineData`

适合：

- 小文件
- 一次性请求
- 本地快速实验
- 不想先走文件上传流程

官方图片理解页明确提到：

- 内嵌图片数据时，请求总大小限制为 20MB
- 如果请求更大，或文件会重复使用，应优先改用 Files API

## 4. 什么时候用 Files API

官方 Files API 文档给出的建议非常明确：

- 当总请求大小超过 100MB 时，应使用 Files API
- PDF 的上限是 50MB
- 对于要重复使用的图片、音频、视频、PDF，也应该优先用 Files API

也就是说：

- 小图、一次性调试：
  - `inlineData`
- 大文件、重复使用、多轮引用：
  - `files.upload`

## 5. 图片输入

### 5.1 小图直接内嵌

```ts
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const base64Image = fs.readFileSync("sample.jpg", { encoding: "base64" });

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Image,
      },
    },
    {
      text: "给这张图写一个摘要。",
    },
  ],
});
```

### 5.2 上传后再引用

```ts
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const uploaded = await ai.files.upload({
  file: "sample.jpg",
  config: { mimeType: "image/jpeg" },
});

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: createUserContent([
    createPartFromUri(uploaded.uri, uploaded.mimeType),
    "给这张图写一个摘要。",
  ]),
});
```

## 6. 多张图片

Gemini 支持在一个请求中放多张图片。

适合：

- 图像对比
- 图像差异分析
- 从多个截图中归纳共同问题

```ts
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    {
      inlineData: { mimeType: "image/png", data: image1Base64 },
    },
    {
      inlineData: { mimeType: "image/png", data: image2Base64 },
    },
    {
      text: "比较这两张图片的差异。",
    },
  ],
});
```

## 7. 支持的图片格式

官方图片理解页列出的图片 MIME 类型包括：

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/heic`
- `image/heif`

但要注意：

- LLM 图片理解支持的格式
- Embedding 2 文档里列出的图片格式

不一定完全一致。对本项目第一版，建议只支持：

- PNG
- JPEG

原因：

- 最稳
- 跨文档交集最明确
- 也符合我们当前项目边界

## 8. PDF、音频、视频

Gemini 官方文档表明，Files API 不只支持图片，还支持：

- 音频
- 视频
- 文档

对于 `SimpleRAG` 来说，当前最现实的用法是：

- 聊天时偶尔拿 PDF 做分析
- embedding 第一版仍然不要直接扩到 PDF / 视频

因为项目边界文档已经明确：

- 当前检索主对象仍然是 Markdown 和被 Markdown 引用的图片

## 9. Files API 的核心操作

### 9.1 上传

```ts
const uploaded = await ai.files.upload({
  file: "sample.mp3",
  config: { mimeType: "audio/mpeg" },
});
```

### 9.2 获取元数据

```ts
const fileInfo = await ai.files.get({
  name: uploaded.name,
});
```

### 9.3 列表

```ts
const listResponse = await ai.files.list({ config: { pageSize: 10 } });

for await (const file of listResponse) {
  console.log(file.name);
}
```

### 9.4 删除

```ts
await ai.files.delete({
  name: uploaded.name,
});
```

## 10. Files API 的生命周期和限制

官方文档列出的关键点：

- 每个项目最多可存 20GB 文件
- 单文件最大 2GB
- 文件保留 48 小时
- 48 小时内可查询元数据
- 不能把上传的文件再下载回来

这意味着：

- Files API 不是长期对象存储
- 它更像“给模型临时引用的大文件缓存”

对 `SimpleRAG` 的结论：

- 不能把它当项目数据库
- 也不应把它当永久资产仓库

## 11. 多模态提示的最佳实践

官方 Files API / 图片理解文档给出的建议可以直接转成实现规则：

### 11.1 指令要具体

坏提示：

```text
描述这张图
```

更好的提示：

```text
提取图片中的标题、关键字段，并用 JSON 返回。
```

### 11.2 单图时可把图片放在文字前面

官方明确提到：

- 对单图提示，图片放在文本前面有时效果更好

### 11.3 需要排查时，先让模型描述图像

如果你怀疑模型没有正确看到图片内容，可以先问：

```text
先描述你在图片中看到了什么，再回答问题。
```

### 11.4 结果太发散时，不要盲目把温度调得很低

官方 Files 指南提到：

- Gemini 3 系列通常建议保持默认温度

## 12. 在 `SimpleRAG` 里的直接应用

### 图片聊天

- 输入：
  - 图片 + 文本问题
- API：
  - `generateContent`

### 图片 embedding

- 输入：
  - 图片二进制或上传文件
- API：
  - `embedContent`

### 大图片 / PDF 重复使用

- 输入：
  - 先 `files.upload`
- 后续：
  - 多次 `generateContent` / `embedContent` 时复用 URI

## 13. 当前项目建议

第一阶段只建议真正落地这两条：

1. 聊天接口支持图片输入
2. embedding 接口支持图片输入

暂时不建议立即把：

- PDF 全量索引
- 音频索引
- 视频索引

一起拉进主流程。

## 14. 官方来源

- 图片理解：<https://ai.google.dev/gemini-api/docs/image-understanding?hl=zh-cn>
- Files API：<https://ai.google.dev/gemini-api/docs/files>
- Embeddings：<https://ai.google.dev/gemini-api/docs/embeddings?hl=zh-CN>
