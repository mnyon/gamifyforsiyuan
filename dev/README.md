# 开发预览

此目录不进入正式插件依赖图。

- `TestPlugin.ts`、`TestGamifyView.ts`：模拟插件与测试控件；由 `npm run build:test` 构建。
- `preview.ts`：浏览器验证所需的显式导出。
- `caretPlayground.ts`：光标及奖励视觉实验。
- `legacyTerrain.ts`、`LegacyTerrainModel.ts`：保留的 Canvas 地形实验，使用虚构数据，不接入思源。当前 Three.js 地图实现见 `src/features/territory/`。
- `templates/`：离线预览的 HTML/CSS 模板。

在项目根目录执行 `npm run preview:build`，生成 `dist/previews/caret-playground.html` 与 `dist/previews/page-terrain.html`；生成后可直接用浏览器离线打开。执行 `npm run verify:previews` 检查交互。
