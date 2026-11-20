import { stubFetch, invalidFixture } from './support.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DIRECTORY, TimeSpentReader } from '../src/adapters/siyuan/TimeSpentReader.ts';

test('reads a daily file through the SiYuan file API', async () => {
  let request!: { url: string; options: import('./support.js').RequestOptions };
  const reader = new TimeSpentReader(
    stubFetch(async (url, options) => {
      request = { url, options };
      return { status: 200, ok: true, json: async () => [{ duration: 12 }] };
    }),
  );
  const records = await reader.readDay('2026-11-18');
  assert.deepEqual(records, [{ duration: 12 }]);
  assert.equal(request.url, '/api/file/getFile');
  assert.deepEqual(JSON.parse(String(request.options.body)), {
    path: `${DEFAULT_DIRECTORY}/2026-11-18.json`,
  });
});

test('returns an empty list when the daily file does not exist', async () => {
  const reader = new TimeSpentReader(
    stubFetch(async () => ({ status: 202, ok: false, json: async () => null })),
  );
  assert.deepEqual(await reader.readDay('2026-11-18'), []);
});

test('uses the local calendar date for readLatest', async () => {
  let requestedPath;
  const reader = new TimeSpentReader(
    stubFetch(async (_url, options) => {
      requestedPath = JSON.parse(String(options.body)).path;
      return { status: 200, ok: true, json: async () => [] };
    }),
  );
  await reader.readLatest(DEFAULT_DIRECTORY, new Date(2026, 10, 18, 23, 59));
  assert.equal(requestedPath, `${DEFAULT_DIRECTORY}/2026-11-18.json`);
});
