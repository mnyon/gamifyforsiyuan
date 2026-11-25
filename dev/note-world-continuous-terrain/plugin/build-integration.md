# 构建与样式集成摘录

来源：2026-11-21 工作区版本。以下内容随「笔记领地」功能一起从插件中移除，原样保留以便恢复。

## tools/build.ts:67-105

```ts
const terrainFiles = [
  'index.html',
  'style.css',
  'app.js',
  'world.js',
  'cache.js',
  'source.js',
  'vendor/three.module.js',
  'vendor/OrbitControls.js',
  'vendor/THREE-LICENSE.txt',
];
for (const file of terrainFiles) {
  const destination = path.join(out, 'terrain', file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (!['app.js', 'world.js', 'cache.js', 'source.js'].includes(file))
    fs.copyFileSync(
      file.startsWith('vendor/')
        ? path.join(root, 'third_party/three', file.slice(7))
        : path.join(root, 'src/features/territory/presentation', file),
      destination,
    );
}
// Compile the typed terrain model and collector while keeping browser-relative entry names.
await build({
  entryPoints: Object.fromEntries(
    Object.entries({
      app: 'presentation/main.ts',
      world: 'domain/WorldModel.ts',
      cache: 'cache.ts',
      source: 'adapters/SiYuanMetadataSource.ts',
    }).map(([name, file]) => [name, path.join(root, 'src/features/territory', file)]),
  ),
  external: ['three', 'three/addons/controls/OrbitControls.js'],
  outdir: path.join(out, 'terrain'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});
```

`tools/build.ts:123` 还把地形产物加入打包清单：

```ts
files.push(...terrainFiles.map((file) => 'terrain/' + file));
```

## src/presentation/styles.css:198

```css
.companion-auxiliary{position:absolute;top:12px;left:12px;z-index:4;margin:0;padding:0;display:flex}.terrain-entry{display:inline-flex;align-items:center;gap:7px;border:0;background:#201e2ccc;color:var(--muted);font-size:10px;padding:4px 7px;font-weight:400;border-radius:5px}.terrain-entry:hover{color:var(--purple);background:#302c40}.terrain-entry span{font-size:11px;opacity:.7}
```

## package.json

```json
"preview:terrain": "node --import tsx tools/terrain-server.ts",
"verify:territory": "node --import tsx tools/verify-territory.ts",
```

`test` 脚本曾包含 `"tests/territory/*.test.ts"`：

```json
"test": "node --import tsx --test \"tests/*.test.ts\" \"tests/territory/*.test.ts\""
```

## tsconfig.tools.json

`dev/**/*.ts` 在 include 内；归档目录本身不应被类型检查。

## 测试与验证工具中的引用

- `tests/support.ts:1` 导入 `../src/features/territory/application/ports.js`；34-62 行为地形测试提供 `MetadataRequest`、`metadataApi`、`jsonResponse`、`MemoryAtlas`。
- `tests/territory/*.test.ts` 导入 `../../src/features/territory/...`。
- `tools/browser-fixtures.d.ts:11-12` 导入 `TerritoryPage` 与 `snapshotOf`；34-50 行声明 `window.terrainAtlas`。
- `tools/verify-adventure.ts:175,195,245` 断言 `.terrain-entry` 的可见性（false / false / true）。
