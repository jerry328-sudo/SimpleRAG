# Obsidian 插件开发文档整理

整理时间：2026-03-31

本目录整理了 Obsidian 插件开发的完整链路资料：从官方入口到示例仓库，再到 API 类型定义与社区发布。目标是把官方文档转成可直接在 Obsidian 本地阅读的 Markdown 笔记，并尽量补足离线阅读时最容易缺失的上下文。

## 阅读顺序

1. [[01-插件开发总览]]
2. [[02-从零开始构建插件]]
3. [[03-插件工程结构与示例仓库拆解]]
4. [[04-常用 API 与界面构建]]
5. [[05-兼容性、性能与开发规范]]
6. [[06-发布与提交社区插件]]
7. [[07-API 仓库与查接口方法]]
8. [[08-Manifest、versions 与开发工作流]]
9. [[09-最小可复制脚手架]]
10. [[10-离线构建可行性与完备性检查]]
11. [[11-SimpleRAG-RAG-详细设计与实施计划]]
12. [[12-SimpleRAG-项目规范与边界]]

## 来源链接

- 官方开发文档首页： https://docs.obsidian.md/Home
- 官方从零教程： https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- 官方示例插件： https://github.com/obsidianmd/obsidian-sample-plugin
- 官方 API 类型仓库： https://github.com/obsidianmd/obsidian-api

## 当前整理覆盖了什么

- 从零搭环境、编译、加载、热重载与重启时机
- `manifest.json`、`versions.json`、`main.js` 的角色与约束
- 官方 sample plugin 的文件结构、构建脚本和版本脚本
- 常用插件 API：命令、设置页、Ribbon、Modal、View、Editor、Vault、事件
- 移动端兼容、性能、`DeferredView`、安全与提交前规范
- GitHub Release、社区插件提交流程、审核常见问题
- API 类型仓库的查法，以及离线时如何配合本地文档使用
- 一个可直接照着敲出来的最小脚手架
- 对“这些文档是否足够离线从零构建插件”的结论与前提说明

## 你可以这样用

- 新手入门：`01` + `02`
- 补足工程细节：`03` + `08` + `09`
- 上架前准备：`05` + `06` + `10`
- 查接口细节：`07`
- 写功能时查参考：`04`
- 看 SimpleRAG 实施方案：`11`
- 看 SimpleRAG 约束边界：`12`

## 结论先看

- 如果你已经装好了 Obsidian、Node.js、Git，并且已经拿到模板或能自行写出脚手架，那么这套文档足够你在离线状态下完成一个基础插件的本地开发。
- 如果你是从一台完全空白、且彻底断网的机器开始，这套文档仍然不够，因为 `npm install`、获取 sample plugin、更新 `obsidian` 依赖、发布 GitHub Release 和提交社区插件都天然需要联网。
