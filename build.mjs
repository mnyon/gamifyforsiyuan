import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, "dist", "gamify-for-siyuan");
fs.mkdirSync(out, { recursive: true });
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = text => text.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const bundle = 'const PLUGIN_CSS = ' + JSON.stringify(read('index.css')) + ';\n' +
  ['engine.js', 'habitica.js', 'ui.js'].map(file => plain(read(file))).join('\n') + '\n' + read('shell.cjs');
fs.writeFileSync(path.join(out, 'index.js'), bundle);
for (const file of ["plugin.json", "README.md", "README.zh-CN.md", "icon.svg", "icon.png", "THIRD-PARTY-NOTICES.md", "LICENSE"]) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
fs.writeFileSync(path.join(out, 'index.css'), '/* Component styles are isolated in Shadow DOM. */\n');
// Store entries without compression; no build dependencies are required.
const files = ['index.js', 'index.css', 'plugin.json', 'README.md', 'README.zh-CN.md', 'icon.svg', 'icon.png', 'THIRD-PARTY-NOTICES.md', 'LICENSE'];
let offset = 0; const chunks = [], central = [];
for (const name of files) {
  const data = fs.readFileSync(path.join(out, name)), filename = Buffer.from(name); let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
  const header = Buffer.alloc(46); header.writeUInt32LE(0x02014b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x800, 8); header.writeUInt32LE(crc, 16); header.writeUInt32LE(data.length, 20); header.writeUInt32LE(data.length, 24); header.writeUInt16LE(filename.length, 28); header.writeUInt32LE(offset, 42);
  chunks.push(local, filename, data); central.push(header, filename); offset += local.length + filename.length + data.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(path.join(root, 'dist', 'package.zip'), Buffer.concat([...chunks, directory, end]));
console.log(`Built ${out}`);
