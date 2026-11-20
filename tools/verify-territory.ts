// Optional browser verification. Requires both builds, Playwright and Chrome. Uses isolated fictional data.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const port = Number(process.env.GAMIFY_TERRAIN_VERIFY_PORT || 4188),
  origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['--import', 'tsx', 'tools/terrain-server.ts'], {
  cwd: root,
  env: { ...process.env, TERRAIN_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  let started = false,
    serverOutput = '',
    lastFailure = '';
  server.stdout.on('data', (chunk) => (serverOutput += chunk));
  server.stderr.on('data', (chunk) => (serverOutput += chunk));
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(origin);
      if (r.ok) {
        started = true;
        break;
      }
      lastFailure = r.status + ':' + (await r.text());
    } catch (error) {
      lastFailure =
        error instanceof Error ? error.message + ':' + String(error.cause || '') : String(error);
    }
    await delay(100);
  }
  if (!started) {
    server.kill();
    throw Error('Map verification server did not start: ' + serverOutput + lastFailure);
  }

  const require = createRequire(
    process.env.GAMIFY_RENDER_NODE_MODULES
      ? path.join(process.env.GAMIFY_RENDER_NODE_MODULES, '_terrain.cjs')
      : import.meta.url,
  );
  const { chromium } = require('playwright-core') as typeof import('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 940 } }),
    errors: string[] = [],
    reads: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/\/api\/(books|pages|sizes|edges)$/.test(r.url())) reads.push(r.url());
  });
  await page.goto(origin + '/');
  await page.waitForFunction(() => window.terrainAtlas?.diagnostics.pages === 450);
  assert.equal(await page.evaluate(() => terrainAtlas.diagnostics.dirty), 0);
  await page.locator('#search').fill('知识的连接');
  assert.ok((await page.locator('#pages option').count()) > 0);
  const target = await page.locator('#pages option').first().getAttribute('value');
  await page.selectOption('#pages', target);
  await page.waitForFunction(() =>
    document.querySelector<HTMLElement>('#title')!.textContent.includes('知识的连接'),
  );
  await page.locator('#roads').uncheck();
  await page.waitForFunction(() =>
    document.querySelector<HTMLElement>('#route-info')!.textContent.includes('已隐藏'),
  );
  await page.locator('#roads').check();
  await page.waitForFunction(() =>
    document.querySelector<HTMLElement>('#route-info')!.textContent.includes('金色'),
  );
  assert.ok(target);
  const before = await page.evaluate((id) => {
    const p = terrainAtlas.model.pages.get(id)!;
    return { x: p.x, z: p.z, chars: p.chars || 0 };
  }, target);
  await page.locator('#demo-edit').click();
  await page.waitForFunction(
    () => terrainAtlas.diagnostics.dirty === 0 && terrainAtlas.diagnostics.moving === 0,
  );
  assert.deepEqual(
    await page.evaluate((id) => {
      const p = terrainAtlas.model.pages.get(id)!;
      return { x: p.x, z: p.z, chars: p.chars };
    }, target),
    { ...before, chars: before.chars + 5000 },
  );
  await page.locator('#overview').click();
  await page.locator('#search').fill('');
  await page.evaluate(async () => {
    const s = terrainAtlas.exportCache();
    await terrainAtlas.cache.write('snapshot', s);
  });
  await page.reload();
  await page.waitForFunction(() => terrainAtlas?.real && terrainAtlas.diagnostics.pages === 450);
  assert.equal(await page.evaluate(() => terrainAtlas.diagnostics.dirty), 0);
  const cacheResult = await page.evaluate(async () => {
    const cacheModule = './cache.js';
    const { AtlasCache } = (await import(
      cacheModule
    )) as typeof import('../src/features/territory/cache.js');
    const a = new AtlasCache('verify-a'),
      b = new AtlasCache('verify-b');
    const checkpoint: import('../src/features/territory/application/ports.js').Checkpoint = {
      version: 1,
      phase: 'pages',
      pages: [],
      books: [],
      edges: [],
      after: 'completed',
      sizeIndex: 0,
      edgeCursor: null,
      started: Date.now(),
    };
    await a.write('checkpoint', checkpoint);
    a.close();
    const resumed = new AtlasCache('verify-a');
    const saved = await resumed.read('checkpoint'),
      other = await b.read('checkpoint'),
      snapshot = await terrainAtlas.cache.read('snapshot');
    const result = {
      cursor: saved && typeof saved === 'object' && 'after' in saved ? saved.after : null,
      isolated: other === null,
      typed:
        !!snapshot &&
        typeof snapshot === 'object' &&
        'fields' in snapshot &&
        !!snapshot.fields &&
        typeof snapshot.fields === 'object' &&
        'heights' in snapshot.fields &&
        snapshot.fields.heights instanceof Float32Array,
    };
    await resumed.clear();
    await b.clear();
    resumed.close();
    b.close();
    return result;
  });
  assert.deepEqual(cacheResult, { cursor: 'completed', isolated: true, typed: true });
  const types: Record<string, string> = {
    '.js': 'text/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
  };
  for (const prefix of [
    '/plugins/gamify-for-siyuan/terrain/',
    '/plugins/gamify-for-siyuan-test/terrain/',
  ]) {
    const base = prefix.includes('-test/')
      ? 'dist/test/gamify-for-siyuan'
      : 'dist/gamify-for-siyuan';
    await page.route('**' + prefix + '**', async (route) => {
      const name = new URL(route.request().url()).pathname.slice(prefix.length);
      await route.fulfill({
        body: await readFile(path.join(base, 'terrain', name)),
        contentType: types[path.extname(name)] || 'text/plain',
      });
    });
    await page.route('**/api/notebook/lsNotebooks', (route) =>
      route.fulfill({ json: { code: 0, data: { notebooks: [] } } }),
    );
    await page.evaluate(async (prefix) => {
      const { AtlasCache } = await import(prefix + 'cache.js');
      const cache = new AtlasCache(prefix.split('/').slice(0, 3).join('/') + ':verification');
      await cache.write('snapshot', terrainAtlas.exportCache());
      cache.close();
    }, prefix);
    await page.goto(origin + prefix + 'index.html?workspace=verification');
    await page.waitForFunction(() => window.terrainAtlas?.diagnostics.pages === 450);
    await page.waitForFunction(() => document.getElementById('connection')!.hidden);
    await page.evaluate(async () => {
      await terrainAtlas.cache.write('snapshot', terrainAtlas.exportCache());
    });
    await page.reload();
    await page.waitForFunction(
      () => window.terrainAtlas?.real && terrainAtlas.diagnostics.pages === 450,
    );
    assert.equal(await page.evaluate(() => terrainAtlas.diagnostics.dirty), 0);
    await page.evaluate(async () => {
      await terrainAtlas.cache.clear();
    });
  }
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.locator('#scene canvas').count(), 0);
  assert.equal(await page.locator('#labels .map-label').count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(reads, []);
  console.log(
    JSON.stringify({
      preview: 'demo and cache reload passed',
      indexedDB: cacheResult,
      packages: 'production and test native paths restored',
      interactions: 'search, focus, roads, edit and overview passed',
      cleanup: 'canvas and labels released',
      catalogReads: reads.length,
      pageErrors: errors.length,
    }),
  );
} catch (e) {
  console.error(e);
  for (const page of (browser?.contexts() || []).flatMap((c) => c.pages()))
    console.error(
      await page.evaluate(() => ({
        url: location.href,
        status: document.getElementById('load-status')?.textContent,
        diag: window.terrainAtlas?.diagnostics,
        error: document.getElementById('webgl-error')?.textContent,
      })),
    );
  throw e;
} finally {
  await browser?.close();
  server.kill();
  await new Promise<void>((resolve) =>
    server.exitCode !== null ? resolve() : server.once('exit', resolve),
  );
}
