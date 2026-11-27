// Optional UI verification and release artwork. Requires Playwright + Chrome.
// No account API is contacted. Only public sprite images may be downloaded.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  adventureContent,
  adventureUser,
  adventureShops,
} from '../tests/fixtures/adventure-fixture.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(
  process.env.GAMIFY_RENDER_NODE_MODULES
    ? path.join(process.env.GAMIFY_RENDER_NODE_MODULES, '_adventure.cjs')
    : import.meta.url,
);
const { chromium } = require('playwright-core') as typeof import('playwright-core');
const capture = process.argv.includes('--screenshots');
const cache = path.resolve(process.env.GAMIFY_ART_CACHE || path.join(root, '.local', 'art-cache'));
fs.mkdirSync(cache, { recursive: true });
const code = fs.readFileSync(path.join(root, 'dist/dev/preview.js'), 'utf8');
const browser = await chromium.launch({
  channel: process.env.GAMIFY_BROWSER_CHANNEL || 'chrome',
  headless: true,
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 1050 },
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let apiCalls = 0;
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'habitica.com') {
        apiCalls++;
        return route.abort();
      }
      if (url.hostname === 'habitica-assets.s3.amazonaws.com') {
        const name = path.basename(url.pathname);
        const dest = path.join(cache, name);
        if (fs.existsSync(dest))
          return route.fulfill({ body: fs.readFileSync(dest), contentType: 'image/png' });
        const response = await route.fetch();
        if (response.ok()) {
          const body = await response.body();
          fs.writeFileSync(dest, body);
          return route.fulfill({ body, contentType: 'image/png' });
        }
        return route.abort();
      }
      if (url.pathname.startsWith('/plugins/gamify-for-siyuan/assets/'))
        return route.fulfill({
          body: fs.readFileSync(path.join(root, 'assets', path.basename(url.pathname))),
          contentType: 'image/png',
        });
      if (route.request().isNavigationRequest())
        return route.fulfill({
          body: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body></body></html>',
          contentType: 'text/html; charset=utf-8',
        });
      return route.abort();
    });
    await page.addInitScript('globalThis.__name = value => value;');
    await page.goto('http://localhost:9876/');
    await page.evaluate(
      ({ code, mobile, content, user, shops }) => {
        document.body.style.cssText =
          'margin:0;background:#15131f;color:#eeeaf7;font:14px/1.7 "Segoe UI","Microsoft YaHei",sans-serif';
        document.body.innerHTML =
          '<aside style="position:absolute;left:65px;top:140px;width:520px"><small style="letter-spacing:3px;color:#b4e7ce">GAMIFY FOR SIYUAN</small><h1 style="font-size:39px;line-height:1.45" id="showcase-title">与你的冒险同行</h1><p style="color:#a69bb8;font-size:17px" id="showcase-subtitle">角色、伙伴与技能，就在笔记旁。</p><div style="margin-top:45px;border:1px solid #ffffff12;border-radius:14px;padding:25px;background:#211d2b;color:#b9adc8">☑ 整理今天的阅读笔记<br>☑ 留下一段新的想法<br>□ 为明天做一点准备</div></aside><div style="position:absolute;left:65px;bottom:24px;font-size:11px;color:#82768f">界面示例 · 虚构账户数据</div>';
        if (mobile) document.querySelector<HTMLElement>('aside')!.hidden = true;
        const lib = new Function('require', 'module', code + ';return GamifyPreview;')(
          () => ({ Plugin: class {} }),
          { exports: {} },
        ) as typeof import('../dev/plugin-simulation/preview.js');
        const state = lib.newProgress();
        state.total = 14;
        let actions = 0;
        const view = new lib.GamifyView({
          css: lib.PLUGIN_CSS,
          onConnect: async () => {},
          onSound: () => {},
          onAdventureLoad: async () => {},
          onAdventureAction: async (kind, key) => {
            actions++;
            await new Promise<void>((r) => setTimeout(r, 80));
            if (kind === 'equip') {
              // Simulated toggle, mirroring the official endpoint semantics.
              const equipped = user.items.gear.equipped as Record<string, string>;
              const slot = key.split('_')[0];
              if (equipped[slot] === key) delete equipped[slot];
              else equipped[slot] = key;
              view.update({ state, user, adventure: { content, shops } });
              return;
            }
            return {
              armoire: {
                type: 'gear',
                dropKey: 'weapon_armoire_crystalCrescentStaff',
                dropText: content.gear.flat.weapon_armoire_crystalCrescentStaff.text,
              },
            };
          },
        });
        view.host.classList.toggle('mobile', mobile);
        view.host.dataset.theme = 'dark';
        view.update({
          state,
          user,
          adventure: { content, shops },
        });
        view.open();
        if (!mobile) view.card.style.cssText = 'right:65px;top:25px;bottom:auto;max-height:1000px';
        window.demo = { view, state, user, content, shops, actions: () => actions };
      },
      { code, mobile, content: adventureContent, user: adventureUser(), shops: adventureShops() },
    );
    const shadow = page.locator('#gamify-for-siyuan-view');
    const readyArt = async () => {
      await page.waitForFunction(() =>
        [...demo.view.root.querySelectorAll<HTMLImageElement>('img')]
          .filter((i) => i.getBoundingClientRect().width && i.getBoundingClientRect().height)
          .every((i) => i.complete && i.naturalWidth > 0),
      );
      await page.evaluate(() =>
        demo.view.root.querySelectorAll<HTMLElement>('.toast').forEach((n) => n.remove()),
      );
    };
    await page.waitForFunction(() =>
      [...demo.view.root.querySelectorAll<HTMLImageElement>('.avatar img')].every(
        (i) => i.complete,
      ),
    );
    assert.equal(await shadow.locator('.skill:disabled').count(), 2);
    for (const klass of ['rogue', 'warrior', 'wizard', 'healer'] as const) {
      const skills = await page.evaluate((klass) => {
        demo.user.stats.class = klass;
        demo.view.update({
          state: demo.state,
          user: demo.user,
          adventure: { content: demo.content, shops: demo.shops },
        });
        return [...demo.view.root.querySelectorAll<HTMLButtonElement>('.skill')].map((b) => ({
          disabled: b.disabled,
          label: b.getAttribute('aria-label'),
        }));
      }, klass);
      assert.equal(skills.length, 4);
      assert.ok(skills.some((s) => !s.disabled));
      const targeted = Object.values(adventureContent.spells[klass]).filter(
        (s) => !['party', 'self'].includes(s.target),
      );
      for (const spell of targeted)
        assert.ok(skills.find((s) => s.label?.startsWith(spell.text + '，'))!.disabled);
    }
    await page.evaluate(() => {
      demo.user.stats.class = 'rogue';
      demo.view.update({
        state: demo.state,
        user: demo.user,
        adventure: { content: demo.content, shops: demo.shops },
      });
      (demo.view.root.activeElement as HTMLElement | null)?.blur();
    });
    if (capture && !mobile) {
      await readyArt();
      await page.screenshot({ path: path.join(root, 'images/05-adventure.png') });
    }
    await shadow.locator('.skill:not(:disabled)').first().click();
    await shadow.locator('.adventure-sheet .primary').click();
    await page.waitForFunction(() => demo.view.adventure.overlay.hidden);
    assert.equal(await page.evaluate(() => demo.actions()), 1);
    await shadow.locator('.bag-entry').click();
    assert.equal(await shadow.locator('.bag-slot[aria-label]').count(), 10);
    await shadow.getByRole('button', { name: '食物', exact: true }).click();
    assert.equal(await shadow.locator('.bag-slot[aria-label]').count(), 3);
    await shadow.locator('.bag-slot[aria-label]').last().click();
    assert.ok(await shadow.locator('.bag-detail h3').textContent());
    await shadow.getByRole('button', { name: '全部', exact: true }).click();
    // Equip loop: unequip a worn item, the avatar must follow, then wear it again.
    await shadow.getByRole('button', { name: '装备', exact: true }).click();
    const wornCount = await shadow.locator('.bag-slot[aria-label*="已装备"]').count();
    const layerCount = () =>
      page.evaluate(() => demo.view.root.querySelectorAll('.avatar img').length);
    const layersBefore = await layerCount();
    await shadow.locator('.bag-slot[aria-label*="已装备"]').first().click();
    await shadow.locator('.bag-detail .primary').click();
    await shadow.locator('.adventure-sheet .primary').click();
    await page.waitForFunction(() => demo.view.adventure.overlay.hidden);
    assert.equal(await shadow.locator('.bag-slot[aria-label*="已装备"]').count(), wornCount - 1);
    assert.equal(await layerCount(), layersBefore - 1);
    await shadow.locator('.bag-detail .primary').click();
    await shadow.locator('.adventure-sheet .primary').click();
    await page.waitForFunction(() => demo.view.adventure.overlay.hidden);
    assert.equal(await shadow.locator('.bag-slot[aria-label*="已装备"]').count(), wornCount);
    assert.equal(await layerCount(), layersBefore);
    assert.equal(await page.evaluate(() => demo.actions()), 3);
    await shadow.getByRole('button', { name: '全部', exact: true }).click();
    if (capture && !mobile) {
      await page.evaluate(() => {
        document.querySelector<HTMLElement>('#showcase-title')!.textContent =
          '把沿途的惊喜，收入行囊';
        document.querySelector<HTMLElement>('#showcase-subtitle')!.textContent =
          '分类浏览、物品详情与收藏，随时可见。';
        (demo.view.root.activeElement as HTMLElement | null)?.blur();
      });
      await readyArt();
      await page.screenshot({ path: path.join(root, 'images/06-backpack.png') });
    }
    await shadow.locator('.adventure-bag .back').click();
    await shadow.locator('.shop-entry').click();
    assert.equal(await shadow.locator('.product').count(), 5);
    await shadow.locator('.product').filter({ hasText: '治疗药水' }).click();
    await shadow.locator('[data-dismiss]').click();
    if (capture && !mobile) {
      await page.evaluate(() => {
        document.querySelector<HTMLElement>('#showcase-title')!.textContent =
          '下一件奖励，值得期待';
        document.querySelector<HTMLElement>('#showcase-subtitle')!.textContent =
          '官方商品、旅途补给与魔法宝箱。';
        (demo.view.root.activeElement as HTMLElement | null)?.blur();
      });
      await readyArt();
      await page.screenshot({ path: path.join(root, 'images/07-market.png') });
    }
    await shadow.locator('.product').filter({ hasText: '魔法宝箱' }).click();
    await shadow.locator('.adventure-sheet .primary').click();
    await page.waitForFunction(() => !!demo.view.adventure.chest);
    await shadow.locator('.opening .primary').click();
    await page.waitForFunction(() => demo.view.adventure.chest?.revealed);
    assert.equal(await shadow.locator('.opening h3').textContent(), '水晶新月法杖');
    assert.equal(await page.evaluate(() => demo.actions()), 4);
    if (capture && !mobile) {
      await page.waitForTimeout(750);
      await page.evaluate(() => {
        document.querySelector<HTMLElement>('#showcase-title')!.textContent =
          '让惊喜，有一个登场时刻';
        document.querySelector<HTMLElement>('#showcase-subtitle')!.textContent =
          '先蓄光，再揭晓。每份奖励都来自 Habitica。';
        (demo.view.root.activeElement as HTMLElement | null)?.blur();
      });
      await readyArt();
      await page.screenshot({ path: path.join(root, 'images/08-armoire.png') });
    }
    await shadow.locator('.opening [data-dismiss]').click();
    for (const result of [
      { type: 'food', dropKey: 'Meat', dropText: '肉' },
      { type: 'experience', value: 27 },
    ]) {
      await page.evaluate((drop) => {
        demo.view.adventure.openChest(
          drop.type === 'food'
            ? { name: '肉', notes: '', image: 'Pet_Food_Meat', type: 'food' }
            : { name: '经验 +27', notes: '', type: 'experience' },
        );
        demo.view.adventure.revealChest();
      }, result);
      await shadow.locator('.opening [data-dismiss]').click();
    }
    // Scene feedback: progress ambient, reward cheer and rare sky events.
    await page.evaluate(() => demo.view.editingFeedback({ progress: 0.8 }));
    assert.ok(
      await page.evaluate(
        () =>
          Number(
            demo.view.root
              .querySelector<HTMLElement>('.scene')!
              .style.getPropertyValue('--approach'),
          ) > 0.7,
      ),
      'pedestal ambient must follow progress',
    );
    await page.evaluate(() => demo.view.rewardFeedback(1, {}));
    assert.ok(
      await page.evaluate(() =>
        demo.view.root.querySelector('.avatar')!.classList.contains('cheer'),
      ),
      'reward must cheer the avatar',
    );
    await page.evaluate(() => demo.view.meteor());
    assert.ok(await page.evaluate(() => !!demo.view.root.querySelector('.meteor')));
    await page.evaluate(() => demo.view.moonBloom());
    assert.ok(
      await page.evaluate(() =>
        demo.view.root.querySelector('.moon-halo')!.classList.contains('bloom'),
      ),
    );
    await page.waitForTimeout(1500);
    await shadow.locator('.adventure-shop .back').click();
    const overflow = await page.evaluate(() => {
      const c = demo.view.card;
      return c.scrollWidth - c.clientWidth;
    });
    assert.ok(overflow <= 1, 'panel must not overflow horizontally');
    await page.evaluate(() => {
      demo.view.host.dataset.theme = 'light';
    });
    assert.ok(
      await page.evaluate(() => demo.view.card.scrollWidth - demo.view.card.clientWidth <= 1),
      'light panel must not overflow',
    );
    await page.evaluate(() => {
      demo.view.host.dataset.theme = 'dark';
    });
    await page.evaluate(() => {
      demo.view.settings(true);
    });
    assert.equal(await shadow.locator('.settings').isVisible(), true);
    await page.evaluate(() => demo.view.settings(false));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      demo.view.adventure.openChest({ name: '经验 +27', notes: '', type: 'experience' });
      demo.view.adventure.revealChest();
    });
    assert.equal(await shadow.locator('.rays').isVisible(), false);
    await shadow.locator('.opening [data-dismiss]').click();
    await page.evaluate(() => demo.view.destroy());
    assert.equal(await page.locator('#gamify-for-siyuan-view').count(), 0);
    assert.equal(apiCalls, 0);
    assert.deepEqual(errors, []);
    console.log('Adventure UI passed: ' + (mobile ? 'mobile' : 'desktop'));
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  }
} finally {
  await browser.close();
}
