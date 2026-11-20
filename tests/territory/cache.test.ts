import { MemoryAtlas as Memory, metadataApi, invalidFixture } from '../support.js';
import type {
  WorldSnapshot,
  MetadataApi,
  CollectionResult,
} from '../../src/features/territory/application/ports.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GentleSync, MAX_AGE, validSnapshot } from '../../src/features/territory/cache.ts';
const snapshot = (at = 1): WorldSnapshot => ({
  version: 1,
  generator: 4,
  at,
  books: [{ id: 'book', name: 'B' }],
  pages: [{ id: 'old', box: 'book', title: 'Old', updated: 1, chars: 5 }],
  edges: [],
  layout: { version: 4, regions: {}, books: {}, pages: {} },
});

async function finish(s: GentleSync) {
  for (let i = 0; i < 30; i++) {
    const r = await s.step();
    if (r.done && 'data' in r) return r;
  }
  throw Error('did not finish');
}
test('fresh cached map causes no catalog, content or reference reads', async () => {
  const cache = new Memory();
  await cache.write('snapshot', snapshot(100));
  let calls = 0;
  const s = new GentleSync({
    cache,
    now: () => 101,
    api: async () => {
      calls++;
      throw Error('unnecessary');
    },
  });
  assert.ok(await s.initialize());
  assert.equal(Reflect.get(await s.step(), 'fresh'), true);
  assert.equal(calls, 0);
});
test('checkpoint resumes cursor across close without repeating completed page batches', async () => {
  const cache = new Memory(),
    calls: Array<[string, import('../support.js').MetadataRequest]> = [];
  const api = metadataApi(async (name, b = {}) => {
    calls.push([name, b]);
    if (name === 'books') return { books: [{ id: 'book', name: 'B' }] };
    if (name === 'pages') return b.after ? [] : [{ id: 'a', box: 'book', title: 'A', updated: 1 }];
    if (name === 'sizes') return [{ id: 'a', chars: 7 }];
    return [];
  });
  const a = new GentleSync({ cache, api });
  await a.initialize();
  await a.step();
  await a.step();
  const b = new GentleSync({ cache, api });
  await b.initialize();
  const r = await finish(b);
  assert.equal(r.data.pages[0].chars, 7);
  assert.equal(calls.filter(([n, b]) => n === 'pages' && !b.after).length, 1);
  assert.ok(calls.every(([n, b]) => n !== 'pages' || b.limit === 128));
  assert.equal((await cache.read('checkpoint'))!.phase, 'ready');
});
test('unchanged content is reused; removed pages remain visible until complete commit', async () => {
  const cache = new Memory();
  await cache.write('snapshot', snapshot(1));
  let fail = true,
    sizes = 0;
  const api = metadataApi(async (n, b = {}) => {
    if (n === 'books') return { books: [{ id: 'book', name: 'B' }] };
    if (n === 'pages')
      return b.after ? [] : [{ id: 'old', box: 'book', title: 'Renamed', updated: 1 }];
    if (n === 'sizes') {
      sizes++;
      return [];
    }
    if (n === 'edges' && fail) throw Error('offline');
    return [];
  });
  const a = new GentleSync({ cache, api, now: () => MAX_AGE + 10 });
  await a.initialize();
  await assert.rejects(finish(a), /offline/);
  assert.equal((await cache.read('snapshot'))!.pages[0].title, 'Old');
  fail = false;
  const b = new GentleSync({ cache, api, now: () => MAX_AGE + 10 });
  await b.initialize();
  const r = await finish(b);
  assert.equal(r.data.pages[0].chars, 5);
  assert.equal(sizes, 0);
  await b.commit({ ...snapshot(MAX_AGE + 10), pages: r.data.pages });
  assert.equal((await cache.read('snapshot'))!.pages[0].title, 'Renamed');
  assert.equal(await cache.read('checkpoint'), null);
});
test('size statistics are requested in batches of at most 64', async () => {
  const cache = new Memory(),
    counts: number[] = [],
    pages = Array.from({ length: 150 }, (_, i) => ({
      id: 'p' + String(i).padStart(3, '0'),
      box: 'b',
      updated: 1,
    }));
  const api = metadataApi(async (n, b = {}) => {
    if (n === 'books') return { books: [] };
    if (n === 'pages') return b.after ? [] : pages;
    if (n === 'sizes') {
      counts.push(b.ids!.length);
      return b.ids!.map((id) => ({ id, chars: 4 }));
    }
    return [];
  });
  const s = new GentleSync({ cache, api });
  await s.initialize();
  const r = await finish(s);
  assert.deepEqual(counts, [64, 64, 22]);
  assert.equal(r.data.pages.length, 150);
});
test('invalid cache schema is ignored; corrupt snapshot is never committed', async () => {
  const cache = new Memory();
  await cache.write('snapshot', { version: 999, pages: [] });
  await cache.write('checkpoint', { version: 1, phase: 'bad' });
  const s = new GentleSync({ cache, api: metadataApi(async () => ({ books: [] })) });
  assert.equal(await s.initialize(), null);
  assert.equal(s.state, null);
  assert.equal(validSnapshot({}), false);
  await assert.rejects(s.commit(invalidFixture({})), /格式/);
});
