import { MAX_AGE } from './ports.js';
import type {
  AtlasRepository,
  MetadataApi,
  Checkpoint,
  WorldSnapshot,
  CollectionProgress,
  CollectionResult,
} from './ports.js';
import { validSnapshot, validCheckpoint } from './snapshot.js';
const PAGE_BATCH = 512;
const SIZE_BATCH = 512;
const EDGE_BATCH = 10_000;
export class GentleSync {
  readonly api: MetadataApi;
  readonly cache: AtlasRepository;
  readonly now: () => number;
  readonly onProgress: (value: CollectionProgress) => void;
  state: Checkpoint | null;
  previous: WorldSnapshot | null;
  constructor({
    api,
    cache,
    now = Date.now,
    onProgress = () => {},
  }: {
    api: MetadataApi;
    cache: AtlasRepository;
    now?: () => number;
    onProgress?: (value: CollectionProgress) => void;
  }) {
    this.api = api;
    this.cache = cache;
    this.now = now;
    this.onProgress = onProgress;
    this.state = null;
    this.previous = null;
  }
  async initialize() {
    const previous = await this.cache.read('snapshot');
    this.previous = validSnapshot(previous) ? previous : null;
    const saved = await this.cache.read('checkpoint');
    this.state = validCheckpoint(saved) ? saved : null;
    return this.previous;
  }
  async step(): Promise<CollectionResult> {
    if (!this.state) {
      if (this.previous && this.now() - this.previous.at < MAX_AGE)
        return { done: true, fresh: true };
      this.state = {
        version: 1,
        phase: 'books',
        books: [],
        pages: [],
        edges: [],
        after: '',
        sizeIndex: 0,
        edgeCursor: null,
        started: this.now(),
      };
    }
    const s = this.state;
    let ready = null;
    if (s.phase === 'books') {
      s.books = (await this.api('books')).books;
      s.phase = 'pages';
    } else if (s.phase === 'pages') {
      const rows = await this.api('pages', { after: s.after, limit: PAGE_BATCH });
      if (rows.length) {
        const next = rows.at(-1)!.id;
        if (next <= s.after) throw Error('文档分页未前进');
        s.pages.push(...rows);
        s.after = next;
      } else {
        const old = new Map((this.previous?.pages || []).map((p) => [p.id, p]));
        for (const p of s.pages) {
          const v = old.get(p.id);
          if (v && v.updated === p.updated && v.box === p.box && v.chars !== undefined)
            p.chars = v.chars;
        }
        s.phase = 'sizes';
      }
    } else if (s.phase === 'sizes') {
      while (s.sizeIndex < s.pages.length && s.pages[s.sizeIndex].chars !== undefined)
        s.sizeIndex++;
      if (s.sizeIndex >= s.pages.length) s.phase = 'edges';
      else {
        const batch = s.pages
            .slice(s.sizeIndex, s.sizeIndex + SIZE_BATCH)
            .filter((p) => p.chars === undefined),
          rows = await this.api('sizes', { ids: batch.map((p) => p.id) }),
          sizes = new Map(rows.map((r) => [r.id, Number(r.chars) || 0]));
        for (const p of batch) p.chars = sizes.get(p.id) || 0;
        s.sizeIndex += Math.min(SIZE_BATCH, s.pages.length - s.sizeIndex);
      }
    } else if (s.phase === 'edges') {
      const rows = await this.api('edges', { after: s.edgeCursor, limit: EDGE_BATCH });
      if (rows.length) {
        const last = rows.at(-1)!,
          next = { source: last.source, target: last.target };
        if (
          s.edgeCursor &&
          next.source === s.edgeCursor.source &&
          next.target === s.edgeCursor.target
        )
          throw Error('引用分页未前进');
        s.edges.push(...rows);
        s.edgeCursor = next;
      } else {
        s.phase = 'ready';
      }
    }
    if (s.phase === 'ready') ready = { books: s.books, pages: s.pages, edges: s.edges };
    await this.cache.write('checkpoint', s);
    this.onProgress({
      phase: s.phase,
      pages: s.pages.length,
      sizes: s.sizeIndex,
      edges: s.edges.length,
      started: s.started,
    });
    return ready ? { done: true, data: ready } : { done: false };
  }
  async commit(snapshot: WorldSnapshot) {
    if (!validSnapshot(snapshot)) throw Error('地图缓存格式无效');
    await this.cache.write('snapshot', snapshot);
    await this.cache.write('checkpoint', null);
    this.previous = snapshot;
    this.state = null;
  }
}
