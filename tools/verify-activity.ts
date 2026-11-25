import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(
  process.env.GAMIFY_RENDER_NODE_MODULES
    ? path.join(process.env.GAMIFY_RENDER_NODE_MODULES, '_verify.cjs')
    : import.meta.url,
);
const { chromium } = require('playwright-core') as typeof import('playwright-core');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const page = await context.newPage();
    let requests = 0;
    await page.route('**/*', (route) => {
      if (route.request().isNavigationRequest())
        return route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' });
      requests++;
      return route.abort();
    });
    await page.addInitScript('globalThis.__name = value => value;');
    await page.goto('http://localhost:9876/');
    await page.evaluate(
      ({ code, mobile }) => {
        const lib = new Function('require', 'module', code + '\nreturn GamifyPreview;')(
          () => ({ Plugin: class {} }),
          { exports: {} },
        ) as typeof import('../dev/plugin-simulation/preview.js');
        document.body.innerHTML = `<div class="protyle-wysiwyg" ${mobile ? '' : 'contenteditable="true"'}><div data-type="NodeListItem" data-node-id="20261101000001-bbbbbbb"><div class="protyle-action--task" contenteditable="false">□</div><div class="p" id="block" data-node-id="20261101000000-aaaaaaa" ${mobile ? 'contenteditable="true"' : ''}>旧的文字</div></div></div>`;
        window.state = lib.newProgress();
        window.activity = new lib.ActivityProgress(state);
        window.tracker = new lib.EditTracker({
          lookup: async (ids) => ids.map((id) => ({ id, updated: '20200101000000' })),
          onEdit: (edits, at) => {
            for (const edit of edits) activity.record(edit, at);
            if (window.view)
              view.editingFeedback({
                blockId: edits.at(-1)!.id,
                progress: lib.editingApproach(state, at),
              });
          },
          onError: (error) => {
            throw error;
          },
        });
        tracker.start();
        window.view = new lib.GamifyView({
          css: lib.PLUGIN_CSS,
          async onConnect() {},
          onSound() {},
        });
        view.update({ state });
        view.open();
        view.close();
        window.totals = () => {
          const day = activity.day()!;
          return { inserted: day.inserted, deleted: day.deleted, maintenance: day.maintenance };
        };
      },
      { code: fs.readFileSync('dist/dev/preview.js', 'utf8'), mobile },
    );
    await page.locator('#block').click();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    assert.deepEqual(await page.evaluate(() => totals().inserted), 3);
    assert.equal(await page.evaluate(() => !!view.caretFollower), true);
    await page.keyboard.press('Backspace');
    assert.equal(await page.evaluate(() => totals().deleted), 1);
    assert.ok((await page.evaluate(() => totals().maintenance)) > 0);
    await page.evaluate(() => navigator.clipboard.writeText('粘贴文字'));
    const beforePaste = await page.evaluate(() => totals());
    await page.keyboard.press('Control+v');
    await page.waitForFunction(() =>
      document.querySelector<HTMLElement>('#block')!.textContent.includes('粘贴文字'),
    );
    assert.deepEqual(await page.evaluate(() => totals()), beforePaste);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+x');
    assert.deepEqual(await page.evaluate(() => totals()), beforePaste);
    await page.keyboard.press('Control+z');
    assert.deepEqual(await page.evaluate(() => totals()), beforePaste);
    await page.keyboard.press('End');
    const session = await context.newCDPSession(page);
    await page.evaluate(() => {
      window.imeEvents = [];
      for (const name of ['compositionstart', 'compositionend', 'beforeinput', 'input'])
        document.addEventListener(
          name,
          (e) =>
            imeEvents.push({
              name,
              trusted: e.isTrusted,
              target: (e.target as HTMLElement).outerHTML?.slice(0, 140),
              composition: !!tracker.composition,
              anchor: document
                .getSelection()!!
                ?.anchorNode?.parentElement?.outerHTML?.slice(0, 140),
              type: (e as InputEvent).inputType,
              data: (e as InputEvent).data,
              text: document.querySelector<HTMLElement>('#block')!.textContent,
            }),
          true,
        );
    });
    await session.send('Input.imeSetComposition', {
      text: 'zhong',
      selectionStart: 5,
      selectionEnd: 5,
    });
    await session.send('Input.imeSetComposition', {
      text: '中文',
      selectionStart: 2,
      selectionEnd: 2,
    });
    await session.send('Input.insertText', { text: '中文' });
    assert.equal(
      await page.evaluate(() => totals().inserted),
      beforePaste.inserted + 2,
      JSON.stringify(await page.evaluate(() => imeEvents)),
    );
    await page.keyboard.press('Backspace');
    assert.equal(await page.evaluate(() => totals().deleted), beforePaste.deleted + 1);
    const beforeAuto = await page.evaluate(() => totals());
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('#block')!.append('自动内容');
      document
        .querySelector<HTMLElement>('#block')!
        .dispatchEvent(
          new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '自动内容' }),
        );
    });
    assert.deepEqual(await page.evaluate(() => totals()), beforeAuto);
    // Position at the middle of a wrapped line, far from the block's top-left.
    const caretResult = await page.evaluate(() => {
      view.stopCaretFollower();
      const block = document.querySelector<HTMLElement>('#block')!;
      block.style.cssText = 'width:220px;margin:130px 0 0 45px;line-height:26px;font-size:18px';
      block.textContent = '这是用于验证换行位置的文字。'.repeat(8);
      const selection = document.getSelection()!!,
        range = document.createRange();
      range.setStart(block.firstChild!, 34);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      const before = block.innerHTML,
        offset = selection.anchorOffset;
      const point = view.caretPoint({ blockId: block.dataset.nodeId });
      const expected = range.getBoundingClientRect();
      view.maintainBlock({ blockId: block.dataset.nodeId, weight: 2 });
      const halo = view.caretFollower!.element;
      const maintenance = { x: view.caretFollower!.origin.x, y: view.caretFollower!.origin.y };
      view.rewardFeedback(1, { blockId: block.dataset.nodeId, caret: true });
      const gold = view.root.querySelector<HTMLElement>('.beam-sweep:not(.purple)')!;
      return {
        point,
        expected: { x: expected.left, y: expected.top + expected.height / 2 },
        maintenance,
        reward: { x: view.caretFollower!.origin.x, y: view.caretFollower!.origin.y },
        sameContent: before === block.innerHTML,
        sameOffset: offset === selection.anchorOffset,
        coins: !!view.root.querySelector<HTMLElement>('.coin-flight')!,
        toastVisible: !view.root.querySelector<HTMLElement>('.toast')!.hidden,
        amount: view.root.querySelector<HTMLElement>('.loot-number')!?.textContent,
        coinX: parseFloat(view.root.querySelector<HTMLElement>('.coin-flight')!?.style.left),
        coinY: parseFloat(view.root.querySelector<HTMLElement>('.coin-flight')!?.style.top),
        unrelated: view.caretPoint({ blockId: '20261101000001-bbbbbbb' }),
      };
    });
    assert.deepEqual(caretResult.point, caretResult.expected);
    assert.deepEqual(caretResult.maintenance, caretResult.expected);
    assert.deepEqual(caretResult.reward, caretResult.expected);
    assert.equal(
      caretResult.sameContent &&
        caretResult.sameOffset &&
        caretResult.coins &&
        caretResult.toastVisible,
      true,
    );
    assert.equal(caretResult.amount, '+1.00 金币');
    assert.equal(caretResult.coinX, caretResult.expected.x);
    assert.equal(caretResult.coinY, caretResult.expected.y);
    assert.equal(caretResult.unrelated, null);
    assert.equal(
      await page.evaluate(
        () =>
          !!view.root.querySelector<HTMLElement>('.beam-sweep.purple')! &&
          !!view.root.querySelector<HTMLElement>('.beam-sweep:not(.purple)')!,
      ),
      true,
    );
    // The approved beam follows the insertion point, never the mouse pointer.
    await page.waitForFunction(() => view.nativeCaretStyle?.sheet?.disabled === false);
    const pointerTarget = await page.locator('#block').boundingBox();
    await page.mouse.move(pointerTarget!.x + 170, pointerTarget!.y + 70);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => {
      const point = view.caretPoint(),
        follower = view.caretFollower;
      return point && follower && Math.hypot(point.x - follower.x, point.y - follower.y) < 1;
    });
    assert.equal(
      await page.evaluate(
        () => view.root.querySelectorAll<HTMLElement>('.caret-halo,.caret-mote,.beam-trace').length,
      ),
      0,
    );
    assert.equal(
      await page.evaluate(() => view.root.querySelectorAll<HTMLElement>('.editing-glow').length),
      1,
    );
    await page.evaluate(() => {
      const range = document.getSelection()!!.getRangeAt(0);
      range.setEnd(range.startContainer, range.startOffset + 1);
    });
    await page.waitForFunction(
      () => view.nativeCaretStyle!.sheet!.disabled && view.caretFollower!.element.hidden,
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => !view.nativeCaretStyle!.sheet!.disabled);
    await page.evaluate(() => window.scrollBy(0, 30));
    assert.equal(
      await page.evaluate(() => {
        const point = view.caretPoint({ blockId: '20261101000000-aaaaaaa' });
        const rect = document.getSelection()!!.getRangeAt(0).getBoundingClientRect();
        return point?.x === rect.left && point?.y === rect.top + rect.height / 2;
      }),
      true,
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page.evaluate(() => {
        view.stopCaretFollower();
        view.root.querySelector<HTMLElement>('.particles')!.replaceChildren();
        view.maintainBlock({ blockId: '20261101000000-aaaaaaa' });
        view.rewardFeedback(1.25, { blockId: '20261101000000-aaaaaaa', caret: true });
        return (
          !view.caretFollower &&
          view.nativeCaretStyle!.sheet!.disabled &&
          !view.root.querySelector<HTMLElement>('.coin-flight')! &&
          view.root.querySelector<HTMLElement>('.loot-number')!?.textContent === '+1.25 金币'
        );
      }),
      true,
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const breathing = await page.evaluate(async () => {
      view.stopCaretFollower();
      view.editingFeedback({ blockId: '20261101000000-aaaaaaa', progress: 0.1 });
      const follower = view.caretFollower!;
      const tick = () => new Promise((resolve) => requestAnimationFrame(resolve));
      await tick();
      await tick();
      const phase = follower.phase;
      view.editingFeedback({ blockId: '20261101000000-aaaaaaa', progress: 0.95 });
      const sameFollower = follower === view.caretFollower && follower.phase === phase;
      await tick();
      const smooth = follower.approach > 0.1 && follower.approach < 0.95;
      const opacity = Number(follower.element.style.getPropertyValue('--breath-opacity'));
      const scale = Number(follower.element.style.getPropertyValue('--breath-scale'));
      view.rewardFeedback(1, { blockId: '20261101000000-aaaaaaa', caret: true });
      const release = follower.goldUntil > performance.now();
      view.editingFeedback({ blockId: '20261101000000-aaaaaaa', progress: 0 });
      await tick();
      return {
        sameFollower,
        smooth,
        visibleBreath: opacity > 0 && scale > 0,
        release,
        retainedAfterglow: follower.goldUntil > performance.now(),
        noInstantReset: follower.approach > 0 && follower.phase > phase,
      };
    });
    assert.ok(Object.values(breathing).every(Boolean), JSON.stringify(breathing));
    await page.waitForFunction(() => (view.caretFollower?.approach ?? 1) < 0.03);
    const lifecycle = await page.evaluate(async () => {
      const follower = view.caretFollower!;
      follower.activityAt = performance.now() - 4300;
      const phase = follower.phase;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const restful = follower.phase > phase && Number(follower.element.style.opacity) < 0.9;
      const oldWake = follower.wakeAt;
      view.editingFeedback({ blockId: '20261101000000-aaaaaaa', progress: 0.4 });
      const awakened = follower.wakeAt > oldWake && performance.now() - follower.activityAt < 100;
      const range = document.getSelection()!!.getRangeAt(0).cloneRange();
      const before = document.querySelector<HTMLElement>('#block')!.innerHTML;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        restful,
        awakened,
        softStart: Number(follower.element.style.opacity) < 0.5,
        condensed: parseFloat(follower.element.style.getPropertyValue('--condense-width')) <= 8,
        intact:
          before === document.querySelector<HTMLElement>('#block')!.innerHTML &&
          range.startOffset === document.getSelection()!!.anchorOffset,
      };
    });
    assert.ok(Object.values(lifecycle).every(Boolean), JSON.stringify(lifecycle));
    await page.evaluate(() => {
      view.maintainBlock({ blockId: '20261101000000-aaaaaaa' });
      view.caretFollower!.until = performance.now() + 30;
    });
    await page.waitForFunction(
      () => !view.caretFollower && !view.root.querySelector<HTMLElement>('.editing-glow')!,
    );
    assert.equal(await page.evaluate(() => view.nativeCaretStyle!.sheet!.disabled), true);
    await page.evaluate(() => {
      view.maintainBlock({ blockId: '20261101000000-aaaaaaa' });
      window.followerBeforeDestroy = view.caretFollower!;
    });
    assert.equal(requests, 0);
    await page.evaluate(() => {
      tracker.stop();
      view.destroy();
    });
    assert.equal(
      await page.evaluate(
        () =>
          !view.caretFollower &&
          !followerBeforeDestroy.element.isConnected &&
          !view.nativeCaretStyle!.isConnected,
      ),
      true,
    );
    await context.close();
    console.log(
      `${mobile ? 'Mobile' : 'Desktop'}: beam geometry, breath/condensation, gold/purple sweeps, wake/idle, native caret recovery, IME and cleanup passed`,
    );
  }
} finally {
  await browser.close();
}
