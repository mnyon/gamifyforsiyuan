import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type {} from '../dev/note-world/legacy/canvas/legacyTerrain.js';

const require = createRequire(
  process.env.GAMIFY_RENDER_NODE_MODULES
    ? path.join(process.env.GAMIFY_RENDER_NODE_MODULES, '_preview.cjs')
    : import.meta.url,
);
const { chromium } = require('playwright-core') as typeof import('playwright-core');
const browser = await chromium.launch({
  channel: process.env.GAMIFY_BROWSER_CHANNEL || 'chrome',
  headless: true,
});
try {
  for (const name of ['caret-playground', 'page-terrain']) {
    const page = await browser.newPage();
    const errors: string[] = [];
    let requests = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    const html = await readFile(
      new URL('../dist/previews/' + name + '.html', import.meta.url),
      'utf8',
    );
    await page.route('**/*', (route) => {
      if (route.request().isNavigationRequest())
        return route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
      requests++;
      return route.abort();
    });
    await page.goto('http://localhost:9876/' + name);
    if (name === 'caret-playground') {
      await page.locator('#all-effects').click();
      await page.locator('#progress').fill('95');
      await page.locator('#progress').dispatchEvent('input');
      assert.equal(await page.locator('#percent').textContent(), '95%');
      await page.locator('#reward').click();
      await page.locator('#maintenance').click();
      await page.locator('#theme').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      await page.locator('#demo').click();
      await page.locator('#demo').click();
    } else {
      assert.equal(await page.locator('#page-select option').count(), 95);
      await page.locator('#add').click();
      assert.equal(await page.locator('#page-select option').count(), 96);
      await page.locator('#edit').click();
      await page.locator('#advance').click();
      await page.locator('#delete').click();
      assert.equal(await page.locator('#page-select option').count(), 95);
      await page.locator('#plus').click();
      await page.locator('#home').click();
      await page.locator('#show-links').uncheck();
    }
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.deepEqual(errors, [], name);
    assert.equal(requests, 0, name + ' must work offline');
    await page.close();
    console.log(name + ': offline interactions passed');
  }
} finally {
  await browser.close();
}
