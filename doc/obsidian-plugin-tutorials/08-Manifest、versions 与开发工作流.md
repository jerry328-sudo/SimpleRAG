# Manifest、versions 与开发工作流

这一篇把官方文档里分散在 `Anatomy of a plugin`、`Development workflow`、`Manifest`、`Versions` 四处的信息收拢到一起，解决三个高频问题：

1. `manifest.json` 到底哪些字段是必须的。
2. `versions.json` 什么时候需要改，什么时候不需要改。
3. 开发时改了代码、改了清单、改了版本，各自应该怎么重载。

## 1. 一个插件最少由什么组成

官方文档和 `obsidian-api` 仓库共同指向的最小插件形态如下：

```text
.obsidian/plugins/<plugin-id>/
├─ manifest.json
├─ main.js
├─ styles.css            (可选)
└─ versions.json         (只有在需要兼容旧版 Obsidian 时才需要)
```

其中：

- `manifest.json` 是清单，告诉 Obsidian 这是什么插件。
- `main.js` 是最终运行入口，Obsidian 实际加载的是它，而不是 `src/main.ts`。
- `styles.css` 是插件样式文件，存在时会被一并加载。
- `versions.json` 是兼容映射，不是每次发版都要改。

## 2. `manifest.json` 官方必填字段

根据官方 `Reference/Manifest`，插件至少应包含这些字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 插件唯一标识。不能包含 `obsidian`。本地开发时应与插件目录名一致。 |
| `name` | 是 | 展示给用户看的名称。 |
| `version` | 是 | 语义化版本号，格式必须是 `x.y.z`。 |
| `minAppVersion` | 是 | 插件要求的最低 Obsidian 版本。 |
| `description` | 是 | 插件简介。社区提交通常要求短、清晰、以句号结尾。 |
| `author` | 是 | 作者名。 |
| `isDesktopOnly` | 是 | 若使用 Node.js / Electron API，必须设为 `true`。 |

常见可选字段：

- `authorUrl`
- `fundingUrl`

`fundingUrl` 官方允许两种写法：

### 2.1 单个资助链接

```json
{
  "fundingUrl": "https://buymeacoffee.com/your-name"
}
```

### 2.2 多个资助链接

```json
{
  "fundingUrl": {
    "Buy Me a Coffee": "https://buymeacoffee.com/your-name",
    "GitHub Sponsors": "https://github.com/sponsors/your-name"
  }
}
```

## 3. 一个推荐的最小 `manifest.json`

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "0.0.1",
  "minAppVersion": "1.8.0",
  "description": "Adds a ribbon action and a sample command.",
  "author": "Your Name",
  "authorUrl": "https://example.com",
  "isDesktopOnly": false
}
```

### 3.1 关于 `id` 的两个硬规则

- `id` 不能包含 `obsidian`
- 本地开发时，插件目录名必须和 `id` 一致

官方特别提到：如果目录名和 `id` 不一致，某些行为不会按预期工作，例如 `onExternalSettingsChange`。

## 4. `versions.json` 什么时候需要

官方 `Reference/Versions` 的要点非常明确：

- `versions.json` 用来把“插件版本”映射到“该版本要求的最低 Obsidian 版本”。
- 只有当你提高了 `manifest.json` 里的 `minAppVersion` 时，才需要更新它。
- 你不需要把每一个发布版本都列进去。

示例：

```json
{
  "0.1.0": "1.0.0",
  "0.12.0": "1.1.0",
  "1.0.0": "1.2.0"
}
```

含义是：

- 使用 Obsidian `1.2.0+` 的用户可以装 `1.0.0`
- 使用 Obsidian `1.1.x` 的用户会回退到 `0.12.0`
- 使用 Obsidian `1.0.x` 的用户会回退到 `0.1.0`

## 5. 官方建议的开发工作流

结合官方教程与 sample plugin README，一个稳定的开发流程是：

1. 创建一个独立的开发 vault，不在主 vault 里做实验。
2. 把插件工程放到 `.obsidian/plugins/<plugin-id>/`。
3. 在插件目录执行 `npm install`。
4. 启动 `npm run dev`，持续监听并生成 `main.js`。
5. 修改 `src/main.ts`、`src/settings.ts`、`styles.css` 等源码。
6. 在 Obsidian 里重载插件，而不是每次都重启整个应用。
7. 发布前执行 `npm run build`，生成生产构建。

## 6. 改了什么，该怎么重载

### 6.1 改了 TypeScript / CSS / 业务代码

常用方式：

- 在插件设置页里关闭再开启插件
- 运行命令面板里的 `Reload app without saving`
- 或使用 Hot-Reload 插件自动重载

### 6.2 改了 `manifest.json`

官方教程明确要求：

- 修改 `manifest.json` 后重启 Obsidian

因为插件名称、`id`、兼容版本等元数据不是普通逻辑热重载那样刷新。

### 6.3 改了 `version` / `minAppVersion`

除了更新 `manifest.json` 之外，还要看是否需要同步：

- `package.json`
- `versions.json`
- GitHub Release tag

## 7. `main.js` 与 `src/main.ts` 的关系

这是新手最容易混淆的一点：

- 你写的是 `src/main.ts`
- 打包器把它编译并 bundle 成根目录下的 `main.js`
- Obsidian 加载的是 `main.js`

所以碰到“代码改了但没生效”的第一排查项通常就是：

1. `npm run dev` 是否还在运行
2. 根目录 `main.js` 是否更新了
3. 插件是否已经重载

## 8. 官方 sample plugin 里的脚本是怎么协作的

截至 2026-03-31，官方 sample plugin 的关键脚本逻辑可以概括为：

- `npm run dev`
  - 使用 `esbuild` 监听 `src/main.ts`
  - 输出开发构建到 `main.js`
- `npm run build`
  - 先跑 TypeScript 检查
  - 再跑生产构建
  - 生产构建会压缩 `main.js`
- `npm version patch|minor|major`
  - 触发 `version-bump.mjs`
  - 同步 `package.json` 与 `manifest.json` 的版本
  - 仅在 `minAppVersion` 首次变化时追加 `versions.json`

## 9. 开发目录建议

最小目录：

```text
your-plugin/
├─ manifest.json
├─ package.json
├─ tsconfig.json
├─ esbuild.config.mjs
├─ versions.json
├─ styles.css
└─ src/
   ├─ main.ts
   └─ settings.ts
```

再复杂一些再分层：

```text
src/
├─ commands/
├─ views/
├─ modals/
├─ services/
├─ settings/
└─ utils/
```

## 10. 发布前版本检查

发版前至少核对这 6 项：

1. `manifest.json.version`
2. `package.json.version`
3. Git tag
4. GitHub Release tag
5. `manifest.json.minAppVersion`
6. `versions.json` 是否需要更新

只要这几个地方有一个不一致，发布和社区提交通常就会出问题。

## 11. 一句话记忆版

- `manifest.json` 决定“这是什么插件”
- `main.js` 决定“Obsidian 实际运行什么代码”
- `versions.json` 决定“旧版 Obsidian 装哪个插件版本”
- 改源码重载插件，改清单重启 Obsidian

## 12. 对应官方来源

- `Anatomy of a plugin`
- `Development workflow`
- `Build a plugin`
- `Reference/Manifest`
- `Reference/Versions`
- `obsidian-sample-plugin` README / `package.json` / `manifest.json` / `version-bump.mjs`
