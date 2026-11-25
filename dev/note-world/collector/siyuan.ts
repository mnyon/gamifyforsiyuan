import type { CollectorSnapshot } from './snapshot.js';

type Post = (path: string, body: object) => Promise<unknown>;
const batchSize = 256;
const idPattern = /^\d{14}-[a-z0-9]{7}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid SiYuan response');
  return value as Record<string, unknown>;
}

function rows(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Invalid SiYuan row list');
  return value.map(object);
}

function string(value: unknown) {
  if (typeof value !== 'string') throw new Error('Invalid SiYuan text field');
  return value;
}

function id(value: unknown) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error('Invalid SiYuan ID');
  return value;
}

function count(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid SiYuan count');
  return value;
}

const quote = (value: string) => "'" + id(value) + "'";

export function createSiYuanRequest(origin: URL, token: string): Post {
  return async (path, body) => {
    const response = await fetch(new URL(path, origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Token ' + token },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error('SiYuan HTTP ' + response.status);
    const result = object(await response.json());
    if (result.code !== 0) throw new Error('SiYuan API error (' + result.code + ')');
    return result.data;
  };
}

export async function collectSiYuan(post: Post): Promise<CollectorSnapshot> {
  const catalog = object(await post('/api/notebook/lsNotebooks', {}));
  const notebooks = rows(catalog.notebooks)
    .filter((row) => !row.closed)
    .map((row) => ({ id: id(row.id), name: string(row.name) }));
  const pages: CollectorSnapshot['pages'] = [];
  const references: CollectorSnapshot['references'] = [];
  if (!notebooks.length) return { notebooks, pages, references };

  const scope = notebooks.map((book) => quote(book.id)).join(',');
  const sql = async (stmt: string) => rows(await post('/api/query/sql', { stmt }));
  let afterPage = '';
  for (;;) {
    const cursor = afterPage ? ' AND id>' + quote(afterPage) : '';
    const batch = await sql(
      `SELECT id,box,content AS title FROM blocks WHERE type='d' AND box IN (${scope})${cursor} ORDER BY id LIMIT ${batchSize}`,
    );
    if (!batch.length) break;
    for (const row of batch) {
      const pageId = id(row.id);
      if (pageId <= afterPage) throw new Error('SiYuan page cursor did not advance');
      pages.push({ id: pageId, notebookId: id(row.box), title: string(row.title), characters: 0 });
      afterPage = pageId;
    }
  }

  for (let start = 0; start < pages.length; start += batchSize) {
    const batch = pages.slice(start, start + batchSize);
    const ids = batch.map((page) => quote(page.id)).join(',');
    const sizes = await sql(
      `SELECT root_id AS id,COALESCE(SUM(length(content)),0) AS chars FROM blocks WHERE box IN (${scope}) AND root_id IN (${ids}) GROUP BY root_id ORDER BY root_id LIMIT ${batchSize}`,
    );
    const byId = new Map(sizes.map((row) => [id(row.id), count(row.chars)]));
    for (const page of batch) page.characters = byId.get(page.id) ?? 0;
  }

  let after: CollectorSnapshot['references'][number] | undefined;
  while (pages.length) {
    const cursor = after
      ? ` AND (r.root_id>${quote(after.sourceId)} OR (r.root_id=${quote(after.sourceId)} AND t.root_id>${quote(after.targetId)}))`
      : '';
    const batch = await sql(
      `SELECT r.root_id AS source,t.root_id AS target,COUNT(*) AS weight FROM refs r JOIN blocks s ON s.id=r.root_id JOIN blocks t ON t.id=r.def_block_id WHERE s.type='d' AND s.box IN (${scope}) AND t.box IN (${scope}) AND r.root_id<>t.root_id${cursor} GROUP BY r.root_id,t.root_id ORDER BY r.root_id,t.root_id LIMIT ${batchSize}`,
    );
    if (!batch.length) break;
    for (const row of batch) {
      const sourceId = id(row.source);
      const targetId = id(row.target);
      if (
        after &&
        (sourceId < after.sourceId || (sourceId === after.sourceId && targetId <= after.targetId))
      )
        throw new Error('SiYuan reference cursor did not advance');
      after = { sourceId, targetId, count: count(row.weight) };
      references.push(after);
    }
  }
  return { notebooks, pages, references };
}
