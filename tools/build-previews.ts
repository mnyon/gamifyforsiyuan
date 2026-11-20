import fs from 'node:fs';
import { build } from 'esbuild';
fs.mkdirSync('dist/previews', { recursive: true });
for (const [source, name] of [
  ['dev/caretPlayground.ts', 'caret-playground'],
  ['dev/legacyTerrain.ts', 'page-terrain'],
]) {
  const result = await build({
    entryPoints: [source],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    loader: { '.css': 'text' },
  });
  const runtime = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const template = fs.readFileSync('dev/templates/' + name + '.template.html', 'utf8');
  fs.writeFileSync(
    'dist/previews/' + name + '.html',
    template.replace('/* PREVIEW_RUNTIME */', () => runtime),
  );
  console.log('Built dist/previews/' + name + '.html');
}
