# SimpleRAG RAG 详细设计与实施计划

## 1. 文档目的

本文档用于固定 `SimpleRAG` 插件的第一版产品边界、技术架构、数据模型、运行时文件布局、核心流程和实施顺序，作为后续实现的主参考文档。

本文档覆盖：

- 插件目标与非目标
- 索引与检索架构
- 多 provider API 模块化设计
- 文本与图片索引规则
- 搜索与聊天交互设计
- 本地数据库与配置文件存放位置
- 实施阶段拆分建议

本文档不覆盖：

- 具体代码实现
- 具体第三方 API 厂商绑定
- 最终 UI 视觉细节

---

## 2. 产品目标

`SimpleRAG` 是一个 Obsidian 社区插件，目标是在当前 vault 内构建本地索引，并通过远端模型 API 提供以下能力：

1. 对 Markdown 笔记内容进行分块、向量化和本地索引。
2. 可选地对被 Markdown 笔记引用的图片进行多模态向量化和本地索引。
3. 提供常驻侧边栏搜索面板，支持直接查看检索结果。
4. 提供基于检索结果的 AI 问答模式，并带可追溯引用。

---

## 3. 第一版范围

### 3.1 In Scope

- 只索引 `.md` 文件。
- `pdf`、`docx`、`canvas` 等非 Markdown 文件跳过。
- 文本按“标题层级 + 段落块”切分。
- 代码块不参与 embedding。
- 图片仅在满足以下条件时才参与索引：
  - 用户开启图片 embedding；
  - 当前 embedding 模型为多模态模型；
  - 图片被至少一篇 Markdown 笔记引用。
- 向量计算、rerank、chat 全部通过远端 API 完成。
- 本地使用 SQLite 持久化索引和元数据。
- 只保存 vault 相对路径，不保存绝对路径。
- 提供手动扫描、手动更新索引、手动全量重建索引。
- 常驻侧边栏搜索面板。
- 搜索结果后的 AI 筛选与聊天。

### 3.2 Out of Scope

- 自动实时重建索引。
- 非 Markdown 文档的文本抽取。
- OCR。
- 代码检索专项优化。
- 图片编辑、标注、生成。
- 跨 vault 索引。
- 云端存储向量数据库。

---

## 4. 总体架构

插件分为五条主链路：

1. `Vault scanning`
   - 启动时轻量扫描。
   - 运行中监听 vault 文件事件。
   - 维护 dirty 状态。

2. `Indexing`
   - 读取 dirty 文件。
   - 文本切块 / 图片引用提取。
   - 调用 embedding API。
   - 写入本地数据库。

3. `Retrieval`
   - 查询 embedding。
   - 向量召回 top K。
   - 可选 rerank。
   - 返回展示结果。

4. `Chat`
   - 基于当前搜索结果构造文档级上下文。
   - 可选 AI 证据筛选。
   - 调用 chat API 输出回答。

5. `Persistence`
   - 使用 Obsidian 插件私有目录保存设置、数据库和缓存。

---

## 5. 关键设计决策

### 5.1 索引模式

插件支持两种索引模式：

- `text-only`
  - 仅索引 Markdown 文本块。
  - 使用文本 embedding 模型。

- `multimodal`
  - 索引 Markdown 文本块和被引用图片。
  - 使用多模态 embedding 模型。

规则：

- 图片 embedding 开关关闭时，必须使用 `text-only` 模式。
- 图片 embedding 开关开启时，必须使用 `multimodal` 模式。
- `text-only <-> multimodal` 切换后，现有索引直接视为失效，必须全量重建。
- 变更 embedding provider 或 embedding model 后，也必须全量重建。
- 变更 rerank provider/model 或 chat provider/model 不要求重建索引。

### 5.2 路径规范

所有运行时索引记录中的文件标识必须使用 vault 相对路径，统一规则如下：

- 以 vault 根目录为基准。
- 使用 `/` 作为分隔符。
- 不保存绝对路径。
- 不保存操作系统盘符。
- 例如：
  - `Projects/RAG/design.md`
  - `Assets/diagram/search-flow.png`

### 5.3 Provider 模块化

必须将模型能力与业务逻辑解耦，不允许在搜索、索引或聊天逻辑中写死某一家 API。

至少抽象四类 provider：

- `EmbeddingProvider`
- `RerankProvider`
- `ChatProvider`
- `ProviderRegistry`

每个 provider 必须显式声明能力，而不是只暴露一个请求函数。

---

## 6. 建议的源码模块划分

第一版建议将 `src/` 重构为如下结构：

```text
src/
  main.ts
  settings/
    index.ts
    types.ts
    tab.ts
  runtime/
    paths.ts
    state.ts
  providers/
    registry.ts
    types.ts
    embedding/
      index.ts
    rerank/
      index.ts
    chat/
      index.ts
  storage/
    db.ts
    schema.ts
    repository/
      files.ts
      chunks.ts
      assets.ts
      embeddings.ts
      mentions.ts
  indexing/
    scanner.ts
    change-detector.ts
    index-manager.ts
    note-indexer.ts
    asset-indexer.ts
    chunking/
      markdown-parser.ts
      text-chunker.ts
    links/
      image-reference-resolver.ts
  search/
    query-service.ts
    vector-search.ts
    rerank-service.ts
    result-assembler.ts
  chat/
    context-builder.ts
    evidence-selector.ts
    conversation-service.ts
  ui/
    views/
      search-view.ts
    components/
      search-box.ts
      result-list.ts
      chat-panel.ts
      status-panel.ts
    models/
      view-model.ts
  types/
    domain.ts
```

原则：

- `main.ts` 只负责插件生命周期、注册命令、注册视图。
- `settings` 只负责设置定义和 UI。
- `providers` 只负责外部 API 抽象。
- `indexing/search/chat/storage/ui` 各自单一职责。

---

## 7. 运行时文件布局

### 7.1 总原则

运行时数据必须放在 Obsidian 插件私有目录中，不应写入用户普通笔记目录，也不应散落到仓库源码目录。

第一版推荐的运行时目录：

```text
.obsidian/plugins/<plugin-id>/
  manifest.json
  main.js
  styles.css
  data.json
  storage/
    rag-index.sqlite
  cache/
    query/
```

说明：

- `manifest.json` / `main.js` / `styles.css`
  - 插件发布产物。
- `data.json`
  - 小体积配置文件。
  - 通过 `loadData()` / `saveData()` 管理。
- `storage/rag-index.sqlite`
  - 本地数据库。
  - 存放文件元数据、chunk、图片引用关系、embedding 和索引状态。
- `cache/query/`
  - 可选运行时缓存目录。
  - 只放临时或可再生内容。
  - 第一版如果用不到，可先不创建。

### 7.2 配置文件放哪里

配置优先放在：

- `.obsidian/plugins/<plugin-id>/data.json`

这里适合保存：

- provider 选择
- model 名称
- base URL
- token
- 是否启用图片 embedding
- 是否启用 AI chat
- 检索和聊天的轻量设置

不建议把配置塞进 SQLite，原因：

- Obsidian 已经为插件提供 `loadData()` / `saveData()`。
- 小型配置天然更适合 JSON。
- 便于重置插件设置。

### 7.3 数据库文件放哪里

数据库文件固定放在：

- `.obsidian/plugins/<plugin-id>/storage/rag-index.sqlite`

原因：

- 与发布产物分离，避免插件根目录堆满运行时文件。
- 便于后续增加更多存储文件。
- 便于用户清理或排查问题。

### 7.4 路径处理要求

代码中不要直接拼接平台路径字符串。应统一通过运行时路径工具计算：

- 插件根目录
- `data.json` 路径
- `storage/` 路径
- `cache/` 路径

---

## 8. 设置页信息架构

### 8.1 默认暴露分组

默认设置页只展示三个分组，保证简洁：

#### Group A: Providers

- `Embedding provider`
- `Embedding model`
- `Base URL`
- `API token`

#### Group B: Features

- `Enable image embedding`
- `Enable AI chat`

#### Group C: Index status

展示字段：

- 当前索引模式：`Text-only` / `Multimodal`
- 上次扫描时间
- 上次索引更新时间
- 已索引笔记数
- 已索引 chunk 数
- 已索引图片数
- dirty 文件数

操作按钮：

- `Scan changes`
- `Update index`
- `Rebuild full index`

### 8.2 Advanced 分组

Advanced 默认折叠，内部继续分组：

#### Retrieval

- `Enable rerank`
- `Rerank provider`
- `Rerank model`
- `Recall pool size`
- `Results per query`
- `Default result tab`

#### Chat

- `Chat provider`
- `Chat model`
- `Short note threshold`
- `Max notes in chat context`
- `Long note context window`
- `Enable AI evidence selection`

#### Network

- `Rerank base URL`
- `Rerank token`
- `Chat base URL`
- `Chat token`
- `Timeout`
- `Retry count`
- `Max concurrent requests`

#### Debug & maintenance

- `Show similarity scores`
- `Enable debug logs`
- `Clear local index`

### 8.3 重建提示规则

以下设置改动后必须展示 “需要重建索引”：

- embedding provider
- embedding model
- image embedding 开关

以下设置改动后不要求重建：

- rerank provider/model
- chat provider/model
- base URL / token
- 检索或聊天阈值

---

## 9. Provider 抽象设计

### 9.1 EmbeddingProvider

职责：

- 文本 embedding
- 多模态文本 embedding
- 图片 embedding
- 返回维度信息
- 暴露模型能力

建议能力描述字段：

- `providerId`
- `modelId`
- `supportsText`
- `supportsImage`
- `supportsCrossModal`
- `dimension`
- `maxInputTokens`

### 9.2 RerankProvider

职责：

- 对召回候选进行排序

建议能力描述字段：

- `supportsTextRerank`
- `supportsCrossModalRerank`
- `maxDocumentsPerRequest`

### 9.3 ChatProvider

职责：

- 基于上下文回答
- 输出带引用的回答

建议能力描述字段：

- `supportsStreaming`
- `supportsSystemPrompt`
- `supportsVisionInput`
- `maxContextTokens`

### 9.4 ProviderRegistry

职责：

- 注册 provider 实现
- 暴露可选 provider/model 列表
- 根据设置创建运行时客户端
- 校验配置合法性

---

## 10. 支持的文件类型与处理规则

### 10.1 Markdown

- 参与扫描
- 参与文本索引
- 参与图片引用解析

### 10.2 图片

第一版仅在以下条件同时满足时参与索引：

- 图片 embedding 已开启
- 当前为多模态模式
- 图片被至少一篇 Markdown 笔记引用

支持的图片格式可先限制为常见类型：

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.gif`
- `.svg` 是否支持可单独评估，第一版建议先跳过

### 10.3 非 Markdown 文件

默认跳过，包括但不限于：

- `.pdf`
- `.docx`
- `.pptx`
- `.canvas`

---

## 11. 变更跟踪与扫描设计

### 11.1 为什么不用 Git

第一版不依赖 Git 跟踪变更，原因：

- 不是所有 vault 都使用 Git。
- Git 不适合表达未提交的实时内容状态。
- Git 不适合插件运行时的细粒度索引失效判断。

### 11.2 变更来源

变更信息来自两部分：

1. `Vault events`
   - `create`
   - `modify`
   - `rename`
   - `delete`

2. `Manual scan`
   - 启动时做一次轻量扫描
   - 用户手动点击 `Scan changes` 时执行

### 11.3 轻量扫描策略

扫描阶段只读取轻量元数据，不读全文，不做 embedding。

每个候选文件采集：

- `relative_path`
- `file_kind`
- `mtime`
- `size`

扫描结果与本地数据库快照比对，识别：

- 新增
- 修改
- 删除
- 重命名

### 11.4 性能原则

- 扫描阶段不做全文 hash。
- 扫描阶段不读正文。
- 扫描阶段不调用任何远端模型 API。
- 扫描只用于维护 dirty 集合和按钮状态。

---

## 12. 本地数据库设计

### 12.1 选型

第一版使用本地 SQLite。

原因：

- 结构化关系数据强。
- 需要管理文件、chunk、图片、引用关系和 embedding。
- 单文件数据库便于调试与维护。
- 比纯 JSON 或多文件方案更适合复杂状态管理。

### 12.2 核心表

#### `schema_meta`

用于保存数据库级元信息。

建议字段：

- `key TEXT PRIMARY KEY`
- `value TEXT NOT NULL`

建议键值：

- `schema_version`
- `index_mode`
- `embedding_provider`
- `embedding_model`
- `embedding_dimension`
- `last_scan_at`
- `last_index_at`

#### `files`

记录所有进入扫描体系的文件。

建议字段：

- `path TEXT PRIMARY KEY`
- `kind TEXT NOT NULL`
  - `note`
  - `asset`
- `ext TEXT NOT NULL`
- `mtime_ms INTEGER NOT NULL`
- `size_bytes INTEGER NOT NULL`
- `content_hash TEXT`
- `status TEXT NOT NULL`
  - `indexed`
  - `dirty`
  - `deleted`
  - `skipped`
  - `error`
- `indexed_at_ms INTEGER`
- `last_seen_scan_ms INTEGER`
- `last_error TEXT`

#### `note_chunks`

记录文本块。

建议字段：

- `chunk_id TEXT PRIMARY KEY`
- `note_path TEXT NOT NULL`
- `chunk_index INTEGER NOT NULL`
- `heading_path_json TEXT NOT NULL`
- `heading_path_text TEXT NOT NULL`
- `text TEXT NOT NULL`
- `text_for_embedding TEXT NOT NULL`
- `char_start INTEGER`
- `char_end INTEGER`
- `token_estimate INTEGER`

唯一约束：

- `(note_path, chunk_index)`

#### `assets`

记录图片资源。

建议字段：

- `asset_path TEXT PRIMARY KEY`
- `mime_type TEXT`
- `reference_count INTEGER NOT NULL DEFAULT 0`
- `indexed_at_ms INTEGER`

#### `asset_mentions`

记录图片被哪些笔记引用。

建议字段：

- `mention_id TEXT PRIMARY KEY`
- `asset_path TEXT NOT NULL`
- `note_path TEXT NOT NULL`
- `mention_index INTEGER NOT NULL`
- `heading_path_json TEXT NOT NULL`
- `heading_path_text TEXT NOT NULL`
- `raw_target TEXT NOT NULL`
- `link_kind TEXT NOT NULL`
  - `wikilink`
  - `markdown-image`
- `surrounding_text TEXT`
- `near_chunk_id TEXT`

唯一约束：

- `(asset_path, note_path, mention_index)`

#### `embeddings`

统一保存文本和图片向量。

建议字段：

- `owner_id TEXT NOT NULL`
- `owner_type TEXT NOT NULL`
  - `note_chunk`
  - `asset`
- `provider_id TEXT NOT NULL`
- `model_id TEXT NOT NULL`
- `modality TEXT NOT NULL`
  - `text`
  - `image`
  - `multimodal`
- `dimension INTEGER NOT NULL`
- `vector_blob BLOB NOT NULL`
- `created_at_ms INTEGER NOT NULL`

主键建议：

- `(owner_id, owner_type, provider_id, model_id)`

---

## 13. 文本切块规则

### 13.1 总体策略

切块采用“标题层级 + 段落块”。

目标：

- 保留笔记结构语义。
- 避免固定字数切块导致语义断裂。
- 让搜索结果更容易映射回用户实际笔记结构。

### 13.2 处理规则

- YAML frontmatter 不参与 embedding。
- 标题路径作为 chunk 上下文的一部分。
- 空段落跳过。
- 超短段落合并到相邻段落。
- 超长段落允许二次切分。
- 代码块跳过。
- callout、引用块默认按普通文本处理。
- 列表项可按连续文本块处理。

### 13.3 `text_for_embedding`

实际送入 embedding API 的文本不应只是正文，而应包含标题路径上下文。

建议格式：

```text
Path: Projects/RAG/design.md
Heading: Search / Chat / Context Builder
Content:
这里是当前 chunk 的正文内容...
```

目的：

- 提高同义短句在不同章节中的区分度。
- 提高命中结果可解释性。

---

## 14. 图片引用解析规则

### 14.1 索引对象

第一版不索引 vault 中的全部图片，只索引“被 Markdown 笔记引用的图片”。

### 14.2 支持的引用形式

优先支持：

- Obsidian wikilink 图片嵌入：
  - `![[image.png]]`
  - `![[folder/image.png|300]]`
- Markdown 图片：
  - `![alt](path/to/image.png)`

### 14.3 解析结果

对每个图片引用，需要落地两类信息：

1. 资源级信息
   - 图片真实 vault 相对路径

2. 引用级信息
   - 哪篇笔记引用了它
   - 位于哪个标题路径下
   - 其周围上下文文本

### 14.4 图片索引生命周期

- 若图片第一次被某篇笔记引用，则进入索引候选。
- 若图片被多篇笔记引用，则仅保存一条 asset 记录，但保存多条 mention 记录。
- 若图片不再被任何 Markdown 引用，则应在下次索引更新中：
  - 删除其 mention 记录
  - 删除 asset 记录
  - 删除对应 embedding

---

## 15. 索引更新流程

### 15.1 日常流程

1. 启动时扫描
2. 将变化文件标记为 dirty
3. 用户点击 `Update index`
4. 仅处理 dirty 文件
5. 完成后清除 dirty 状态

### 15.2 Markdown 更新流程

对于变更的 Markdown 文件：

1. 读取全文
2. 重新切 chunk
3. 提取图片引用
4. 删除旧 chunk 及旧 chunk embedding
5. 写入新 chunk
6. 生成新 chunk embedding
7. 更新该笔记涉及到的图片引用关系

### 15.3 图片处理流程

对于需要索引的图片：

1. 只在多模态模式下处理
2. 若图片仍被引用且 embedding 不存在或失效，则生成图片 embedding
3. 若图片已失去所有引用，则删除图片相关记录

### 15.4 全量重建流程

`Rebuild full index` 的语义必须是：

1. 清空本地数据库中的索引内容
2. 重新扫描所有受支持文件
3. 重建文本和图片索引

注意：

- 全量重建是强操作，UI 需要二次确认。
- 适用于 embedding 模型变更、索引模式切换或数据库损坏恢复。

---

## 16. 搜索设计

### 16.1 搜索入口

第一版使用常驻侧边栏搜索面板，不以命令面板弹窗作为主入口。

### 16.2 查询类型

支持两类查询：

- 文本查询
- 图片查询

图片查询仅在多模态模式下可用。

### 16.3 检索阶段

第一版采用两阶段检索：

1. 向量召回
   - 生成 query embedding
   - 召回 top K 候选

2. rerank 排序
   - 将候选送入 rerank API
   - 生成最终排序

当 rerank 关闭时，直接按向量相似度排序。

### 16.4 结果视图

结果区采用：

- `All`
- `Notes`
- `Images`

默认视图为：

- `All`

`All` 中按最终分数排序，但每个结果必须显式标记类型。

### 16.5 文本结果展示字段

- 类型标签：`Note`
- 笔记相对路径
- 标题路径
- 命中摘要
- 分数或相关度标签
- 操作：
  - 打开笔记
  - 定位到原文
  - 加入聊天上下文

### 16.6 图片结果展示字段

- 类型标签：`Image`
- 缩略图
- 图片相对路径
- 被哪些笔记引用
- 若可定位，则显示引用所在标题路径
- 操作：
  - 打开图片
  - 打开引用笔记
  - 加入聊天上下文

---

## 17. 聊天设计

### 17.1 设计目标

聊天不是全局自由对话，而是“基于当前搜索结果继续追问”的证据型问答。

### 17.2 聊天输入来源

聊天模式只能使用当前搜索结果派生出的上下文，不应在第一版直接使用整个 vault 作为无限上下文。

### 17.3 上下文构造策略

搜索阶段以 chunk 为单位召回，聊天阶段按 note 聚合。

构造 `document packet` 的规则：

- 对命中的笔记按 rerank 分数聚合。
- 若笔记估算 token 数 `< 10K`，则整篇笔记作为上下文。
- 若笔记估算 token 数 `>= 10K`，则只取命中 chunk 的扩展窗口。
- 扩展窗口默认以命中 chunk 为中心，前后各取 `2-3` 个 chunk。
- 优先限制在同一标题章节内。
- 同一笔记存在多个命中点时，可合并多个窗口。

### 17.4 AI 证据筛选

可选增加一个 `AI evidence selection` 阶段：

1. 向量召回
2. rerank
3. LLM 在候选证据中做去重、筛选和压缩
4. 将压缩后的文档 packet 交给 chat model

此功能默认建议放在 Advanced 中。

### 17.5 聊天输出与引用

聊天回答采用：

- 正文内行内编号引用，例如 `[1]`
- 底部 `Sources` 区域展示证据卡片

每条引用卡片应包含：

- 类型：`Note` / `Image`
- 路径
- 标题路径
- 摘要
- 操作：
  - 打开
  - 定位到原文

规则：

- 聊天上下文可以是扩展后的 document packet
- 但引用必须回指到原始证据单元
  - 文本：chunk 或其所在标题位置
  - 图片：asset + mention

---

## 18. 侧边栏 UI 设计

### 18.1 顶部状态区

展示：

- 当前索引模式
- 索引是否最新
- dirty 文件数
- 是否需要重建

按钮：

- `Scan changes`
- `Update index`
- `Rebuild full index`

### 18.2 搜索输入区

- 文本输入框
- 搜索按钮
- 多模态模式下提供图片查询入口

搜索应为“提交后执行”，不做输入即搜。

### 18.3 结果区

- 结果标签：`All | Notes | Images`
- 列表项支持点击、展开、加入聊天上下文

### 18.4 聊天区

- 在当前查询结果基础上继续提问
- 支持引用卡片点击跳转

---

## 19. 失败模式与错误处理

### 19.1 配置错误

典型情况：

- 未配置 token
- base URL 非法
- 图片 embedding 开启但模型不支持图片

处理原则：

- 设置页直接给出错误提示
- 不允许开始相关任务

### 19.2 索引失败

典型情况：

- 某篇笔记解析异常
- embedding API 单次请求失败
- 数据库写入失败

处理原则：

- 单文件失败不应阻塞整个批次
- 将失败记录写入 `files.last_error`
- UI 显示失败文件数

### 19.3 检索失败

典型情况：

- query embedding 失败
- rerank 超时
- chat API 失败

处理原则：

- embedding 失败则搜索失败并提示
- rerank 失败可降级为向量分数排序
- chat 失败不影响搜索结果本身

---

## 20. 性能与资源约束

### 20.1 启动性能

- 启动时只做轻量扫描
- 不在 `onload` 中直接全量 embedding
- 必要时将扫描分批执行

### 20.2 网络成本

- embedding 只在索引更新时调用
- rerank 只在查询时对 top K 候选调用
- chat 只在用户显式进入聊天模式时调用

### 20.3 数据库体积

由于 embedding 占空间较大，需要控制：

- chunk 粒度不要过碎
- 图片只索引被引用资源
- 清理失去引用的图片记录

---

## 21. 隐私与披露

插件必须明确披露：

- 建索引时发送哪些内容到远端
- 搜索时发送哪些内容到远端
- 聊天时发送哪些内容到远端
- 本地保存哪些数据

必须说明：

- 本地保存的是索引、元数据、引用关系和配置
- 不保存绝对路径
- 远端服务可能接收到文本 chunk、图片、query 和聊天上下文

---

## 22. 推荐的实施阶段

### Phase 0: 基础骨架重构

- 清理 sample plugin 示例逻辑
- 完成模块目录重构
- 建立设置、运行时路径和基础状态管理

### Phase 1: 本地存储与索引状态

- 建立 SQLite 封装
- 实现 schema 和 repository
- 实现索引状态展示

### Phase 2: 扫描与文本索引

- 启动扫描
- 手动扫描
- dirty 状态维护
- Markdown 切块
- 文本 embedding
- chunk 检索

### Phase 3: 搜索侧边栏

- 常驻 view
- 搜索输入
- `All / Notes` 结果展示
- 打开笔记与定位

### Phase 4: rerank 与聊天

- rerank 接入
- 结果重排
- 基于当前结果聊天
- 引用卡片与跳转

### Phase 5: 图片索引与多模态

- 图片引用解析
- 图片 embedding
- `Images` 结果视图
- 文搜图、图搜图、图搜文

### Phase 6: 稳定性与维护

- 错误恢复
- 性能调优
- 数据库清理与维护

---

## 23. 首版必须遵守的约束

1. 不在数据库中保存绝对路径。
2. 不索引非 Markdown 文档。
3. 不索引未被 Markdown 引用的图片。
4. 不使用 Git 作为变更跟踪主机制。
5. embedding provider/model 变更必须要求全量重建。
6. 聊天必须基于当前搜索结果，不做无边界全库对话。
7. 引用必须能回到原始证据位置。

---

## 24. 当前已确定的默认值

- 默认索引模式：`text-only`
- 图片 embedding：默认关闭
- AI chat：默认关闭
- rerank：默认开启，但放在 Advanced
- 默认结果标签：`All`
- 短笔记阈值：`10K tokens`
- 长笔记上下文窗口：命中 chunk 前后各 `2-3` 个 chunk
- 图片索引范围：仅限被 Markdown 引用的图片

---

## 25. 后续实现时优先验证的技术点

1. 在 Obsidian 插件环境中可靠保存和读取 SQLite 文件。
2. 稳定解析 Markdown 标题层级和图片引用。
3. 多 provider 抽象是否足够覆盖文本、多模态、rerank 和 chat。
4. 文本与图片是否可使用同一多模态模型实现跨模态检索。
5. 文本定位回原文时，标题路径和 chunk 偏移是否足够稳定。

---

## 26. 一句话结论

`SimpleRAG` 第一版应被实现为一个“本地持久化索引 + 远端模型 API + 常驻侧边栏搜索/聊天”的 Obsidian RAG 插件，其中 Markdown 文本是主索引对象，图片是可选多模态扩展对象，所有运行时数据存放在插件私有目录中，配置走 `data.json`，索引走 `storage/rag-index.sqlite`。
