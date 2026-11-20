import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const testBuild = process.argv.includes('--test-mode');
const out = path.join(root, 'dist', ...(testBuild ? ['test'] : []), 'gamify-for-siyuan');
if (!path.resolve(out).startsWith(path.resolve(root, 'dist') + path.sep))
  throw Error('Invalid output directory');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const { build } = await import('esbuild');
await build({
  entryPoints: [path.join(root, testBuild ? 'dev/TestPlugin.ts' : 'src/plugin/main.ts')],
  outfile: path.join(out, 'index.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  footer: { js: 'module.exports = module.exports.default;' },
  target: 'es2022',
  external: ['siyuan'],
  loader: { '.css': 'text' },
  define: { TEST_BUILD: String(testBuild) },
});
await build({
  entryPoints: [path.join(root, 'dev/preview.ts')],
  outfile: path.join(root, 'dist/dev/preview.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'GamifyPreview',
  target: 'es2022',
  loader: { '.css': 'text' },
});
for (const file of [
  'plugin.json',
  'README.md',
  'README.zh-CN.md',
  'docs/Document.md',
  'icon.svg',
  'icon.png',
  'preview.png',
  'THIRD-PARTY-NOTICES.md',
  'LICENSE',
  'LICENSE-HABITICA.txt',
]) {
  fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
if (testBuild) {
  const manifest = JSON.parse(read('plugin.json'));
  manifest.displayName = {
    default: 'Gamify for SiYuan · Test',
    'zh-CN': 'Gamify for SiYuan · 测试版',
  };
  fs.writeFileSync(path.join(out, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
}
fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
fs.cpSync(path.join(root, 'images'), path.join(out, 'images'), { recursive: true });
fs.writeFileSync(
  path.join(out, 'index.css'),
  '/* Component styles are isolated in Shadow DOM. */\n',
);
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
// Store entries without compression; no additional ZIP dependency is required.
const files = [
  'index.js',
  'index.css',
  'plugin.json',
  'README.md',
  'README.zh-CN.md',
  'docs/Document.md',
  'icon.svg',
  'icon.png',
  'preview.png',
  'THIRD-PARTY-NOTICES.md',
  'LICENSE',
  'LICENSE-HABITICA.txt',
  ...fs.readdirSync(path.join(out, 'images')).map((name) => 'images/' + name),
  ...fs.readdirSync(path.join(out, 'assets')).map((name) => 'assets/' + name),
];
files.push(...terrainFiles.map((file) => 'terrain/' + file));
let offset = 0;
const chunks = [],
  central = [];
for (const name of files) {
  const data = fs.readFileSync(path.join(out, name)),
    filename = Buffer.from(name);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x800, 8);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(filename.length, 28);
  header.writeUInt32LE(offset, 42);
  chunks.push(local, filename, data);
  central.push(header, filename);
  offset += local.length + filename.length + data.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
if (!process.argv.includes('--skip-package')) {
  const packageSuffix = process.argv
    .find((arg) => arg.startsWith('--package-suffix='))
    ?.split('=')[1];
  if (packageSuffix && !/^[a-z0-9-]+$/.test(packageSuffix))
    throw new Error('Invalid package suffix');
  const suffix = packageSuffix
    ? `-${packageSuffix}`
    : process.argv.includes('--caret-preview')
      ? '-caret'
      : '';
  fs.writeFileSync(
    path.join(root, 'dist', `package${testBuild ? '-test' : ''}${suffix}.zip`),
    Buffer.concat([...chunks, directory, end]),
  );
}
console.log(`Built ${out}`);
