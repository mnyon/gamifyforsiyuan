# 开发预览

此目录不进入正式插件依赖图。

- [NoteWorld](note-world/README.md) 包含思源数据采集、世界生成、Three.js 渲染与素材画廊。早期 Canvas 和方块实验都在 `note-world/legacy/`。
- `caret-playground/` 包含光标和奖励效果实验及其离线预览模板。
- `avatar-idle/` 包含角色待机呼吸动画的候选方案预览：复用插件场景与图层渲染，动画代码仅存在于预览，不进入插件。
- `equip-studio/` 包含装备穿戴交互的离线原型：虚构账户 + 模拟网关，演练穿戴/卸下、Avatar 即时重绘与"结果不确定→暂停→人工核对"安全语义，不请求真实 Habitica API。
- `plugin-simulation/` 包含测试插件、模拟控件和浏览器验证的共享入口。测试插件通过 `npm run build:test` 构建。

在项目根目录执行 `npm run preview:build`，生成 `dist/previews/caret-playground.html`、`dist/previews/page-terrain.html`、`dist/previews/avatar-idle.html` 与 `dist/previews/equip-studio.html`；生成后可直接用浏览器离线打开（角色素材需联网）。执行 `npm run verify:previews` 检查交互。
