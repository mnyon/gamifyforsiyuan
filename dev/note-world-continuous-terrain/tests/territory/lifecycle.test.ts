import { MemoryAtlas as Memory, metadataApi, invalidFixture } from '../support.js';
import type {
  WorldSnapshot,
  MetadataApi,
  CollectionResult,
} from '../../src/features/territory/application/ports.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldModel } from '../../src/features/territory/domain/WorldModel.ts';
import {
  snapshotOf,
  restoreWorld,
  applyMetadata,
  GentleSync,
} from '../../src/features/territory/cache.ts';
import { FIELD_NAMES } from '../../src/features/territory/application/ports.ts';
import { validCheckpoint } from '../../src/features/territory/application/snapshot.ts';
const now = +new Date(2026, 10, 20, 12);
const metadata = () => ({
  books: [{ id: 'book', name: 'Book' }],
  pages: Array.from({ length: 8 }, (_, i) => ({
    id: '2024010100000' + i + '-abcdefg',
    box: 'book',
    title: 'Page ' + i,
    updated: now,
    chars: 1000 + i * 400,
  })),
  edges: [{ source: '20240101000000-abcdefg', target: '20240101000001-abcdefg', weight: 2 }],
});
const yieldWork = async () => {};
async function seeded() {
  const m = new WorldModel();
  await applyMetadata(m, metadata(), now, yieldWork);
  return m;
}

test('snapshot copies only metadata, layout and independent typed terrain fields', async () => {
  const model = await seeded();
  Object.assign(model.pages.values().next().value!, { body: 'not cached' });
  const snapshot = snapshotOf(model);
  assert.equal(Reflect.get(snapshot.pages[0], 'body'), undefined);
  assert.equal(snapshot.layout.version, 4);
  snapshot.layout.pages[snapshot.pages[0].id].x += 10;
  assert.notDeepEqual(snapshot.layout, model.layout);
  for (const key of FIELD_NAMES) {
    assert.ok(snapshot.fields![key] instanceof Float32Array);
    assert.deepEqual(snapshot.fields![key], model[key]);
    snapshot.fields![key][0] = 999;
    assert.notEqual(model[key][0], 999);
  }
});

test('complete samples restore without terrain generation and preserve layout and references', async () => {
  const original = await seeded(),
    snapshot = snapshotOf(original),
    model = new WorldModel(structuredClone(snapshot.layout));
  let yields = 0;
  model.step = () => {
    throw Error('cached samples should bypass generation');
  };
  assert.equal(
    await restoreWorld(model, snapshot, async () => {
      yields++;
    }),
    true,
  );
  assert.ok(yields > 0);
  assert.equal(model.dirty.size, 0);
  assert.equal(model.changedChunks.size, 0);
  assert.deepEqual(model.layout, original.layout);
  assert.deepEqual(model.edges, original.edges);
  for (const key of FIELD_NAMES) {
    assert.deepEqual(model[key], original[key]);
    assert.notEqual(model[key], snapshot.fields![key]);
  }
});

for (const corruption of ['missing', 'length', 'nonfinite'])
  test('damaged ' + corruption + ' field regenerates the complete terrain', async () => {
    const original = await seeded(),
      snapshot = snapshotOf(original);
    if (corruption === 'missing') Reflect.deleteProperty(snapshot.fields!, 'content');
    if (corruption === 'length') snapshot.fields!.content = new Float32Array(1);
    if (corruption === 'nonfinite') snapshot.fields!.content[10] = NaN;
    const model = new WorldModel(structuredClone(snapshot.layout));
    assert.equal(await restoreWorld(model, snapshot, yieldWork), false);
    assert.equal(model.dirty.size, 0);
    for (const key of FIELD_NAMES) assert.deepEqual(model[key], original[key]);
  });

test('unchanged catalog bypasses computation; completed empty catalog removes all terrain', async () => {
  const model = await seeded(),
    positions = structuredClone(model.layout.pages),
    step = model.step;
  model.step = () => {
    throw Error('unchanged metadata should not recompute');
  };
  assert.deepEqual(await applyMetadata(model, metadata(), now, yieldWork), {
    changed: 0,
    dirty: 0,
  });
  assert.deepEqual(model.layout.pages, positions);
  model.step = step;
  await applyMetadata(model, { books: [], pages: [], edges: [] }, now, yieldWork);
  assert.equal(model.pages.size, 0);
  assert.equal(model.landforms.size, 0);
  assert.equal(model.edges.length, 0);
  assert.ok(model.heights.every((n) => n === -3));
});

const checkpoint = () => ({
  version: 1,
  phase: 'pages',
  books: [],
  pages: [],
  edges: [],
  after: '',
  sizeIndex: 0,
  edgeCursor: null,
  started: now,
});
test('invalid checkpoint cursors and indexes are rejected before resuming collection', () => {
  assert.equal(validCheckpoint(checkpoint()), true);
  for (const patch of [
    { after: null },
    { sizeIndex: -1 },
    { sizeIndex: 1 },
    { sizeIndex: 0.5 },
    { started: NaN },
    { edgeCursor: {} },
    { edgeCursor: { source: 'a', target: 1 } },
  ])
    assert.equal(validCheckpoint({ ...checkpoint(), ...patch }), false);
});

test('failed checkpoint write resumes last durable cursor and keeps previous world', async () => {
  const cache = new Memory(),
    snapshot = snapshotOf(await seeded());
  snapshot.at = 1;
  await cache.write('snapshot', snapshot);
  const api = metadataApi(async (name) =>
    name === 'books' ? { books: metadata().books } : metadata().pages,
  );
  const a = new GentleSync({ cache, api });
  await a.initialize();
  await a.step();
  const write = cache.write.bind(cache);
  cache.write = async () => {
    throw Error('disk full');
  };
  await assert.rejects(a.step(), /disk full/);
  cache.write = write;
  const b = new GentleSync({ cache, api });
  await b.initialize();
  assert.equal(b.state!.after, '');
  assert.equal(b.state!.pages.length, 0);
  assert.deepEqual(b.previous, snapshot);
  await b.step();
  assert.equal(b.state!.pages.length, 8);
});
test('failed snapshot commit leaves checkpoint available and previous snapshot intact', async () => {
  const cache = new Memory(),
    snapshot = snapshotOf(await seeded());
  await cache.write('snapshot', snapshot);
  await cache.write('checkpoint', checkpoint());
  const sync = new GentleSync({
    cache,
    api: async () => {
      throw Error('unused');
    },
  });
  await sync.initialize();
  cache.write = async () => {
    throw Error('disk full');
  };
  await assert.rejects(sync.commit({ ...snapshot, at: now + 1 }), /disk full/);
  assert.deepEqual(await cache.read('snapshot'), snapshot);
  assert.deepEqual(await cache.read('checkpoint'), checkpoint());
  assert.deepEqual(sync.previous, snapshot);
});
