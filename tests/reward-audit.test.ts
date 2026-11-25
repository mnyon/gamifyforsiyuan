import assert from 'node:assert/strict';
import test from 'node:test';
import type { FileFetcher } from '../src/adapters/siyuan/JsonFileStore.js';
import { RewardAuditLog } from '../src/features/progress/adapters/RewardAuditLog.js';

test('reward audit keeps the newest 200 entries and reloads them', async (context) => {
  const original = { info: console.info, warn: console.warn };
  console.info = () => {};
  console.warn = () => {};
  context.after(() => {
    console.info = original.info;
    console.warn = original.warn;
  });

  let stored: unknown = null;
  let writes = 0;
  const fetcher: FileFetcher = async (path, options) => {
    if (path.endsWith('getFile'))
      return {
        ok: true,
        status: stored === null ? 202 : 200,
        json: async () => stored,
      };
    const form = options.body as FormData;
    const file = form.get('file') as Blob;
    stored = JSON.parse(await file.text());
    writes++;
    return { ok: true, status: 200, json: async () => ({ code: 0 }) };
  };

  const log = new RewardAuditLog('gamify-for-siyuan', fetcher);
  await log.load();
  for (let index = 0; index < 205; index++)
    log.record({ at: index, kind: 'reward', action: 'sent' });
  await log.flush();

  const document = stored as { version: number; entries: Array<{ at: number }> };
  assert.equal(document.version, 1);
  assert.equal(document.entries.length, 200);
  assert.equal(document.entries.at(0)?.at, 5);
  assert.ok(log.path.endsWith('/reward-audit.json'));

  const restored = new RewardAuditLog('gamify-for-siyuan', fetcher);
  await restored.load();
  restored.record({ at: 999, kind: 'connection', action: 'connected' });
  await restored.flush();

  const merged = stored as { entries: Array<{ at: number }> };
  assert.equal(merged.entries.length, 200);
  assert.equal(merged.entries.at(0)?.at, 6);
  assert.equal(merged.entries.at(-1)?.at, 999);
  assert.equal(writes, 206);
});

test('unreadable and unwritable audit files never reject the reward flow', async () => {
  const failures: unknown[] = [];
  const fetcher: FileFetcher = async (path) => {
    if (path.endsWith('getFile')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: false, status: 500, json: async () => ({ code: -1, msg: 'disk full' }) };
  };
  const original = console.warn;
  console.warn = (error: unknown) => failures.push(error);
  try {
    const log = new RewardAuditLog('gamify-for-siyuan', fetcher);
    await log.load();
    log.record({ at: 1, kind: 'connection', action: 'connect-failed', message: 'offline' });
    await log.flush();
    assert.equal(failures.length, 2);
  } finally {
    console.warn = original;
  }
});
