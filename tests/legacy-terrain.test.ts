import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainModel, pointFor } from '../dev/LegacyTerrainModel.js';
function flush(m: TerrainModel) {
  while (m.dirty.size) m.step(111);
}
function seed() {
  const m = new TerrainModel();
  for (let i = 0; i < 80; i++)
    m.upsert({
      id: 'page-' + i,
      group: i % 5,
      title: 'Page ' + i,
      words: 200 + i * 70,
      updated: m.now - i * 86400000,
      links: i ? ['page-' + (i - 1)] : [],
    });
  flush(m);
  return m;
}
function compareBrute(m: TerrainModel) {
  for (let y = 0; y <= 96; y++)
    for (let x = 0; x <= 96; x++) {
      const i = y * 97 + x;
      let h = m.base[i],
        a = 0;
      for (const p of m.pages.values()) {
        const d = ((x - p.x) ** 2 + (y - p.y) ** 2) / 81;
        if (d >= 1) continue;
        const w = (1 - d) ** 3;
        h += Math.min(0.23, 0.038 * Math.log2(1 + p.words / 200)) * w;
        a += Math.exp(-m.age(p) / 26) * w * 0.7;
      }
      assert.ok(Math.abs(m.height[i] - h) < 1e-6, 'height ' + i);
      assert.ok(Math.abs(m.activity[i] - Math.min(1, a)) < 1e-6, 'activity ' + i);
    }
}
test('initial field agrees with independent all-pages calculation', () => compareBrute(seed()));
test('edit is local, preserves positions, and matches full recomputation', () => {
  const m = seed(),
    p = m.pages.get('page-25')!,
    before = m.height.slice(),
    positions = [...m.pages.values()].map((p) => [p.id, p.x, p.y]);
  m.upsert({ ...p, words: p!.words + 1800, updated: m.now });
  const dirty = new Set(m.dirty);
  assert.ok(dirty.size > 200 && dirty.size < 300);
  const pending = m.dirty.size;
  assert.equal(m.step(40), 40);
  assert.equal(m.dirty.size, pending - 40);
  flush(m);
  for (let i = 0; i < before.length; i++) if (!dirty.has(i)) assert.equal(m.height[i], before[i]);
  assert.deepEqual(
    [...m.pages.values()].map((p) => [p.id, p.x, p.y]),
    positions,
  );
  compareBrute(m);
});
test('add, delete, and consecutive edits coalesce correctly', () => {
  const m = seed();
  m.upsert({ id: 'new', group: 2, title: 'New', words: 4000, updated: m.now, links: ['page-3'] });
  m.upsert({ ...m.pages.get('new')!, words: 5500 });
  m.remove('page-3');
  m.remove('page-4');
  flush(m);
  assert.ok([...m.pages.values()].every((p) => !p.links.includes('page-3')));
  compareBrute(m);
});
test('time changes activity but not terrain or coordinates', () => {
  const m = seed(),
    h = m.height.slice(),
    a = m.activity.slice();
  m.advance(7);
  flush(m);
  assert.deepEqual(m.height, h);
  assert.ok(m.activity.some((v, i) => v < a[i]));
  compareBrute(m);
});
test('same ID and group regenerate the same initial position', () => {
  const a = pointFor('stable-id', 2),
    b = pointFor('stable-id', 2);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, pointFor('other-id', 2));
});
test('delete all then add is valid', () => {
  const m = seed();
  for (const id of [...m.pages.keys()]) m.remove(id);
  flush(m);
  assert.equal(m.pages.size, 0);
  compareBrute(m);
  m.upsert({ id: 'return', group: 0, words: 1000, updated: m.now, links: [] });
  flush(m);
  compareBrute(m);
});
