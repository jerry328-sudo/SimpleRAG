# SimpleRAG 项目架构与构建思路

## 1. 文档目的

本文档不重复 `01` 的产品设计，也不重复 `02` 的边界约束。  
它的目标是回答一个更工程化的问题：

- 当前项目代码是怎么组织的
- 各模块之间依赖关系是什么
- 为什么要按现在这种方式构建
- 下次修改功能时，应该从哪里切入
- 哪些地方是稳定骨架，哪些地方是后续可继续拆分的实现细节

如果你准备继续开发 `SimpleRAG`，建议按这个顺序阅读：

1. `doc/01-SimpleRAG-RAG-详细设计与实施计划.md`
2. `doc/02-SimpleRAG-项目规范与边界.md`
3. `doc/03-SimpleRAG-项目架构与构建思路.md`

---

## 2. 这份文档描述什么

本文档描述的是“当前代码实际落地后的工程结构”，而不是抽象产品蓝图。

因此它会同时包含两类信息：

1. 当前已经实现的架构
2. 当前代码中有意保留的演进方向

例如：

- 产品设计文档里目标是本地数据库语义
- 当前实现里存储层仍是 JSON 持久化

这种情况在本文档中会明确写成：

- 当前实现是什么
- 为什么当前这么做
- 后续若迁移，应该沿着哪条路径改

---

## 3. 一句话架构总览

`SimpleRAG` 当前是一个典型的 Obsidian 插件内部分层系统：

- `main.ts`
  - 负责插件生命周期、命令注册、视图注册、模块组装
- `settings`
  - 负责配置定义与设置页
- `runtime`
  - 负责运行时路径与瞬时状态
- `providers`
  - 负责远端模型 API 抽象
- `storage`
  - 负责本地索引真相
- `indexing`
  - 负责扫描、切块、提取图片引用、生成向量
- `search`
  - 负责查询 embedding、召回、rerank、结果组装
- `chat`
  - 负责从搜索结果构造上下文、筛选证据、发起问答
- `ui`
  - 负责侧边栏视图和用户交互

可以把它理解成下面这条主链路：

```text
Obsidian Vault
  -> scanner
  -> index-manager
  -> storage/db
  -> query-service
  -> context-builder / conversation-service
  -> search-view
```

---

## 4. 当前源码结构

当前 `src/` 目录大致是：

```text
src/
  main.ts
  settings/
    tab.ts
    types.ts
  runtime/
    paths.ts
    state.ts
  providers/
    registry.ts
    request.ts
    types.ts
    embedding/
      openai-compatible.ts
    rerank/
      openai-compatible.ts
    chat/
      openai-compatible.ts
  storage/
    db.ts
  indexing/
    scanner.ts
    index-manager.ts
    chunking/
      markdown-parser.ts
    links/
      image-reference-resolver.ts
  search/
    query-service.ts
    vector-search.ts
  chat/
    context-builder.ts
    evidence-selector.ts
    conversation-service.ts
  ui/
    views/
      search-view.ts
  types/
    domain.ts
  utils/
    base64.ts
    hash.ts
```

这套结构有两个核心原则：

1. `main.ts` 只做组装，不做重逻辑
2. 索引、搜索、聊天三条链路尽量彼此解耦

---

## 5. 生命周期和组装方式

### 5.1 `main.ts` 的角色

[`src/main.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/main.ts) 是插件入口，它负责：

- `loadSettings()`
- 初始化数据库
- 注册侧边栏 View
- 注册 Ribbon 和命令
- 注册 vault 事件监听
- 暴露 UI 调用的公共方法：
  - `scanChanges()`
  - `updateIndex()`
  - `rebuildIndex()`
  - `clearIndex()`
  - `search()`
  - `searchByImage()`
  - `chat()`

它不直接做以下事情：

- 不自己解析 Markdown
- 不自己请求 embedding API
- 不自己做向量搜索
- 不自己拼聊天上下文

这使得后续替换某条链路时，不需要在入口文件里做大改。

### 5.2 为什么这样组装

因为 Obsidian 插件入口天然只有一个 `Plugin` 子类，如果把业务逻辑全塞进去，后续会很快失控。

当前做法是：

- `main.ts` 持有全局依赖
- 按需创建具体服务
- UI 只通过 `plugin.xxx()` 调用公共能力

这对后续重构最重要的价值是：

- UI 不直接依赖 provider 细节
- provider 不直接依赖 UI
- indexing/search/chat 只围绕自己的领域工作

---

## 6. 运行时文件与状态

### 6.1 路径层

[`src/runtime/paths.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/runtime/paths.ts) 负责统一计算插件运行时目录。

这层存在的目的很简单：

- 避免在业务代码里到处拼路径字符串
- 确保配置、存储、缓存始终落在插件私有目录

当前约定：

- 配置：`data.json`
- 索引存储：插件私有目录下的 `storage/`

### 6.2 状态层

[`src/runtime/state.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/runtime/state.ts) 负责保存“运行中但不持久化”的状态，例如：

- 是否正在扫描
- 是否正在索引
- dirty 文件集合
- 最近统计信息

这类状态不能混进持久化数据库，否则会把“运行时瞬时状态”和“索引真相”搅在一起。

一个很重要的设计点是：

- `dirtyFiles` 是运行时辅助状态
- `db.files.status` 是持久化索引状态

两者相关，但不是完全同一层概念。

### 6.3 启动前数据校验

当前启动流程已经补上了一条“防坏数据覆盖”的保护链路：

- 配置文件在加载前先做存在性与格式校验
- 本地索引文件在加载前先做存在性与 schema 校验
- 如果发现文件损坏或结构非法，不会直接把坏文件当成空文件覆盖
- 原文件会被移动到同目录下的 `.corrupt-时间戳` 备份文件
- 插件会通过 `Notice` 和控制台警告提示用户

这条链路的目的不是自动修复坏数据，而是：

- 保留现场
- 避免静默覆盖
- 让用户知道当前索引或配置已异常

对应实现主要在：

- `src/runtime/settings-loader.ts`
- `src/storage/db.ts`
- `src/main.ts`

---

## 7. 设置层的职责

### 7.1 `settings/types.ts`

[`src/settings/types.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/settings/types.ts) 是配置真相。

它定义了：

- provider 配置
- feature 开关
- 检索参数
- 聊天参数
- 网络参数
- 调试参数

同时也定义默认值 `DEFAULT_SETTINGS`。

后续如果要新增配置项，第一步应该先改这里，而不是先改设置页 UI。

### 7.2 `settings/tab.ts`

[`src/settings/tab.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/settings/tab.ts) 只负责：

- 把设置项渲染成 UI
- 监听改动后写回 `plugin.settings`
- 对需要重建索引的改动给出提示

这层不应该承担：

- provider 能力判断主逻辑
- 索引一致性主逻辑
- 复杂业务校验

当前设置页采用了“默认简洁，Advanced 展开”的思路，这是为了保证：

- 普通用户不被大量参数淹没
- 复杂能力仍可调

### 7.3 为什么 token 在设置里而不是数据库里

因为插件小体积配置天然适合用 `loadData()` / `saveData()` 持久化。

数据库主要负责索引真相，设置主要负责运行配置。  
这两类数据分开，后续排查和迁移都会更清晰。

---

## 8. Provider 层的构建思路

### 8.1 为什么要有 provider 层

`SimpleRAG` 的核心前提之一是：

- embedding / rerank / chat 都走远端 API
- 但业务逻辑不能绑死某一家服务商

因此 provider 层承担了“把厂商协议封装到统一接口”的职责。

### 8.2 `providers/types.ts`

[`src/providers/types.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/providers/types.ts) 定义统一接口：

- `EmbeddingProvider`
- `RerankProvider`
- `ChatProvider`

以及统一的能力描述：

- 是否支持图片
- 是否支持跨模态
- 是否支持 vision chat
- 是否支持 streaming

这层的价值在于：

- 业务逻辑只看能力，不看品牌名
- 设置页可以根据 capability 做校验
- 后续新增 provider 时不会污染上层代码

### 8.3 `providers/registry.ts`

[`src/providers/registry.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/providers/registry.ts) 当前负责：

- 列出可选 provider
- 校验当前 settings
- 根据 settings 构造 provider 实例

当前虽然只有 `openai-compatible` 一个实现，但 registry 已经提供了扩展框架。

后续新增 provider 时，建议保持下面的改法：

1. 先实现 `providers/<kind>/xxx.ts`
2. 在 `registry.ts` 中注册列表和构造逻辑
3. 不要在 `main.ts`、`query-service.ts`、`conversation-service.ts` 里直接分支判断 provider 名称

### 8.4 `providers/request.ts`

[`src/providers/request.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/providers/request.ts) 是这轮之后非常关键的一层。

它把这些共性问题抽到一起：

- timeout
- retry
- requestUrl 封装
- streaming fetch 封装

这样做的好处是：

- embedding/rerank/chat 不再各自重复实现重试逻辑
- 后续统一修改网络策略更容易
- 业务层不用关心请求层细节

---

## 9. 存储层的构建思路

### 9.1 当前状态

[`src/storage/db.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/storage/db.ts) 当前不是“真 SQLite”，而是：

- 内存中的结构化对象
- 持久化为 JSON 文件

这是一个有意保留的阶段性实现。

不过当前即使底层是 JSON，也已经补上了最基本的数据安全保护：

- 读取前校验结构
- 损坏时先备份原文件
- 再回退到安全默认状态

所以现阶段的主要风险已经不再是“坏数据被直接静默覆盖”，而是“坏数据会导致用户失去当前可用索引，需要重新扫描/重建”，这两者的严重性不同。

### 9.2 为什么先这样做

因为当前项目优先级是先把以下链路跑通：

- 索引
- 搜索
- 聊天
- provider 模块化
- UI 交互

在这之前，直接引入 SQLite/WASM 会增加实现复杂度。

### 9.3 为什么仍然保留数据库语义

虽然底层是 JSON，但上层已经按数据库语义来用它：

- `getFile`
- `upsertChunk`
- `getAllEmbeddings`
- `deleteMentionsByAsset`
- `setMeta`

这意味着未来迁移到 SQLite 时，主要替换的是 `db.ts`，而不是整套业务逻辑。

### 9.4 存储层当前承担什么真相

当前存储层保存：

- `schema_meta`
- `files`
- `note_chunks`
- `assets`
- `asset_mentions`
- `embeddings`

这就是当前系统的“单一真相来源”。

如果后续改代码，必须避免出现：

- UI 自己维护一份索引状态
- 搜索层缓存一份不受控的 embeddings 真相
- 图片引用关系同时在多处重复维护

---

## 10. 索引链路的构建思路

### 10.1 扫描层：`scanner.ts`

[`src/indexing/scanner.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/indexing/scanner.ts) 的职责很克制：

- 只看文件元数据
- 只判断新增、修改、删除
- 只维护 `files` 状态和扫描时间

它不做：

- 正文读取
- chunking
- embedding

这层的设计意图是：

- 启动轻量
- 手动扫描成本低
- 将“发现变化”和“处理变化”拆开

### 10.2 主管理器：`index-manager.ts`

[`src/indexing/index-manager.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/indexing/index-manager.ts) 是索引主链路协调者。

它负责：

- 读取 dirty note
- 解析 Markdown
- 提取图片引用
- 清理旧 chunk / 旧 embedding
- 写入新 chunk
- 生成文本 embedding
- 在多模态模式下生成图片 embedding
- 清理删除或失去引用的资产

这里最关键的思路是：

- “扫描”只做轻活
- “更新索引”才做重活

### 10.3 为什么 `rebuildIndex()` 必须先清空再扫描

因为全量重建的语义不是“把已知文件再过一遍”，而是：

- 把当前 vault 重新视为唯一真相

因此当前实现改成了：

1. `clearAll()`
2. `scanner.scan()`
3. `updateIndex()`

这样新增文件不会漏掉，删除文件也不会残留历史索引。

### 10.4 文本索引为什么围绕 note 而不是 chunk 直接做

因为 Obsidian 的基本内容单元是笔记。  
chunk 只是检索单元，不是内容所有权单元。

所以当前逻辑是：

- 以 note 为主键清理旧数据
- 重新生成 note 的 chunks
- 再对 chunks 做 embedding

这保证了笔记重建时不会留下孤儿 chunk。

### 10.5 图片为什么通过 mention 关系接入

因为一张图片可以被多篇笔记引用。

如果把图片直接绑定到单一笔记，会立刻丢失这两类信息：

- 这张图还被谁引用
- 搜索命中图片时应该返回哪些来源笔记

因此当前实现用：

- `assets`
- `asset_mentions`

把“资源”和“引用关系”拆开。

### 10.6 当前对并发的处理

`embedChunks()` 现在按 `maxConcurrentRequests` 做 worker 并发。

它的实现依赖 JS 在 `await` 之前的同步段是单线程执行的，所以共享 `cursor` 是安全的。  
这也是为什么代码里专门加了注释。

后续如果这里继续扩展，建议保持原则不变：

- 并发控制只在索引层做
- provider 仍然只负责单次请求

---

## 11. 文本切块与图片解析

### 11.1 `markdown-parser.ts`

[`src/indexing/chunking/markdown-parser.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/indexing/chunking/markdown-parser.ts) 是文本结构化入口。

当前职责包括：

- 解析 Markdown 标题层级
- 构造章节
- 按章节和段落生成 chunk
- 估算 token

这个模块应该保持纯文本处理属性，避免掺入：

- provider 调用
- 数据库写入
- UI 逻辑

### 11.2 `image-reference-resolver.ts`

[`src/indexing/links/image-reference-resolver.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/indexing/links/image-reference-resolver.ts) 当前已经修到比较关键的正确形态：

- wikilink 用 `metadataCache.getFirstLinkpathDest()`
- Markdown 图片路径按笔记所在目录解析
- 统一输出 vault 相对路径

这个模块后续如果继续改，唯一应坚持的原则是：

- 输出必须是“可直接进入索引真相的标准路径”

不要把“半解析路径”继续丢给后面模块兜底。

---

## 12. 搜索链路的构建思路

### 12.1 `query-service.ts`

[`src/search/query-service.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/search/query-service.ts) 是搜索主入口。

当前已支持：

- `searchText()`
- `searchImage()`

它负责：

1. 生成 query embedding
2. 读取当前有效 embeddings
3. 向量召回
4. 组装结果
5. 可选 rerank

### 12.2 为什么先过滤 embedding 再搜索

因为索引里可能同时存在：

- 不同 provider 的 embedding
- 不同 model 的 embedding
- 文本和图片 embedding

如果不先过滤，召回结果会变得不可信。

所以 `getSearchEmbeddings()` 现在承担了一个非常重要的质量守门职责：

- 只允许当前 provider/model/dimension/index_mode 下的向量参与搜索
- 如果库里有 embedding，但当前配置下一个都不匹配，直接要求重建

这能避免“静默返回空结果”。

### 12.3 图片搜索为什么放在同一个服务里

因为文本搜图、图搜图、图搜文本质上仍是同一套检索链路：

- 查询对象不同
- 召回集合不同
- 结果组装方式相同

因此当前设计选择：

- `QueryService` 统一处理文本查询和图片查询
- provider 决定是否支持图片 query embedding

这样可以避免未来出现两套割裂的搜索实现。

### 12.4 rerank 为什么仍然可选

因为 rerank 是质量增强，不是索引真相的一部分。

当前原则是：

- 没有 rerank 时仍能搜索
- rerank 失败时退回向量分数
- 不能让 rerank 成为搜索可用性的单点故障

---

## 13. 聊天链路的构建思路

### 13.1 `context-builder.ts`

[`src/chat/context-builder.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/chat/context-builder.ts) 负责把搜索结果转成聊天上下文。

它的关键职责是：

- 把 note 结果按文档聚合
- 短文给全文
- 长文给窗口化上下文
- 把图片结果转成：
  - 文字描述
  - 引用来源
  - 可选的 `imageDataUrl`

这一层的核心思路是：

- 检索单元是 chunk
- 聊天上下文单元是 document packet

### 13.2 `evidence-selector.ts`

[`src/chat/evidence-selector.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/chat/evidence-selector.ts) 是一个可选阶段。

当前作用：

- 在最终聊天前，让 LLM 再筛一遍候选证据

它不是另一个搜索器，而是一个候选压缩器。

当前实现已经加了两个成本约束：

- 最多看前 8 个 packets
- 每个 packet 只截前 400 字符

这就是它当前的构建思路：

- 提升证据密度
- 但不放任它无限吞 token

### 13.3 `conversation-service.ts`

[`src/chat/conversation-service.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/chat/conversation-service.ts) 是聊天主入口。

它负责：

- 调 `ContextBuilder`
- 按设置决定是否走 `EvidenceSelector`
- 根据 provider 能力构造消息
  - 文本模式
  - vision 模式
- 发起 chat
- 构造引用返回给 UI

### 13.4 为什么图片证据要在这里转成 vision input

因为“图片作为证据”属于聊天模型输入协议的一部分，而不是索引层或 UI 层的职责。

索引层负责：

- 图片向量
- 图片引用关系

聊天层负责：

- 如何把图片变成模型能消费的输入

这样职责边界才清楚。

---

## 14. UI 层的构建思路

### 14.1 `search-view.ts`

[`src/ui/views/search-view.ts`](E:/code/GitHub/Obsidian/SimpleRAG/src/ui/views/search-view.ts) 当前承载了几乎全部侧边栏交互：

- 状态区
- 搜索区
- tabs
- 结果列表
- 聊天区

它目前是一个“功能完整但偏厚”的文件。

### 14.2 当前 UI 的实际策略

侧边栏现在已经支持：

- 文本搜索
- 图片搜索
- `All / Notes / Images`
- 打开与定位
- 将结果加入聊天上下文
- 图片缩略图和引用笔记展示

这层的设计目标不是视觉复杂，而是让搜索和聊天在一个入口里闭环。

### 14.3 为什么当前 UI 还没有继续拆组件

因为当前优先级一直是先把链路打通。  
等到功能边界稳定后，下一步最自然的重构就是把这里拆成：

- `status-panel`
- `search-box`
- `result-list`
- `chat-panel`

但在那之前，最好不要一边继续加功能，一边过早拆 UI 目录，否则变更成本会上升。

---

## 15. 当前构建工具链

### 15.1 基础工具

项目当前使用：

- `npm`
- `TypeScript`
- `esbuild`
- `vitest`

对应文件：

- [`package.json`](E:/code/GitHub/Obsidian/SimpleRAG/package.json)
- [`esbuild.config.mjs`](E:/code/GitHub/Obsidian/SimpleRAG/esbuild.config.mjs)
- [`tsconfig.json`](E:/code/GitHub/Obsidian/SimpleRAG/tsconfig.json)

### 15.2 当前构建思路

思路非常直接：

- `src/` 写 TypeScript
- `tsc -noEmit` 负责类型校验
- `esbuild` 负责打包成 Obsidian 可加载的 `main.js`

这样做的好处是：

- 构建链短
- 调试成本低
- 对 Obsidian 社区插件足够实用

### 15.3 为什么不在当前阶段引入更重的工程层

例如：

- monorepo
- 复杂状态管理
- UI framework
- 更复杂的 bundler 插件系统

都不适合当前项目阶段。  
当前插件本质上还是一个单仓库、单入口、强 Obsidian API 依赖的工程，轻量构建才是更合适的选择。

---

## 16. 测试策略

### 16.1 当前测试覆盖的重点

当前测试已经覆盖了相当关键的行为：

- 图片引用解析
- 索引重建与旧 embedding 清理
- 模型过滤与重建提示
- 图片证据进入聊天

这些测试之所以重要，是因为它们都对应“容易悄悄回归但影响很大”的行为。

### 16.2 mock 策略

`tests/helpers.ts` 和 `tests/__mocks__/obsidian.ts` 当前承担了最重要的测试基建职责：

- mock vault 文件
- mock `metadataCache`
- mock `requestUrl`
- mock `Modal` / `Setting`

如果后续继续改测试，建议优先在这里补能力，而不是在每个测试文件里重复造假对象。

---

## 17. 下次修改项目时的切入建议

这一节是本文档最实用的部分。

### 17.1 如果你要改“索引对象范围”

先看：

- `doc/02`
- `src/indexing/scanner.ts`
- `src/indexing/index-manager.ts`
- `src/indexing/links/image-reference-resolver.ts`

不要先改 UI。

### 17.2 如果你要改“模型厂商接入”

先看：

- `src/providers/types.ts`
- `src/providers/registry.ts`
- `src/providers/request.ts`

不要直接在 `main.ts` 或 `query-service.ts` 里写 HTTP 逻辑。

### 17.3 如果你要改“搜索行为”

先看：

- `src/search/query-service.ts`
- `src/search/vector-search.ts`
- `src/ui/views/search-view.ts`

搜索的正确修改顺序通常是：

1. 明确召回逻辑怎么改
2. 明确结果结构怎么变
3. 最后再改 UI 展示

### 17.4 如果你要改“聊天行为”

先看：

- `src/chat/context-builder.ts`
- `src/chat/evidence-selector.ts`
- `src/chat/conversation-service.ts`

不要直接在 UI 里拼 prompt。

### 17.5 如果你要改“设置项”

先改：

- `src/settings/types.ts`

再改：

- `src/settings/tab.ts`

最后检查：

- 是否影响索引有效性
- 是否需要重建提示
- 是否需要 provider 校验

### 17.6 如果你要改“本地存储”

先看：

- `src/storage/db.ts`
- `src/types/domain.ts`

存储改动不要从 UI 反推，也不要绕过 `db.ts` 直接操作底层文件。

---

## 18. 当前最值得继续重构的点

### 18.1 存储层迁移到真正 SQLite

这是当前最大的已知技术债。

原因：

- `getAllEmbeddings()` 仍是全量内存扫描
- JSON 体积会随索引规模快速变大
- 后续迁移、清理和查询效率都受限

### 18.2 `search-view.ts` 继续拆分

当前功能已经够多，后续如果继续加 UI 能力，建议优先拆组件。

### 18.3 `index-manager.ts` 继续拆分

它当前同时负责：

- note indexing
- asset indexing
- cleanup
- meta 写入

后续如果图片逻辑继续变复杂，最自然的演进是拆成：

- `note-indexer`
- `asset-indexer`
- `index-orchestrator`

### 18.4 存储层加 repository 抽象

当前 `db.ts` 暴露的还是比较直接的 CRUD 风格接口。

后续如果迁移 SQLite，可以考虑再加一层 repository，把：

- schema
- 查询
- 迁移
- 业务语义写入

拆得更稳。

---

## 19. 架构层面的硬原则

下次继续开发时，建议始终守住这几条：

1. `main.ts` 只做组装，不做业务核心逻辑。
2. provider 层只封装外部协议，不承担业务判断。
3. 存储层必须是索引真相单一来源。
4. scanner 只做轻量扫描，不做重计算。
5. index-manager 只在用户显式更新时做重工作。
6. search 先过滤有效 embedding，再做召回。
7. chat 只基于搜索结果，不绕过检索。
8. UI 不直接拼 provider 请求，也不直接改存储真相。

---

## 20. 一句话结论

当前 `SimpleRAG` 的工程思路可以概括为：

它不是把所有能力堆进一个 Obsidian 插件入口文件里，而是围绕“设置、provider、存储、索引、搜索、聊天、UI”六个稳定边界来构建，并优先保证数据流清晰、职责分层明确、后续替换成本可控。

如果下次修改仍沿着这条思路推进，项目会持续可维护；如果开始跨层写逻辑、让 UI 直接碰存储、让业务层直接写厂商协议，维护成本会很快失控。
