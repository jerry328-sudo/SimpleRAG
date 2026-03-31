# Obsidian 社区插件

## 项目概述

- 目标：Obsidian 社区插件（TypeScript → 打包后的 JavaScript）。
- 入口点：`main.ts` 编译为 `main.js` 并由 Obsidian 加载。
- 必要的发布产物：`main.js`、`manifest.json` 和可选的 `styles.css`。

## 项目级约束文档

- 本项目后续的需求讨论、架构设计、代码实现、代码评审与发布前检查，除遵循本 `AGENTS.md` 外，还必须遵循：
  - `doc/01-SimpleRAG-RAG-详细设计与实施计划.md`
  - `doc/02-SimpleRAG-项目规范与边界.md`
  - `doc/03-SimpleRAG-项目架构与构建思路.md`
- `doc/01-SimpleRAG-RAG-详细设计与实施计划.md` 是本项目的主设计文档，用于约束产品目标、模块划分、数据模型、索引/检索/聊天流程与实施顺序。
- `doc/02-SimpleRAG-项目规范与边界.md` 是本项目的边界与评审文档，用于约束实现范围、数据边界、索引边界、聊天边界、Provider 边界、测试边界与需求变更边界。
- `doc/03-SimpleRAG-项目架构与构建思路.md` 是本项目的工程架构文档，用于描述当前代码结构、模块职责、依赖方向、运行时数据流、扩展入口和后续修改切入方式。
- 每次修改项目代码时，必须同步检查并更新 `doc/03-SimpleRAG-项目架构与构建思路.md`，确保文档与当前实现一致；尤其是以下变更，必须在同次修改中同步更新 `doc/03`：
  - 目录结构变化
  - 模块职责变化
  - 依赖方向变化
  - 运行时文件位置变化
  - 索引 / 搜索 / 聊天 / Provider / 存储链路变化
  - 推荐修改入口或重构建议变化
- 如果实现方案、需求变更或代码行为与 `doc/01`、`doc/02` 或 `doc/03` 冲突，应先更新对应文档并确认新的边界或架构说明，再修改实现；不允许先偏离文档落地，再事后补文档。

## 环境与工具

- Node.js：使用当前 LTS 版本（推荐 Node 18+）。
- **包管理器：npm**（本示例必需 - `package.json` 定义了 npm 脚本与依赖）。
- **打包工具：esbuild**（本示例必需 - `esbuild.config.mjs` 和构建脚本依赖于它）。如果是其他项目，可使用 Rollup 或 webpack 等替代打包工具，但前提是将所有外部依赖都打包进 `main.js`。
- 类型定义：`obsidian` 类型定义文件。

**说明**：该示例项目对 npm 和 esbuild 有特定技术依赖。若从头创建插件，可选择其他工具，但需要相应替换构建配置。

### 安装

```bash
npm install
```

### 开发（监听）

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

## 代码检查（Lint）

- 若要使用 eslint，请在终端安装：`npm install -g eslint`
- 使用 eslint 分析本项目请执行：`eslint main.ts`
- eslint 会生成按文件和行号给出的代码改进建议报告。
- 如果源码在某个目录（如 `src`）内，可使用该命令分析该目录下全部文件：`eslint ./src/`

## 文件与目录约定

- **将代码拆分到多个文件**：将功能分散到独立模块，而不是全部写在 `main.ts` 中。
- 源码放在 `src/` 下。将 `main.ts` 保持精简，只聚焦插件生命周期（加载、卸载、注册命令）。
- **示例目录结构**：
  ```
  src/
    main.ts           # 插件入口与生命周期管理
    settings.ts       # 设置接口与默认值
    commands/         # 命令实现
      command1.ts
      command2.ts
    ui/               # UI 组件、模态框、视图
      modal.ts
      view.ts
    utils/            # 工具函数、帮助函数
      helpers.ts
      constants.ts
    types.ts          # TypeScript 接口与类型
  ```
- **不要提交构建产物**：永远不要将 `node_modules/`、`main.js` 或其他生成文件提交到版本控制。
- 保持插件体积小。避免使用大型依赖，优先使用兼容浏览器的包。
- 生成产物应放在插件根目录或 `dist/`，具体取决于你的构建配置。发布产物必须位于仓库库中 Vault 插件目录的顶层（`main.js`、`manifest.json`、`styles.css`）。

## `manifest.json` 规则

- 必须包含（非完整列表）：
  - `id`（插件 ID；本地开发时应与文件夹名一致）
  - `name`
  - `version`（语义化版本 `x.y.z`）
  - `minAppVersion`
  - `description`
  - `isDesktopOnly`（布尔值）
  - 可选：`author`、`authorUrl`、`fundingUrl`（字符串或映射）
- 版本发布后不要更改 `id`。将其视为稳定 API。
- 使用新 API 时，请保持 `minAppVersion` 准确。
- 官方校验要求见： https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## 测试

- 手动安装以进行测试：将 `main.js`、`manifest.json`、`styles.css`（如有）复制到：
  ```
  <Vault>/.obsidian/plugins/<plugin-id>/
  ```
- 重新加载 Obsidian，并在 **设置 → 社区插件** 中启用该插件。

## 命令与设置

- 所有面向用户的命令应通过 `this.addCommand(...)` 添加。
- 若插件有配置项，请提供设置页和合理默认值。
- 使用 `this.loadData()` / `this.saveData()` 持久化设置。
- 使用稳定的命令 ID；发布后避免重命名。

## 版本管理与发布

- 在 `manifest.json` 中递增 `version`（遵循 SemVer），并更新 `versions.json` 以映射插件版本 → 最低应用版本。
- 创建 GitHub Release，标签需与 `manifest.json` 中的 `version` 完全一致，不要加前缀 `v`。
- 在发布时将 `manifest.json`、`main.js`、`styles.css`（如有）作为独立资源上传。
- 首次发布后，按要求完成社区目录中的插件添加/更新流程。

## 安全、隐私与合规

请遵循 Obsidian 的 **开发者政策** 和 **插件指南**，尤其是：

- 默认采用本地/离线运行。仅在功能所需时才进行网络请求。
- 不得使用隐匿遥测。如果收集可选分析数据或调用第三方服务，必须明确征得用户同意，并在 `README.md` 与设置中清晰说明。
- 不要执行远程代码、拉取并执行脚本，或在正常发布流程之外自动更新插件代码。
- 限制权限范围：仅在保险库内读取/写入必需内容，不要访问仓库之外的文件。
- 清晰披露任何外部服务、发送的数据及风险。
- 尊重用户隐私。除非绝对必要且经过明确同意，不得采集保险库内容、文件名或个人信息。
- 避免欺骗性设计、广告或骚扰式通知。
- 使用 `register*` 辅助方法注册和清理所有 DOM、应用与定时器监听器，确保插件可安全卸载。

## 用户体验与文案规范（UI 文案、命令、设置）

- 标题、按钮和标签优先使用句式式（首字母大写风格）大小写。
- 步骤说明使用清晰、行动导向的命令式表述。
- 使用 **粗体** 标识界面中的字面文本标签。交互建议优先使用“select”。
- 导航使用箭头符号：**设置 → 社区插件**。
- 保持应用内文本短小、一致且无术语化冗词。

## 性能

- 保持启动轻量。按需延迟执行重任务。
- 避免在 `onload` 中执行长时间运行任务；使用懒加载初始化。
- 批量进行磁盘访问，避免过度扫描保险库。
- 对文件系统事件触发的高开销操作使用防抖/节流。

## 编码约定

- 建议使用 `"strict": true` 的 TypeScript。
- **保持 `main.ts` 简洁**：仅处理插件生命周期（onload、onunload、addCommand 调用），将功能逻辑分离到独立模块。
- **拆分大文件**：若某文件超过约 200–300 行，考虑拆为更小、职责更清晰的模块。
- **保持清晰的模块边界**：每个文件应只承担一个明确职责。
- 将所有内容打包进 `main.js`（不得保留未打包的运行时依赖）。
- 若需兼容移动端，请避免使用 Node/Electron API，并据此设置 `isDesktopOnly`。
- 优先使用 `async/await` 替代 Promise 链；优雅处理错误。

## 移动端

- 在可行条件下在 iOS 与 Android 上测试。
- 除非 `isDesktopOnly` 为 `true`，否则不要假设仅桌面端行为。
- 避免构建大型内存结构，注意内存和存储约束。

## Agent 约定

**应当**
- 使用稳定的命令 ID 添加命令（发布后不要重命名）。
- 在设置中提供默认值与校验逻辑。
- 编写幂等代码路径，确保重载/卸载时不会泄漏监听器或定时器。
- 对所有需要清理的逻辑使用 `this.register*` 辅助方法。

**不应**
- 未经明确用户场景与文档说明就引入网络调用。
- 在未明确披露并征得明确同意的情况下，不要交付依赖云服务的功能。
- 除非必要且获用户同意，不要存储或传输保险库内容。

## 常见任务

### 将代码拆分到多个文件

**main.ts**（最小化，仅管理生命周期）：
```ts
import { Plugin } from "obsidian";
import { MySettings, DEFAULT_SETTINGS } from "./settings";
import { registerCommands } from "./commands";

export default class MyPlugin extends Plugin {
  settings: MySettings;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    registerCommands(this);
  }
}
```

**settings.ts**：
```ts
export interface MySettings {
  enabled: boolean;
  apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
  enabled: true,
  apiKey: "",
};
```

**commands/index.ts**：
```ts
import { Plugin } from "obsidian";
import { doSomething } from "./my-command";

export function registerCommands(plugin: Plugin) {
  plugin.addCommand({
    id: "do-something",
    name: "Do something",
    callback: () => doSomething(plugin),
  });
}
```

### 添加命令

```ts
this.addCommand({
  id: "your-command-id",
  name: "Do the thing",
  callback: () => this.doTheThing(),
});
```

### 持久化设置

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  await this.saveData(this.settings);
}
```

### 安全注册监听器

```ts
this.registerEvent(this.app.workspace.on("file-open", f => { /* ... */ }));
this.registerDomEvent(window, "resize", () => { /* ... */ });
this.registerInterval(window.setInterval(() => { /* ... */ }, 1000));
```

## 故障排查

- 构建后插件无法加载：确认 `main.js` 和 `manifest.json` 位于 Vault 插件目录 `<Vault>/.obsidian/plugins/<plugin-id>/` 的顶层。
- 构建问题：如果缺少 `main.js`，请运行 `npm run build` 或 `npm run dev` 来编译 TypeScript 源码。
- 命令未显示：确认 `addCommand` 在 `onload` 之后执行且命令 ID 不重复。
- 设置未持久化：确保 `loadData`/`saveData` 已被 await，并在变更后重渲染界面。
- 仅移动端问题：确认未使用桌面专有 API，检查并调整 `isDesktopOnly`。

## 参考资料

- Obsidian 示例插件：https://github.com/obsidianmd/obsidian-sample-plugin
- API 文档：https://docs.obsidian.md
- 开发者政策：https://docs.obsidian.md/Developer+policies
- 插件指南：https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- 样式指南：https://help.obsidian.md/style-guide
