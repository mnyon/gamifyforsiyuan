import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { collectSiYuan } from '../dev/note-world/collector/siyuan.js';
import { generateWorld, toWorldInput } from '../dev/note-world/index.js';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE blocks (id TEXT PRIMARY KEY, box TEXT, content TEXT, type TEXT, root_id TEXT);
  CREATE TABLE refs (root_id TEXT, def_block_id TEXT);
`);
const id = (n: number) => '20260101000000-' + n.toString(36).padStart(7, '0');
const notebooks = [
  { id: id(1), name: 'North', closed: false },
  { id: id(2), name: 'South', closed: false },
  { id: id(3), name: 'Closed', closed: true },
];
const block = db.prepare('INSERT INTO blocks VALUES (?, ?, ?, ?, ?)');
const ref = db.prepare('INSERT INTO refs VALUES (?, ?)');
for (let n = 0; n < 300; n++) {
  const book = notebooks[n % 2].id;
  block.run(id(100 + n), book, 'Page ' + n, 'd', id(100 + n));
  block.run(id(1000 + n), book, 'Body', 'p', id(100 + n));
}
block.run(id(4), notebooks[2].id, 'Hidden', 'd', id(4));
for (let n = 1; n < 300; n += 2) {
  ref.run(id(100), id(1000 + n));
  ref.run(id(102), id(100 + n));
}
ref.run(id(100), id(1001));
ref.run(id(100), id(4));
ref.run(id(100), id(1000));

const snapshot = await collectSiYuan(async (path, body) =>
  path === '/api/notebook/lsNotebooks'
    ? { notebooks }
    : db.prepare((body as { stmt: string }).stmt).all(),
);
db.close();
assert.equal(snapshot.notebooks.length, 2);
assert.equal(snapshot.pages.length, 300);
assert.equal(snapshot.pages[0].characters, 10);
assert.equal(snapshot.references.length, 300);
assert.deepEqual(snapshot.references[0], { sourceId: id(100), targetId: id(101), count: 2 });

const input = toWorldInput(snapshot);
const world = generateWorld(input);
assert.equal(world.notes.length, 300);
assert.equal(world.cities.length, 2);
assert(world.features.length > 0);
assert(world.notes.every(({ onLand }) => onLand));
assert(world.terrain.tracks.some(Boolean));
const first = world.notes.find(({ note }) => note.id === id(100))!;
const { size, cellSize, extent } = world.terrain;
const cell = (coordinate: number) => Math.floor((coordinate + extent / 2) / cellSize);
assert.equal(world.terrain.tracks[cell(first.z) * size + cell(first.x)], 1);
assert.deepEqual(generateWorld(input).notes, world.notes);
assert.equal(
  generateWorld(toWorldInput({ notebooks: [], pages: [], references: [] })).notes.length,
  0,
);
console.log('NoteWorld SQL pagination, reference aggregation, placement, and routes passed');
