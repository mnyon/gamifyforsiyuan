import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressStorage } from './storage.js';

test('writes JSON using Blob and checks the kernel result, without SDK File construction', async () => {
  let captured;
  const storage = new ProgressStorage('gamify-for-siyuan', async (url, options) => {
    captured = { url, options }; return { ok: true, json: async () => ({ code: 0 }) };
  });
  await storage.write({ version: 1, target: 12 });
  assert.equal(captured.url, '/api/file/putFile');
  assert.equal(captured.options.body.get('path'), '/data/storage/petal/gamify-for-siyuan/progress.json');
  assert.deepEqual(JSON.parse(await captured.options.body.get('file').text()), { version: 1, target: 12 });
});
test('kernel error responses are never treated as successful saves', async () => {
  const storage = new ProgressStorage('gamify-for-siyuan', async () => ({ ok: true, json: async () => ({ code: -1, msg: 'disk full' }) }));
  await assert.rejects(storage.write({ version: 1 }), /disk full/);
});
test('missing file initializes, but failed/corrupt reads preserve existing state', async () => {
  const missing = new ProgressStorage('gamify-for-siyuan', async () => ({ status: 202 }));
  assert.equal(await missing.read(), null);
  const failed = new ProgressStorage('gamify-for-siyuan', async () => ({ status: 403, ok: false }));
  await assert.rejects(failed.read(), /未初始化新进度/);
  const corrupt = new ProgressStorage('gamify-for-siyuan', async () => ({ status: 200, ok: true, json: async () => ({ code: -1, msg: 'read failed' }) }));
  await assert.rejects(corrupt.read(), /read failed/);
});
test('saved progress is restored from the same file path', async () => {
  const state = { version: 1, target: 12, credits: [{ id: 'one' }] };
  const storage = new ProgressStorage('gamify-for-siyuan', async (_url, options) => {
    assert.equal(JSON.parse(options.body).path, '/data/storage/petal/gamify-for-siyuan/progress.json');
    return { status: 200, ok: true, json: async () => state };
  });
  assert.deepEqual(await storage.read(), state);
});
