import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorldModel,
  Heap,
  STRIDE,
  CELL,
  contribution,
  parseUpdated,
} from '../../src/features/territory/domain/WorldModel.ts';
const now = +new Date(2026, 10, 20, 12),
  flush = (m: WorldModel) => {
    while (m.dirty.size) m.step(300);
  };
const rows = () =>
  Array.from({ length: 100 }, (_, i) => ({
    id: String(20240101000000 + i * 1000000) + '-page' + String(i).padStart(3, '0'),
    box: i % 2 ? 'book-a' : 'book-b',
    title: 'Page ' + i,
    chars: 1000 + i * 40,
    updated: now - i * 86400000,
  }));
const seed = (data = rows()) => {
  const m = new WorldModel();
  m.now = now;
  m.setBooks([
    { id: 'book-a', name: 'A' },
    { id: 'book-b', name: 'B' },
  ]);
  m.prepareLayout(data);
  for (const p of data) m.upsert(p);
  flush(m);
  m.changedChunks.clear();
  return m;
};
test('heap returns lowest priorities', () => {
  const h = new Heap();
  for (const n of [8, 3, 7, 1, 9, 0]) h.push(n, n);
  const a = [];
  while (h.size) a.push(h.pop()!.value);
  assert.deepEqual(a, [0, 1, 3, 7, 8, 9]);
});
test('empty library has only sea and no fabricated mountains', () => {
  const m = new WorldModel();
  m.setBooks([{ id: 'empty-book', name: 'Empty' }]);
  assert.ok(m.heights.every((v) => v === -3));
  assert.equal(m.rivers.length, 0);
  assert.equal(m.explain(0, 0).forms.length, 0);
});
test('metadata order does not change organic geography', () => {
  const a = seed(),
    b = seed(rows().reverse());
  for (let i = 0; i < a.heights.length; i++)
    assert.ok(Math.abs(a.heights[i] - b.heights[i]) < 0.00001);
  assert.deepEqual(a.layout, b.layout);
});
test('landmarks do not form rectangular rows and columns', () => {
  const m = seed(),
    ps = [...m.pages.values()];
  assert.ok(new Set(ps.map((p) => p.x.toFixed(4))).size > ps.length * 0.9);
  assert.ok(new Set(ps.map((p) => p.z.toFixed(4))).size > ps.length * 0.9);
  assert.ok(m.landforms.size > 0);
  assert.ok(Object.values(m.layout.regions).every((r) => !('w' in r) && !('cols' in r)));
});
test('local update agrees with independent multi-scale field computation', () => {
  const m = seed(),
    p = [...m.pages.values()][15],
    before = m.sourceHeights.slice(),
    positions = [...m.pages.values()].map((p) => [p.id, p.x, p.z]);
  m.upsert({ ...p, chars: p.chars! + 30000 });
  m.refreshLandforms();
  const dirty = new Set(m.dirty);
  assert.ok(dirty.size > 0 && dirty.size < m.heights.length);
  const n = dirty.size;
  m.step(3);
  assert.equal(m.dirty.size, n - 3);
  flush(m);
  assert.deepEqual(
    [...m.pages.values()].map((p) => [p.id, p.x, p.z]),
    positions,
  );
  for (let i = 0; i < before.length; i++) {
    if (!dirty.has(i)) assert.equal(m.sourceHeights[i], before[i]);
    const x = (i % STRIDE) * CELL - 200,
      z = Math.floor(i / STRIDE) * CELL - 200;
    let density = 0,
      content = 0,
      mass = 0;
    for (const p of m.pages.values()) {
      const d = ((p.x - x) ** 2 + (p.z - z) ** 2) / p.radius ** 2;
      if (d >= 1) continue;
      const w = (1 - d) ** 2;
      density += w;
      content += (Math.log2(1 + p.chars! / 1000) / 4) * w;
    }
    for (const f of m.landforms.values()) {
      const dx = x - f.x,
        dz = z - f.z,
        u = dx * Math.cos(f.angle) + dz * Math.sin(f.angle),
        v = -dx * Math.sin(f.angle) + dz * Math.cos(f.angle),
        d = ((u * u) / f.stretch + v * v * f.stretch) / f.support ** 2;
      if (d < 1) mass += f.mass * Math.exp(-4 * d) * (1 - d) ** 2;
    }
    const expected =
      -3 + 20 * Math.log1p(mass / 12) + 1.6 * Math.log1p(content) + 0.8 * Math.log1p(density);
    assert.ok(Math.abs(m.sourceHeights[i] - expected) < 0.00002);
  }
});
test('content increases smooth landform mass without moving landmarks', () => {
  const m = seed(),
    p = [...m.pages.values()][15],
    a = m.explain(p.x, p.z);
  m.upsert({ ...p, chars: p.chars! * 10 });
  flush(m);
  const b = m.explain(p.x, p.z);
  assert.ok(b.height > a.height);
  assert.ok(b.mass > a.mass);
  assert.equal(m.pages.get(p.id)!.x, p.x);
});
test('update age changes coverage without changing heights', () => {
  const m = seed(),
    p = [...m.pages.values()][15];
  m.upsert({ ...p, updated: now - 400 * 86400000 });
  flush(m);
  const h = m.heights.slice(),
    d = m.dormancy.slice();
  m.upsert({ ...p, updated: now });
  flush(m);
  assert.deepEqual(m.heights, h);
  assert.ok(m.dormancy.some((v, i) => v < d[i]));
  assert.equal(contribution({ ...m.pages.get(p.id)!, updated: null }, p.x, p.z, now)!.dormant, 0);
});
test('deleting every Page removes broad hills as well as local land', () => {
  const m = seed();
  for (const id of [...m.pages.keys()]) m.remove(id);
  flush(m);
  m.setEdges([]);
  assert.ok(m.heights.every((v) => v === -3));
  assert.equal(m.landforms.size, 0);
  assert.equal(m.rivers.length, 0);
});
test('ordinary additions and reload retain existing coordinates', () => {
  const a = seed(),
    b = new WorldModel(JSON.parse(JSON.stringify(a.layout)));
  b.now = now;
  b.setBooks([
    { id: 'book-a', name: 'A' },
    { id: 'book-b', name: 'B' },
  ]);
  const ps = [
    ...rows(),
    { id: '20250101000000-newpage', box: 'book-a', title: 'New', chars: 5, updated: now },
  ];
  assert.equal(b.prepareLayout(ps), false);
  for (const p of ps) b.upsert(p);
  flush(b);
  for (const p of a.pages.values()) {
    assert.equal(b.pages.get(p.id)!.x, p.x);
    assert.equal(b.pages.get(p.id)!.z, p.z);
  }
});
test('cross-notebook reference weights affect initial region arrangement', () => {
  const ps = rows(),
    a = seed(),
    b = new WorldModel();
  b.setBooks([
    { id: 'book-a', name: 'A' },
    { id: 'book-b', name: 'B' },
  ]);
  b.prepareLayout(ps, [{ source: ps[1].id, target: ps[0].id, weight: 900 }]);
  assert.notDeepEqual(a.layout.books, b.layout.books);
});
test('unchanged metadata requires no recalculation', () => {
  const m = seed();
  assert.equal(m.prepareLayout(rows()), false);
  for (const p of rows()) assert.equal(m.upsert(p), false);
  assert.equal(m.dirty.size, 0);
});
test('citation flows preserve real references', () => {
  const m = seed(),
    ps = [...m.pages.values()];
  m.setEdges([
    { source: ps[1].id, target: ps[0].id, weight: 3 },
    { source: ps[0].id, target: ps[1].id, weight: 2 },
  ]);
  assert.equal(m.edges.length, 2);
  assert.equal(m.related(ps[0].id)[0].weight, 5);
  assert.deepEqual(
    m.rivers.map((p) => p.weight),
    [3, 2],
  );
});
test('routes connect actual endpoints', () => {
  const m = seed(),
    ps = [...m.pages.values()],
    a = ps[1],
    b = ps[2],
    route = m.route(a, b);
  assert.deepEqual(route[0], { x: a.x, z: a.z });
  assert.deepEqual(route.at(-1), { x: b.x, z: b.z });
});
test('timestamps use local time', () => {
  assert.equal(parseUpdated('20261120123456'), +new Date(2026, 10, 20, 12, 34, 56));
  assert.equal(parseUpdated('bad'), 0);
});

test('drainage only cuts into metadata terrain and is repeatable', () => {
  const m = seed(),
    before = m.heights.slice();
  assert.ok(m.heights.some((h, i) => h < m.sourceHeights[i]));
  assert.ok(m.heights.every((h, i) => h <= m.sourceHeights[i]));
  m.carveDrainage();
  assert.deepEqual(m.heights, before);
  assert.ok(m.runoff.some((v) => v > 1));
});
