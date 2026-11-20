import { stubFetch, invalidFixture } from './support.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SiYuanProgressRepository as ProgressStorage } from '../src/features/progress/adapters/SiYuanProgressRepository.ts';
import { SiYuanConnectionRepository as ConnectionStorage } from '../src/features/connection/adapters/SiYuanConnectionRepository.ts';
import { newProgress } from '../src/features/progress/domain/TodoProgress.ts';

test('writes JSON using Blob and checks the kernel result, without SDK File construction', async () => {
  let captured!: { url: string; options: import('./support.js').RequestOptions };
  const storage = new ProgressStorage(
    'gamify-for-siyuan',
    stubFetch(async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ code: 0 }) };
    }),
  );
  const state = newProgress();
  state.target = 12;
  await storage.write(state);
  assert.equal(captured.url, '/api/file/putFile');
  assert.equal(
    (captured!.options.body as FormData).get('path'),
    '/data/storage/petal/gamify-for-siyuan/progress.json',
  );
  assert.deepEqual(
    JSON.parse(await ((captured!.options.body as FormData).get('file') as File).text()),
    state,
  );
});
test('kernel error responses are never treated as successful saves', async () => {
  const storage = new ProgressStorage(
    'gamify-for-siyuan',
    stubFetch(async () => ({ ok: true, json: async () => ({ code: -1, msg: 'disk full' }) })),
  );
  await assert.rejects(storage.write(newProgress()), /disk full/);
});
test('missing file initializes, but failed/corrupt reads preserve existing state', async () => {
  const missing = new ProgressStorage(
    'gamify-for-siyuan',
    stubFetch(async () => ({ status: 202 })),
  );
  assert.equal(await missing.read(), null);
  const failed = new ProgressStorage(
    'gamify-for-siyuan',
    stubFetch(async () => ({ status: 403, ok: false })),
  );
  await assert.rejects(failed.read(), /未初始化新进度/);
  const corrupt = new ProgressStorage(
    'gamify-for-siyuan',
    stubFetch(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ code: -1, msg: 'read failed' }),
    })),
  );
  await assert.rejects(corrupt.read(), /read failed/);
});
test('saved progress is restored from the same file path', async () => {
  const state = newProgress();
  state.target = 12;
  state.credits = [{ id: 'one', day: '2026-11-18' }];
  state.used['2026-11-18'] = { one: 'unspent' };
  const storage = new ProgressStorage(
    'gamify-for-siyuan',
    stubFetch(async (_url, options) => {
      assert.equal(
        JSON.parse(String(options.body)).path,
        '/data/storage/petal/gamify-for-siyuan/progress.json',
      );
      return { status: 200, ok: true, json: async () => state };
    }),
  );
  assert.deepEqual(await storage.read(), state);
});

test('shared connection round trips separately from reward progress and clears the token on opt-out', async () => {
  let saved: unknown = null;
  const store = new ConnectionStorage(
    'gamify-for-siyuan',
    stubFetch(async (url, options) => {
      if (url.endsWith('putFile')) {
        assert.equal(
          (options.body as FormData).get('path'),
          '/data/storage/petal/gamify-for-siyuan/connection.json',
        );
        saved = JSON.parse(await ((options.body as FormData).get('file') as File).text());
        return { ok: true, json: async () => ({ code: 0 }) };
      }
      assert.equal(
        JSON.parse(String(options.body)).path,
        '/data/storage/petal/gamify-for-siyuan/connection.json',
      );
      return saved ? { ok: true, status: 200, json: async () => saved } : { status: 202 };
    }),
  );
  assert.equal(await store.read(), null);
  const value = {
    userId: '11111111-1111-4111-8111-111111111111',
    token: '22222222-2222-4222-8222-222222222222',
  };
  await store.save(value);
  assert.deepEqual(await store.read(), { ...value, syncCredentials: true });
  await store.clear();
  assert.deepEqual(saved, { version: 1, enabled: false });
  assert.equal(await store.read(), null);
});

test('corrupt shared connection and failed opt-out are reported', async () => {
  const store = new ConnectionStorage(
    'gamify-for-siyuan',
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ version: 1, enabled: true, userId: 'bad', token: 'bad' }),
    })),
  );
  await assert.rejects(store.read(), /同步连接信息格式不正确/);
  store.fetcher = stubFetch(async () => ({
    ok: true,
    json: async () => ({ code: -1, msg: 'disk full' }),
  }));
  await assert.rejects(store.clear(), /disk full/);
});
