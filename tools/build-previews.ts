import fs from 'node:fs';
import { build } from 'esbuild';
import { buildNoteWorld } from './build-note-world.js';
fs.mkdirSync('dist/previews', { recursive: true });
for (const [directory, source, name] of [
  ['dev/caret-playground', 'caretPlayground.ts', 'caret-playground'],
  ['dev/note-world/legacy/canvas', 'legacyTerrain.ts', 'page-terrain'],
]) {
  const result = await build({
    entryPoints: [`${directory}/${source}`],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    loader: { '.css': 'text' },
  });
  const runtime = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const template = fs.readFileSync(`${directory}/${name}.template.html`, 'utf8');
  fs.writeFileSync(
    'dist/previews/' + name + '.html',
    template.replace('/* PREVIEW_RUNTIME */', () => runtime),
  );
  console.log('Built dist/previews/' + name + '.html');
}
await buildNoteWorld();
