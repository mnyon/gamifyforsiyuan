import type { CollectorSnapshot } from '../collector/snapshot.js';
import type { WorldInput } from '../domain/world.js';

export function toWorldInput(snapshot: CollectorSnapshot): WorldInput {
  const notes = snapshot.pages.map(({ id, notebookId, title, characters }) => ({
    id,
    title,
    book: notebookId,
    chars: characters,
  }));
  const ids = new Set(notes.map(({ id }) => id));
  return {
    notes,
    bookNames: new Map(snapshot.notebooks.map(({ id, name }) => [id, name])),
    citations: snapshot.references
      .filter(({ sourceId, targetId }) => ids.has(sourceId) && ids.has(targetId))
      .map(({ sourceId, targetId, count }) => ({
        source: sourceId,
        target: targetId,
        weight: count,
      })),
  };
}
