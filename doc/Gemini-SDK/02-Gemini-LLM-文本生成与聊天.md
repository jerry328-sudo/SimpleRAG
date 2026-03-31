# Gemini LLM：文本生成与聊天

## 1. 这一层在项目里负责什么

在 `SimpleRAG` 里，LLM 主要负责 3 件事：

1. 对检索结果做最终回答
2. 根据上下文做总结、压缩、证据筛选
3. 在多模态模式下理解图片等非文本输入

Gemini 里对应的主入口基本都是：

```ts
ai.models.generateContent(...)
```

如果要流式输出，则是：

```ts
ai.models.generateContentStream(...)
```

## 2. 单轮文本生成

最常见的单轮请求：

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "请用 3 句话解释 RAG 的工作流程。",
});

console.log(response.text);
```

这类调用适合：

- 总结
- 提取
- 改写
- 基于现有上下文回答

## 3. 系统提示

Gemini 官方推荐通过 `config.systemInstruction` 来控制模型行为。

### JavaScript

```ts
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "根据给定笔记回答问题。",
  config: {
    systemInstruction:
      "你是一个只允许基于检索证据回答的问题助手。证据不足时必须明确说明。",
  },
});
```

### REST 结构

```json
{
  "system_instruction": {
    "parts": [
      {
        "text": "你是一个只允许基于检索证据回答的问题助手。"
      }
    ]
  },
  "contents": [
    {
      "parts": [
        { "text": "根据给定笔记回答问题。" }
      ]
    }
  ]
}
```

这对 `SimpleRAG` 很重要，因为我们的聊天模式本来就要求：

- 必须基于检索结果回答
- 必须保留引用
- 证据不足时不能乱猜

## 4. 生成配置

官方文本生成页里明确展示了这些配置项：

- `systemInstruction`
- `temperature`
- `stopSequences`
- `thinkingConfig`

### 4.1 温度

```ts
config: {
  temperature: 0.2,
}
```

适合：

- 提高稳定性
- 做提取、分类、回答式任务

注意：

- Files API 指南里提到，Gemini 3 系列在很多复杂任务上建议保持默认温度；把温度改得过低可能带来异常行为。
- 所以不要机械地把所有任务都设成 `0`。

### 4.2 停止序列

```ts
config: {
  stopSequences: ["\n## Sources"],
}
```

适合：

- 控制生成在某个标记前停止
- 避免模型继续往下扩写不需要的段落

### 4.3 Thinking 配置

官方文本生成页展示了 `thinkingConfig` / `thinkingLevel` 的配置方式。

```ts
config: {
  thinkingConfig: {
    thinkingLevel: "low",
  },
}
```

这类能力更适合：

- 推理任务
- 复杂规划
- 需要更强分析深度的回答

如果在本项目里使用，建议只给聊天总结或复杂问答启用，不要对所有轻量请求默认打开。

## 5. 流式输出

如果你不想等完整回答生成完再显示，可以用流式输出。

### JavaScript

```ts
const stream = await ai.models.generateContentStream({
  model: "gemini-2.5-flash",
  contents: "分步骤解释向量召回和 rerank 的区别。",
});

for await (const chunk of stream) {
  console.log(chunk.text ?? "");
}
```

### REST

Gemini 提供 `streamGenerateContent?alt=sse` 形式的 SSE 流。

这对本项目的意义：

- 侧边栏聊天可以做流式回答
- 用户感知速度会明显更好

## 6. 聊天：两种做法

### 6.1 手动维护历史

直接自己传 `contents` 数组：

```ts
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    {
      role: "user",
      parts: [{ text: "我有 2 只狗。" }],
    },
    {
      role: "model",
      parts: [{ text: "知道了。" }],
    },
    {
      role: "user",
      parts: [{ text: "那我家里一共有几只爪子？" }],
    },
  ],
});
```

优点：

- 历史完全可控
- 更适合和项目内部的“证据包”拼接

### 6.2 使用 SDK 的 chat 对象

官方也提供 chat API：

```ts
const chat = ai.chats.create({
  model: "gemini-2.5-flash",
});

const reply1 = await chat.sendMessage({
  message: "我有 2 只狗。",
});

const reply2 = await chat.sendMessage({
  message: "那我家里有几只爪子？",
});
```

对 `SimpleRAG` 的建议：

- 仍然优先手动维护历史

原因：

- 我们要严格控制上下文来源
- 我们要在历史里插入检索证据、引用和图片
- 我们要决定哪些内容进上下文，哪些不进

补充：

- 官方文本生成页明确说明，SDK 的 chat 只是对多轮历史做了一层封装
- 它底层仍然使用 `generateContent`
- 每一轮跟进请求都会把完整对话历史再次发送给模型

所以它不是“服务端帮你保存状态”，而只是一个更方便的本地封装。

## 7. 结构化输出

如果你想要模型输出稳定 JSON，而不是自然语言，可以用结构化输出。

核心配置：

- `responseMimeType: "application/json"`
- `responseJsonSchema: ...`

### JavaScript

```ts
const schema = {
  type: "object",
  properties: {
    answer: { type: "string", description: "最终回答" },
    confidence: { type: "number", description: "0 到 1 的置信度" },
    citations: {
      type: "array",
      items: { type: "string" },
      description: "引用来源 ID 列表",
    },
  },
  required: ["answer", "confidence", "citations"],
};

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "请基于上下文回答，并输出 JSON。",
  config: {
    responseMimeType: "application/json",
    responseJsonSchema: schema,
  },
});

const result = JSON.parse(response.text);
```

适合本项目的场景：

- AI evidence selection
- 结构化提取引用
- 输出固定格式的回答对象

## 8. 结构化输出和函数调用的区别

这个边界一定要分清：

- 结构化输出
  - 用于“让模型把最终答案按固定格式输出”
- 函数调用
  - 用于“让模型请求你去执行一个动作，然后把结果再喂回模型”

对 `SimpleRAG` 来说：

- 如果只是要让模型输出 `{ answer, citations }`
  - 用结构化输出
- 如果要让模型主动调用搜索工具、数据库、网页抓取器
  - 用函数调用

## 9. 多模态输入也可以走 `generateContent`

Gemini 的文本生成接口本身就支持多模态输入。

例如：

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
      text: "描述这张图片，并说明它和笔记主题有什么关系。",
    },
  ],
});
```

也就是说：

- 文本生成能力本身可以看图片
- 多模态不是另一个独立接口，而是 `contents.parts` 的不同类型

更详细的图片、文件、PDF 输入方式请看：

- [[04-Gemini-多模态输入与-Files-API]]

## 10. 响应里要关注什么

在本项目里，最常关注的是：

- `response.text`
  - 最终文本
- `response.candidates`
  - 更底层的候选输出
- `usageMetadata`
  - token 使用情况
- `groundingMetadata`
  - 如果启用了 Google Search grounding，需要用它做来源展示
- `functionCalls`
  - 如果启用了函数调用，需要检查模型是否请求调用外部函数

## 11. 在 `SimpleRAG` 里的推荐落点

### 聊天回答

- API：
  - `generateContent` 或 `generateContentStream`
- 输入：
  - 系统提示 + 用户问题 + 文档证据包 + 可选图片证据

### 证据筛选

- API：
  - `generateContent`
- 输出：
  - 建议用结构化输出，返回保留了哪些证据、为什么保留

### 引用生成

- 如果用 Google Search grounding
  - 读取 `groundingMetadata`
- 如果是本地 RAG
  - 引用依然要由我们自己的 chunk / note / asset 元数据决定

## 12. 不建议的做法

- 不要把 SDK chat 状态完全交给外部对象管理，然后让插件失去上下文可见性
- 不要把所有多轮历史无限追加
- 不要把“本地笔记引用”错误地交给 Google Search 的 citation 机制
- 不要把结构化输出和函数调用混为一谈

## 13. 进一步阅读

- Embedding：
  - [[03-Gemini-Embedding-模型调用]]
- 多模态输入：
  - [[04-Gemini-多模态输入与-Files-API]]
- 联网和工具：
  - [[05-Gemini-联网、工具调用与外部能力]]

## 14. 官方来源

- 文本生成：<https://ai.google.dev/gemini-api/docs/text-generation>
- 结构化输出：<https://ai.google.dev/gemini-api/docs/structured-output?hl=zh-CN>
- 图片理解：<https://ai.google.dev/gemini-api/docs/image-understanding?hl=zh-cn>
- Token 计数：<https://ai.google.dev/gemini-api/docs/tokens>
