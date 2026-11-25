# 开发预览

此目录不进入正式插件依赖图。

- [NoteWorld](note-world/README.md) 包含思源数据采集、世界生成、Three.js 渲染与素材画廊。早期 Canvas 和方块实验都在 `note-world/legacy/`。
- `caret-playground/` 包含光标和奖励效果实验及其离线预览模板。
- `plugin-simulation/` 包含测试插件、模拟控件和浏览器验证的共享入口。测试插件通过 `npm run build:test` 构建。

在项目根目录执行 `npm run preview:build`，生成 `dist/previews/caret-playground.html` 与 `dist/previews/page-terrain.html`；生成后可直接用浏览器离线打开。执行 `npm run verify:previews` 检查交互。
