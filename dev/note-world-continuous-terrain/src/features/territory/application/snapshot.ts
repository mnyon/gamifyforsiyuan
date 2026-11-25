import type { WorldModel } from '../domain/WorldModel.js';
import { CACHE_VERSION, FIELD_NAMES } from './ports.js';
import type { WorldSnapshot, TerrainFields, Checkpoint } from './ports.js';
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Preserve the existing v1 acceptance boundary; layout/field hydration is handled separately by the restore use case. */
export function validSnapshot(s: unknown): s is WorldSnapshot {
  return (
    record(s) &&
    s.version === CACHE_VERSION &&
    s.generator === 4 &&
    Array.isArray(s.pages) &&
    Array.isArray(s.books) &&
    Array.isArray(s.edges) &&
    record(s.layout) &&
    s.layout.version === 4 &&
    typeof s.at === 'number' &&
    Number.isFinite(s.at)
  );
}
export function validCheckpoint(s: unknown): s is Checkpoint {
  return (
    record(s) &&
    s.version === 1 &&
    typeof s.phase === 'string' &&
    ['books', 'pages', 'sizes', 'edges', 'ready'].includes(s.phase) &&
    Array.isArray(s.pages) &&
    Array.isArray(s.books) &&
    Array.isArray(s.edges) &&
    typeof s.after === 'string' &&
    Number.isSafeInteger(s.sizeIndex) &&
    (s.sizeIndex as number) >= 0 &&
    (s.sizeIndex as number) <= s.pages.length &&
    typeof s.started === 'number' &&
    Number.isFinite(s.started) &&
    (s.edgeCursor === null ||
      (record(s.edgeCursor) &&
        typeof s.edgeCursor.source === 'string' &&
        typeof s.edgeCursor.target === 'string'))
  );
}
export function snapshotOf(model: WorldModel): WorldSnapshot {
  const fields = {} as TerrainFields;
  for (const key of FIELD_NAMES) fields[key] = Float32Array.from(model[key]);
  return {
    version: CACHE_VERSION,
    generator: 4,
    at: Date.now(),
    now: model.now,
    books: [...model.books.values()].map(({ id, name }) => ({ id, name })),
    pages: [...model.pages.values()].map(({ id, box, title, updated, chars }) => ({
      id,
      box,
      title,
      updated,
      chars,
    })),
    edges: model.edges.map((edge) => ({ ...edge })),
    layout: structuredClone(model.layout),
    fields,
  };
}
