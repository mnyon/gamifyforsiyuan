// Browser verification for the map-only territory panel.
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const port = Number(process.env.GAMIFY_TERRAIN_VERIFY_PORT || 4188);
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['--import', 'tsx', 'tools/terrain-server.ts'], {
  cwd: root,
  env: { ...process.env, TERRAIN_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let browser;
try {
  let started = false;
  let serverOutput = '';
  let lastFailure = '';
  server.stdout.on('data', (chunk) => (serverOutput += chunk));
  server.stderr.on('data', (chunk) => (serverOutput += chunk));
  for (let i = 0; i < 150; i++) {
    try {
      const response = await fetch(origin);
      if (response.ok) {
        started = true;
        break;
      }
      lastFailure = response.status + ':' + (await response.text());
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await delay(100);
  }
  if (!started) throw Error('Map verification server did not start: ' + serverOutput + lastFailure);

  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright-core') as typeof import('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 940 } });
  const errors: string[] = [];
  const collectionReads: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/\/api\/(books|pages|sizes|edges)$/.test(request.url()))
      collectionReads.push(request.url());
  });

  const sourceHtml = await readFile('src/features/territory/presentation/index.html', 'utf8');
  const builtHtml = await readFile('dist/gamify-for-siyuan/terrain/index.html', 'utf8');
  for (const html of [sourceHtml, builtHtml]) {
    assert.doesNotMatch(html, /<header\b|<aside\b|class=["'][^"']*panel/);
    assert.match(html, /id=["']scene["']/);
    assert.match(html, /id=["']load-status["']/);
  }

  await page.goto(origin + '/');
  await page.waitForSelector('#scene canvas');
  await page.waitForFunction(() => Boolean(window.terrainAtlas?.diagnostics));
  const firstUse = await page.evaluate(() => ({
    real: terrainAtlas.real,
    status: document.querySelector<HTMLElement>('#load-status')?.textContent || '',
    hasHeader: Boolean(document.querySelector('header')),
    hasAside: Boolean(document.querySelector('aside')),
    canvasCount: document.querySelectorAll('#scene canvas').length,
    progressVisible: !document.querySelector<HTMLElement>('.collection-progress')?.hidden,
    progressValue: document.querySelector<HTMLProgressElement>('#collection-progress')?.value || 0,
    testTools: Object.keys(terrainAtlas.test).sort(),
  }));
  assert.equal(firstUse.real, false);
  assert.match(firstUse.status, /建立笔记地图|稍后再来/);
  assert.equal(firstUse.hasHeader, false);
  assert.equal(firstUse.hasAside, false);
  assert.equal(firstUse.canvasCount, 1);
  assert.equal(firstUse.progressVisible, true);
  assert.ok(firstUse.progressValue > 0);
  assert.deepEqual(firstUse.testTools, ['batch', 'pause', 'reset', 'resume', 'status']);
  assert.deepEqual(collectionReads, []);
  await mkdir('.local/verification', { recursive: true });
  await page.screenshot({ path: '.local/verification/territory-loading.png' });

  await page.locator('#overview').click();
  await page.evaluate(async () => {
    await terrainAtlas.cache.write('snapshot', terrainAtlas.exportCache());
  });
  await page.reload();
  await page.waitForSelector('#scene canvas');
  await page.waitForFunction(() => window.terrainAtlas?.real === true);
  const cached = await page.evaluate(() => ({
    real: terrainAtlas.real,
    canvasCount: document.querySelectorAll('#scene canvas').length,
  }));
  assert.deepEqual(cached, { real: true, canvasCount: 1 });

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(() => document.querySelectorAll('#scene canvas').length === 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      firstUse: 'waiting state rendered without collection reads',
      cached: 'complete snapshot restored immediately',
      chrome: 'map-only shell has no header or sidebar',
      cleanup: 'canvas released on pagehide',
      collectionReads: collectionReads.length,
      pageErrors: errors.length,
    }),
  );
} catch (error) {
  console.error(error);
  for (const page of (browser?.contexts() || []).flatMap((context) => context.pages()))
    console.error(
      await page.evaluate(() => ({
        url: location.href,
        status: document.getElementById('load-status')?.textContent,
        diagnostics: window.terrainAtlas?.diagnostics,
        error: document.getElementById('webgl-error')?.textContent,
      })),
    );
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await new Promise<void>((resolve) =>
    server.exitCode !== null ? resolve() : server.once('exit', resolve),
  );
}
