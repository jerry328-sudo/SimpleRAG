# 常用 API 与界面构建

这一页用于把“查官方文档”和“写具体代码”之间的距离缩小。

## 1. 插件入口类 `Plugin`

标准入口继承 `Plugin`。主要生命周期：

- `onload`：注册命令、UI、事件、后处理器
- `onunload`：额外清理（`register*` 注册的会自动清理）

示例：

```ts
import { Plugin, Notice } from 'obsidian';

export default class DemoPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: 'demo-command',
      name: 'Demo Command',
      callback: () => new Notice('run')
    });
  }
}
```

## 2. 命令（Commands）

命令是最标准的用户入口。推荐写法：

```ts
this.addCommand({
  id: 'insert-hello',
  name: 'Insert Hello',
  editorCallback: (editor) => {
    editor.replaceSelection('Hello');
  }
});
```

高级用法可用 `checkCallback` 或 `editorCheckCallback` 做可用性判断。

官方不建议给社区插件设置默认快捷键。

## 3. Ribbon 与状态栏

### Ribbon

```ts
this.addRibbonIcon('dice', 'Say hello', () => new Notice('hello'));
```

### Status bar

```ts
const status = this.addStatusBarItem();
status.setText('Ready');
```

建议始终把核心操作也提供命令入口，不要只依赖 Ribbon。

## 4. `Notice` 与 `Modal`

### Notice

轻交互反馈：`new Notice('Done')`

### Modal

```ts
import { App, Modal } from 'obsidian';

export class DemoModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    this.modalEl.createEl('h2', { text: 'Demo' });
    this.modalEl.createDiv({ text: 'hello' });
  }
}
```

用于复杂交互和多控件场景。

## 5. 设置页（Setting Tab）

典型流程：

1. 定义 `Settings` 接口与默认值
2. `loadData()` 合并默认值
3. `addSettingTab()` 挂载
4. 在 `display()` 渲染设置项
5. 每次变更 `saveData()`

官方示例中 `settings.ts` 常采用 `Setting` 构建输入项。

## 6. Vault 与文件读写

优先走 Obsidian API，不建议直接操作底层文件接口。

常用 API 方向：

- `getMarkdownFiles()`
- `cachedRead()`
- `read()`
- `process()`
- `modify()`（慎用，尽量优先 `process`）
- `getAbstractFileByPath()`
- `getFileByPath()`

对当前活动文件优先用 `Editor` 操作，对后台批处理优先 `Vault.process`。

## 7. 事件与清理

推荐都用 `registerEvent`/`registerDomEvent`/`registerInterval`：

```ts
this.registerEvent(this.app.vault.on('create', (file) => {}));
this.registerDomEvent(window, 'resize', () => {});
this.registerInterval(window.setInterval(() => {}, 1000));
```

这样在插件关闭时更容易避免泄漏。

## 8. Markdown 后处理

官方建议在 Markdown 渲染流程挂钩：

```ts
this.registerMarkdownPostProcessor((element) => {
  // 扫描 DOM 并增强
});

this.registerMarkdownCodeBlockProcessor('mytype', (source, el) => {
  // 渲染自定义代码块
});
```

用于展示自定义语法或富内容块。

## 9. 视图与工作区

如果你做自定义视图，常见 API：

- `registerView`
- `workspace.getLeavesOfType`
- `workspace.getActiveViewOfType`
- `workspace.revealLeaf`

与性能相关时要注意延迟视图和兼容判断（见下一篇）。

## 10. 版本门控

当要使用较新 API 时：

```ts
import { requireApiVersion } from 'obsidian';

if (requireApiVersion('1.7.2')) {
  // 安全启用新能力
}
```

## 11. 推荐工作流（高频）

- 查看官方文档理解功能语义
- 看 sample plugin 类似页面实现
- 查 `obsidian.d.ts` 确认签名和类型

这样可避免“看文档不会写/写错参数类型”。
