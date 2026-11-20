import type { Book, Page, Edge } from '../domain/types.js';
import type { EdgeCursor } from '../application/ports.js';
export type SourceName =
  'books' | 'pages' | 'sizes' | 'edges' | 'status' | 'connect' | 'disconnect';
export interface SourceBody {
  after?: string | EdgeCursor | null;
  limit?: number;
  ids?: string[];
  key?: string;
}
export type PostJson = (path: string, body: object) => Promise<unknown>;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('笔记元信息格式无效');
  return value as Record<string, unknown>;
}
function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw Error('笔记元信息列表格式无效');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw Error('笔记元信息字段无效');
  return value;
}
function number(value: unknown): number {
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) throw Error('笔记元信息数值无效');
  return n;
}
function books(value: unknown): Book[] {
  return rows(value).map((value) => {
    const r = record(value);
    return { id: text(r.id), name: text(r.name) };
  });
}
function pages(value: unknown): Page[] {
  return rows(value).map((value) => {
    const r = record(value);
    if (r.updated !== null && typeof r.updated !== 'string' && typeof r.updated !== 'number')
      throw Error('笔记更新时间无效');
    return {
      id: text(r.id),
      box: text(r.box),
      title: text(r.title),
      updated: r.updated,
      ...(r.chars === undefined ? {} : { chars: number(r.chars) }),
    };
  });
}
function edges(value: unknown): Edge[] {
  return rows(value).map((value) => {
    const r = record(value);
    return { source: text(r.source), target: text(r.target), weight: number(r.weight) };
  });
}
const valid = (id: unknown): id is string =>
  typeof id === 'string' && /^\d{14}-[a-z0-9]{7}$/.test(id);
const quote = (id: unknown) => {
  if (!valid(id)) throw Error('无效文档标识');
  return "'" + id + "'";
};
const fetchJson: PostJson = async (path, body) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error('暂时无法读取本地笔记');
  return response.json();
};
/** Native pages use the existing same-origin session. Credentials are never retained here. */
export class SiYuanMetadataSource {
  private books: Book[] = [];
  constructor(
    readonly native: boolean,
    private readonly post: PostJson = fetchJson,
  ) {}
  setBooks(rows: Book[]) {
    this.books = rows || [];
  }
  api(name: 'books'): Promise<{ books: Book[] }>;
  api(name: 'pages', body: { after: string; limit: number }): Promise<Page[]>;
  api(name: 'sizes', body: { ids: string[] }): Promise<Array<{ id: string; chars: number }>>;
  api(name: 'edges', body: { after: EdgeCursor | null; limit: number }): Promise<Edge[]>;
  api(name: 'status' | 'disconnect'): Promise<{ connected: boolean }>;
  api(name: 'connect', body: { key: string }): Promise<{ books: Book[] }>;
  async api(
    name: SourceName,
    body: SourceBody = {},
  ): Promise<
    | { books: Book[] }
    | Page[]
    | Edge[]
    | Array<{ id: string; chars: number }>
    | { connected: boolean }
  > {
    let data: unknown;
    if (!this.native) {
      const response = await this.post('/api/' + name, body);
      if (response && typeof response === 'object' && 'error' in response)
        throw Error('暂时无法读取本地笔记');
      data = response;
    } else {
      if (name === 'status') return { connected: true };
      if (name === 'disconnect') return { connected: false };
      if (name === 'connect') return { books: this.books };
      if (name === 'books') {
        const result = record(await this.post('/api/notebook/lsNotebooks', {}));
        if (result.code !== 0) throw Error('无法读取笔记本');
        this.books = rows(record(result.data).notebooks || [])
          .map(record)
          .filter((b) => !b.closed && valid(b.id))
          .map((b) => ({ id: text(b.id), name: text(b.name) }));
        return { books: this.books };
      }
      const scope = this.books.map((b) => quote(b.id)).join(',');
      if (!scope) return [];
      const limit = Math.min(128, Math.max(1, Number(body.limit) || 128));
      let stmt: string;
      if (name === 'pages')
        stmt = `SELECT id,box,content AS title,updated FROM blocks WHERE type='d' AND box IN (${scope})${body.after ? ' AND id>' + quote(body.after) : ''} ORDER BY id LIMIT ${limit}`;
      else if (name === 'sizes') {
        if (!Array.isArray(body.ids) || body.ids.length > 64 || !body.ids.length)
          throw Error('文档批次无效');
        stmt = `SELECT root_id AS id,SUM(length(content)) AS chars FROM blocks WHERE box IN (${scope}) AND root_id IN (${body.ids.map(quote).join(',')}) GROUP BY root_id ORDER BY root_id LIMIT 64`;
      } else if (name === 'edges') {
        let after = '';
        if (body.after) {
          if (typeof body.after === 'string') throw Error('引用游标无效');
          const a = quote(body.after.source),
            b = quote(body.after.target);
          after = ` AND (r.root_id>${a} OR (r.root_id=${a} AND t.root_id>${b}))`;
        }
        stmt = `SELECT r.root_id AS source,t.root_id AS target,COUNT(*) AS weight FROM refs r JOIN blocks s ON s.id=r.root_id JOIN blocks t ON t.id=r.def_block_id WHERE s.type='d' AND s.box IN (${scope}) AND t.box IN (${scope}) AND r.root_id<>t.root_id${after} GROUP BY r.root_id,t.root_id ORDER BY r.root_id,t.root_id LIMIT ${limit}`;
      } else throw Error('不支持的读取接口');
      const result = record(await this.post('/api/query/sql', { stmt }));
      if (result.code !== 0) throw Error('笔记读取失败');
      data = result.data;
    }
    if (name === 'status' || name === 'disconnect') {
      const result = record(data);
      if (typeof result.connected !== 'boolean') throw Error('连接状态无效');
      return { connected: result.connected };
    }
    if (name === 'books' || name === 'connect') return { books: books(record(data).books) };
    if (name === 'pages') return pages(data);
    if (name === 'edges') return edges(data);
    return rows(data).map((value) => {
      const row = record(value);
      return { id: text(row.id), chars: number(row.chars) };
    });
  }
}
export function createSource() {
  return new SiYuanMetadataSource(location.pathname.startsWith('/plugins/'));
}
