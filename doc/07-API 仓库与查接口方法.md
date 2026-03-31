# API 仓库与查接口方法

官方 API 文档告诉“该怎么用”，`obsidian-api` 仓库告诉“参数和返回值是什么”。

仓库地址：

- https://github.com/obsidianmd/obsidian-api

核心文件：`obsidian.d.ts`

## 1. 先看什么

常用入口建议按这个顺序：

1. 官方文档概念页（例如 Command、Setting、Vault）
2. `obsidian-sample-plugin` 的对应示例
3. `obsidian.d.ts` 验证签名与类型

## 2. 用途最广的类型入口

优先掌握这些类/对象：

- `Plugin`
- `App`
- `Workspace`
- `WorkspaceLeaf`
- `Vault`
- `TFile`、`TFolder`
- `Platform`
- `Modal`
- `PluginSettingTab`
- `Setting`

## 3. 从 `obsidian.d.ts` 查参数

当你遇到“某个方法签名不确定”时，先查定义：

- 有无可选参数
- 回调入参顺序
- 返回值类型（是否 Promise）
- 是否有 `@since`

这会避免常见报错，例如误用回调参数或传了错误类型。

## 4. 版本门控的两层策略

- 文档层：看该能力出现版本
- 运行层：用 `requireApiVersion('x.y.z')` 做兼容判断

这能让插件在旧版本里不崩。

## 5. 高频易错接口查法

### 设置相关

查 `PluginSettingTab` 与 `Setting`，确认 `addText`、`addToggle`、`addDropdown` 的签名。

### 文件改写

查 `Vault`（`read`, `cachedRead`, `modify`, `process`）和 `FileManager.processFrontMatter`。

### 编辑器

查 `Editor` 相关方法，比如选择替换、读取选区、光标操作等。

## 6. 为什么要同时看文档和类型

官方文档和类型库不是替代关系：

- 文档给行为语义
- 类型库给精确接口
- 两者一起才能减少集成错误

## 7. 与提交发布的衔接

`manifest.json` 的版本变化、最小兼容版本、平台能力标记都建议先与 API 定义交叉核对，减少审核退件率。
