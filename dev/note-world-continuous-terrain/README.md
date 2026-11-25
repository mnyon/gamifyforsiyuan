# note-world-continuous-terrain

从思源插件 **gamify-for-siyuan** 中移除的「笔记领地」连续地形功能归档。

- 归档日期：2026-11-25
- 来源：`G:\development\Habitica` 工作区，含 2026-11-21 未提交的“常驻隐藏 iframe 后台采集”改动
- 状态：**仅存档**，不参与插件构建、类型检查与测试，不保证可运行

## 为什么在这里

插件不再提供「笔记领地」入口，也不再打包地图页面。原实现整体搬到本目录，保留原有相对路径，便于日后取回或独立演进。

## 目录结构

```
dev/note-world-continuous-terrain/
├── src/features/territory/          # 原样复制：domain / application / adapters / presentation
├── third_party/three/               # Three.js 0.160.1、OrbitControls、MIT 许可证
├── tools/
│   ├── terrain-server.ts            # 只读预览服务（默认 4177）
│   └── verify-territory.ts          # Playwright 验证脚本
├── tests/
│   ├── territory/                   # world / session / cache / lifecycle / source / server
│   └── support.ts                   # 整份副本（含其它测试共用的 stubFetch 等）
├── docs/territory.md                # 原设计文档
├── plugin/                          # 从插件中摘出的集成代码
│   ├── territory-dialog.ts          # Dialog 宿主 + 常驻 iframe 采集（main.ts 245-393 等）
│   ├── terrain-entry.ts             # 「笔记领地 ↗」按钮（GamifyView.ts 125-144）
│   └── build-integration.md         # build.ts / styles.css / package.json / 验证工具摘录
└── README.md
```

## 与原仓库的差异

- `src/features/territory/**`、`third_party/three/**`、`tests/**`、`docs/territory.md` 均为原样复制，文件内相对导入未改写。
- `tools/terrain-server.ts` 以本目录为 `ROOT`，入口仍指向 `src/features/territory` 与 `third_party/three`，因此在本目录安装依赖后仍可独立预览。
- `tools/verify-territory.ts` 仍假设 `dist/gamify-for-siyuan/terrain/` 存在；归档不含构建产物，需先自行构建。
- `plugin/territory-dialog.ts` 把原 `GamifyPlugin` 的三个成员（`name`、`disposed`、`view.close()`）改为构造注入，方法体逐字保留；文件头注明了来源行号。
- `plugin/terrain-entry.ts` 由构造函数内联代码抽成函数，DOM 结构与事件行为不变。

## 不包含什么

插件其它功能一律未复制：Habitica 连接、进度同步、商店、伙伴、设置、活动等。

## 恢复方法

1. 把 `src/features/territory/` 放回仓库同名路径，`third_party/three/` 放回仓库根。
2. 参照 `plugin/territory-dialog.ts` 把四个方法与本段清理接回 `src/plugin/main.ts`，并恢复 `Dialog` 导入、字段声明、`onload` 的 `startTerrainCollector()` 与 `onOpenTerrain` 绑定。
3. 参照 `plugin/terrain-entry.ts` 恢复 `GamifyView` 按钮，并恢复 `ViewOptions.onOpenTerrain`。
4. 参照 `plugin/build-integration.md` 恢复 `build.ts` 的 `terrainFiles` 块、样式、`package.json` 脚本与测试。
