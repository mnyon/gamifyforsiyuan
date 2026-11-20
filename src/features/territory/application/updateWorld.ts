import { STRIDE } from '../domain/WorldModel.js';
import type { WorldModel } from '../domain/WorldModel.js';
import type { Metadata } from '../domain/types.js';
import { FIELD_NAMES } from './ports.js';
import type { WorldSnapshot } from './ports.js';

export type YieldWork = () => Promise<void>;
/** Rehydrate indexes and use cached terrain samples only when every field is complete and finite. */
export async function restoreWorld(
  model: WorldModel,
  snapshot: WorldSnapshot,
  yieldWork: YieldWork,
): Promise<boolean> {
  model.now = snapshot.now || snapshot.at;
  model.setBooks(snapshot.books);
  model.prepareLayout(snapshot.pages, snapshot.edges);
  for (let i = 0; i < snapshot.pages.length; i++) {
    model.upsert(snapshot.pages[i]);
    if (i % 500 === 0) await yieldWork();
  }
  model.refreshLandforms();
  const fields = snapshot.fields;
  const cached =
    !!fields &&
    FIELD_NAMES.every(
      (key) => fields[key]?.length === STRIDE * STRIDE && fields[key].every(Number.isFinite),
    );
  if (cached) {
    for (const key of FIELD_NAMES) model[key] = Float32Array.from(fields![key]);
    model.dirty.clear();
    model.changedChunks.clear();
  } else {
    while (model.dirty.size) {
      model.step(900);
      await yieldWork();
    }
  }
  model.setEdges(snapshot.edges);
  model.changedChunks.clear();
  return cached;
}
/** Apply only a completely collected catalog, preserving the existing layout algorithm. */
export async function applyMetadata(
  model: WorldModel,
  data: Metadata,
  now: number,
  yieldWork: YieldWork,
): Promise<{ changed: number; dirty: number }> {
  model.setNow(now);
  model.setBooks(data.books);
  model.prepareLayout(data.pages, data.edges);
  const ids = new Set(data.pages.map((page) => page.id));
  for (const id of [...model.pages.keys()]) if (!ids.has(id)) model.remove(id);
  let changed = 0;
  for (let i = 0; i < data.pages.length; i++) {
    if (model.upsert(data.pages[i])) changed++;
    if (i % 300 === 0) await yieldWork();
  }
  if (model.formsDirty) model.refreshLandforms();
  const dirty = model.dirty.size;
  while (model.dirty.size) {
    model.step(650);
    await yieldWork();
  }
  model.setEdges(data.edges);
  model.changedChunks.clear();
  return { changed, dirty };
}
