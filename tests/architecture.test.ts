import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

test('production plugin uses TypeScript sources and cannot import simulation entries', async () => {
  const result = await build({
    entryPoints: ['src/plugin/main.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'cjs',
    external: ['siyuan'],
    loader: { '.css': 'text' },
    define: { TEST_BUILD: 'false' },
    metafile: true,
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const file = input.replaceAll('\\', '/');
    assert.ok(file.endsWith('.ts') || file.endsWith('.css'), file);
    assert.ok(file.startsWith('src/'), file);
  }
  const source = result.outputFiles[0].text;
  assert.doesNotMatch(source, /模拟完成 TODO|预览金币特效|testAction\(/);
  for (const legacy of [
    'shell.cjs',
    'ui.js',
    'adventure.js',
    'editing.js',
    'reader.js',
    'icon.js',
    'engine.js',
    'activity.js',
    'storage.js',
  ])
    assert.equal(fs.existsSync(legacy), false, legacy);
});

// Validate the resolved runtime graph; the source check below also covers type-only imports.
test('migrated use cases depend only on their application contracts and domain', async () => {
  const result = await build({
    entryPoints: [
      'src/features/progress/application/settleRewards.ts',
      'src/features/progress/application/reconcileRewards.ts',
      'src/features/progress/application/persistence.ts',
      'src/features/connection/application/manageConnection.ts',
      'src/features/companion/application/executeAction.ts',
      'src/features/companion/application/acknowledgeAction.ts',
      'src/features/companion/application/projections.ts',
      'src/features/territory/application/GentleSync.ts',
      'src/features/territory/application/snapshot.ts',
      'src/features/territory/application/updateWorld.ts',
      'src/features/territory/application/CollectionSession.ts',
    ],
    bundle: true,
    write: false,
    outdir: 'unused',
    platform: 'neutral',
    metafile: true,
  });
  for (const input of Object.keys(result.metafile.inputs))
    assert.match(
      input.replaceAll('\\', '/'),
      /^src\/features\/(progress|connection|companion|territory)\/(application|domain)\//,
      input,
    );
});

test('migrated domain and application cannot reach browser or network globals', () => {
  for (const feature of ['progress', 'connection', 'companion', 'territory'])
    for (const layer of ['domain', 'application']) {
      const directory = 'src/features/' + feature + '/' + layer;
      for (const file of fs.readdirSync(directory)) {
        if (!file.endsWith('.ts')) continue;
        const source = fs.readFileSync(path.join(directory, file), 'utf8');
        assert.doesNotMatch(
          source,
          /\b(?:window|document|fetch|localStorage|indexedDB|XMLHttpRequest)\b/,
          file,
        );
        const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
        for (const dependency of imports)
          assert.ok(
            dependency.startsWith('./') ||
              (layer === 'application' && dependency.startsWith('../domain/')),
            file + ': ' + dependency,
          );
      }
    }
});
test('territory runtime is built entirely from TypeScript sources without legacy JS entries', async () => {
  const result = await build({
    entryPoints: [
      'src/features/territory/presentation/main.ts',
      'src/features/territory/cache.ts',
      'src/features/territory/domain/WorldModel.ts',
      'src/features/territory/adapters/SiYuanMetadataSource.ts',
    ],
    bundle: true,
    write: false,
    outdir: 'unused',
    platform: 'browser',
    external: ['three', 'three/addons/controls/OrbitControls.js'],
    metafile: true,
  });
  for (const input of Object.keys(result.metafile.inputs))
    assert.match(input.replaceAll('\\', '/'), /^src\/features\/territory\/.*\.ts$/, input);
  for (const entry of ['app.js', 'world.js', 'cache.js', 'source.js'])
    assert.equal(
      fs.existsSync(path.join('src/features/territory/presentation', entry)),
      false,
      entry + ' must be compiled, not maintained as a second source',
    );
});

test('Habitica client and companion projections contain no legacy JS dependency', async () => {
  const result = await build({
    entryPoints: [
      'src/adapters/habitica/HabiticaClient.ts',
      'src/features/companion/application/projections.ts',
    ],
    bundle: true,
    write: false,
    outdir: 'unused',
    platform: 'browser',
    metafile: true,
  });
  for (const input of Object.keys(result.metafile.inputs))
    assert.match(input.replaceAll('\\', '/'), /^src\/.*\.ts$/, input);
  for (const legacy of ['habitica.js', 'companion-model.js'])
    assert.equal(fs.existsSync(legacy), false, legacy);
});
