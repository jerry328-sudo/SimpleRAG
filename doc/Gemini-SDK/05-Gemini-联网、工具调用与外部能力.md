# Gemini 联网、工具调用与外部能力

## 1. 先把“联网”分成 3 种

很多人说“让模型联网”，实际可能指的是 3 种完全不同的能力：

1. `Google Search grounding`
  - 让 Gemini 自动做 Google 搜索，并把答案建立在实时网页结果上
2. `URL Context`
  - 让 Gemini 读取你显式提供的一组 URL
3. `Function Calling`
  - 让 Gemini 请求你去调用自己的搜索服务、数据库、HTTP API 或任意工具

对 `SimpleRAG` 来说，这 3 种能力的定位应该分清：

- 查公开网页上的实时信息：
  - 优先 `google_search`
- 分析指定网页：
  - 优先 `url_context`
- 查私有系统、内网 API、你自己的检索后端：
  - 用函数调用

## 2. Google Search grounding

### 2.1 它做什么

官方定义很清楚：

- 把 Gemini 连接到实时网页内容
- 回答时能提供来源
- 适合最近新闻、实时信息、需要可验证引用的问答

### 2.2 最小调用

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "谁赢得了 Euro 2024？",
  config: {
    tools: [{ googleSearch: {} }],
  },
});

console.log(response.text);
```

### 2.3 它是如何工作的

官方流程可以概括成：

1. 你的应用发请求，并打开 `google_search`
2. 模型自己判断要不要搜
3. 如果需要，模型会自动生成一个或多个搜索词
4. 模型处理搜索结果并生成回答
5. 返回文本答案 + `groundingMetadata`

也就是说：

- 你不用自己先发搜索请求
- 但你也不能精确控制它会搜几次、搜什么词

## 3. `groundingMetadata` 很关键

启用 Google Search 后，返回结果里最重要的不是只有 `response.text`，还包括：

- `webSearchQueries`
  - 模型实际用了哪些搜索词
- `groundingChunks`
  - 引用到的网页来源
- `groundingSupports`
  - 回答中的哪些文本片段由哪些来源支持

这正好可以用来做“行内引用”或“底部来源卡片”。

### JavaScript：给回答加引用

```ts
function addCitations(response: any) {
  let text = response.text ?? "";
  const supports = response.candidates?.[0]?.groundingMetadata?.groundingSupports ?? [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

  const sorted = [...supports].sort(
    (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0),
  );

  for (const support of sorted) {
    const endIndex = support.segment?.endIndex;
    if (endIndex == null || !support.groundingChunkIndices?.length) continue;

    const links = support.groundingChunkIndices
      .map((i: number) => chunks[i]?.web?.uri)
      .filter(Boolean)
      .map((uri: string, idx: number) => `[${idx + 1}](${uri})`);

    if (!links.length) continue;
    text = text.slice(0, endIndex) + links.join(", ") + text.slice(endIndex);
  }

  return text;
}
```

## 4. Google Search 的计费注意点

官方页面给了一个容易踩坑的点：

- Gemini 3 系列下，按模型实际执行的搜索查询次数计费
- 如果一次回答里模型发了多个查询，就可能记多次
- Gemini 2.5 及更老模型的计费口径又不同

所以：

- “打开搜索工具”不等于“只加一个固定成本”
- 成本会和模型实际搜几次有关

## 5. URL Context

### 5.1 它做什么

URL Context 不是“让模型自己全网搜索”，而是：

- 你把 URL 明确给它
- 模型只读取这些 URL 的内容
- 然后基于这些页面回答

这很适合：

- 指定网页比较
- 指定文档摘要
- 给模型一个你信任的候选网页集合

### 5.2 最小调用

```ts
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents:
    "比较这两个页面里的套餐差异：https://example.com/a 和 https://example.com/b",
  config: {
    tools: [{ urlContext: {} }],
  },
});
```

### 5.3 它的工作方式

官方说明是“两步检索”：

1. 先尝试从内部索引缓存读取
2. 缓存没有时再实时抓取网页

这意味着它兼顾了：

- 速度
- 新鲜度

## 6. URL Context 的限制

官方 URL Context 页面列出了几个关键限制：

- 每次请求最多 20 个 URL
- 单个 URL 可抓取的最大内容大小为 34MB
- URL 必须是公网可访问地址
- 不支持 `localhost`、`127.0.0.1`、私网地址、隧道地址
- 不支持登录后页面、付费墙页面

支持的内容类型包括：

- 文本
- 图片
- PDF

不支持的典型内容包括：

- YouTube 视频
- Google Docs / Sheets
- 音视频文件本身

## 7. Google Search 和 URL Context 可以一起用

官方明确说明：

- 两者可以组合

组合后的语义是：

- 先让模型在公开网页上搜索
- 再对你指定的 URL 做更深的理解

这非常适合“先广搜，再深读”的场景。

## 8. Function Calling

### 8.1 它做什么

Function Calling 的本质不是“模型直接联网”，而是：

- 你告诉模型：我这里有几个函数可用
- 模型决定什么时候调用哪个函数
- 模型给出函数名和参数
- 你自己执行函数
- 再把执行结果回传给模型

官方给出的 3 类典型用途：

- 增强知识
- 扩展能力
- 执行动作

### 8.2 最小函数声明

```ts
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const searchNotes = {
  name: "search_notes",
  description: "Searches the local note index and returns the most relevant results.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "The user's search query.",
      },
      top_k: {
        type: Type.NUMBER,
        description: "How many results to return.",
      },
    },
    required: ["query"],
  },
};

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "帮我找和增量索引相关的笔记。",
  config: {
    tools: [{ functionDeclarations: [searchNotes] }],
  },
});

console.log(response.functionCalls?.[0]);
```

### 8.3 你必须自己执行函数

Gemini 只会返回：

- 要调用哪个函数
- 参数是什么
- 调用 ID 是什么

真正执行是你的责任，不是模型的责任。

## 9. Gemini 3 的函数调用 ID

官方特别提醒：

- Gemini 3 模型的每个函数调用都会带唯一 `id`
- 当你把函数执行结果回传给模型时，应该带回同一个 `id`

对 SDK 用户来说，这部分很多时候会被封装掉。
但如果你手动构造对话历史，或者直接用 REST，就必须自己保持这个映射关系。

## 10. 在 `SimpleRAG` 里，Function Calling 可以怎么用

### 方案 A：模型调用本地搜索函数

让模型调用：

- `search_notes`
- `get_note_by_path`
- `get_asset_mentions`

适合：

- Agent 化问答
- 让模型按需补查本地索引

### 方案 B：模型调用外部联网函数

让模型调用：

- `web_search`
- `fetch_url`
- `get_weather`

适合：

- Google Search 不够时，接你自己的搜索后端
- 企业内网检索
- 私有 API

## 11. 这 3 种联网方式如何选

### 11.1 要回答实时公开信息

优先：

- `google_search`

原因：

- 接入最简单
- 自动带网页来源

### 11.2 用户已经给了明确 URL

优先：

- `url_context`

原因：

- 你不需要先搜索
- 结果更可控

### 11.3 要查你自己的系统

优先：

- `function calling`

原因：

- Google Search 和 URL Context 都解决不了私有系统调用问题

## 12. 一个重要的工程现实

官方不同页面对“URL Context 能否与函数调用组合”有过不完全一致的表述。

因此对本项目的建议是：

- 如果你要依赖“内置工具 + 自定义函数”组合能力上线
- 必须在真正实现前再核对一次官方最新的 tool combinations 页面和 release notes

不要只凭一页文档里的单条描述就把架构锁死。

## 13. 对 `SimpleRAG` 的实际建议

第一阶段建议把 Gemini 的联网能力拆成 3 个独立开关：

- `Enable Google Search grounding`
- `Enable URL Context`
- `Enable function calling`

不要做成一个模糊的“Allow internet access”。

原因：

- 成本不同
- 数据边界不同
- 风险不同
- UI 告知义务也不同

## 14. 官方来源

- Google Search grounding：<https://ai.google.dev/gemini-api/docs/google-search>
- URL Context：<https://ai.google.dev/gemini-api/docs/url-context>
- Function Calling：<https://ai.google.dev/gemini-api/docs/function-calling>
- Tools 总览：<https://ai.google.dev/gemini-api/docs/tools>
