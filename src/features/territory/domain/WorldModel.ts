import type {
  Point,
  Book,
  Page,
  Edge,
  Layout,
  WorldPage,
  Landform,
  CitationFlow,
} from './types.js';
export const GRID = 192,
  STRIDE = 193,
  EXTENT = 400,
  CELL = EXTENT / GRID,
  CHUNK = 24;
export function hash(s: unknown) {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// Used only to construct fictional demo records, never to generate geography.
export const random = (s: unknown) => hash(s) / 4294967296;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export function baseHeight() {
  return -3;
}
export function parseUpdated(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!/^\d{14}$/.test(String(value))) return 0;
  const s = String(value),
    d = new Date(
      +s.slice(0, 4),
      +s.slice(4, 6) - 1,
      +s.slice(6, 8),
      +s.slice(8, 10),
      +s.slice(10, 12),
      +s.slice(12, 14),
    );
  return Number.isFinite(+d) ? +d : 0;
}
export function contribution(
  p: Pick<WorldPage, 'x' | 'z' | 'radius' | 'updated' | 'chars'>,
  x: number,
  z: number,
  now: number,
) {
  const d = ((p.x - x) ** 2 + (p.z - z) ** 2) / (p.radius * p.radius);
  if (d >= 1) return null;
  const w = (1 - d) ** 2,
    stamp = parseUpdated(p.updated),
    age = stamp ? Math.max(0, now - stamp) / 86400000 : null;
  return {
    density: w,
    content: (Math.log2(1 + Math.max(0, p.chars || 0) / 1000) / 4) * w,
    active: age === null ? 0 : Math.exp(-age / 35) * w,
    dormant: age === null ? 0 : clamp((age - 90) / 270, 0, 1) * w,
  };
}
export function fieldHeight(density: number, content: number) {
  return -2 + 6 * Math.log1p(density * 3) + 3 * Math.log1p(content);
}
export class Heap {
  a: Array<{ value: number; priority: number }>;
  constructor() {
    this.a = [];
  }
  push(value: number, priority: number) {
    const a = this.a;
    let i = a.length;
    a.push({ value, priority });
    while (i) {
      const p = (i - 1) >> 1;
      if (a[p].priority <= priority) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = { value, priority };
  }
  pop() {
    const a = this.a;
    if (!a.length) return null;
    const first = a[0],
      last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1;
        if (c + 1 < a.length && a[c + 1].priority < a[c].priority) c++;
        if (a[c].priority >= last.priority) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return first;
  }
  get size() {
    return this.a.length;
  }
}

export class WorldModel {
  pages: Map<string, WorldPage>;
  books: Map<string, Book & Point>;
  edges: Edge[];
  adjacency: Map<string, Edge[]>;
  bins: Map<string, Set<string>>;
  dirty: Set<number>;
  changedChunks: Set<number>;
  layout: Layout;
  base: Float32Array;
  heights: Float32Array;
  sourceHeights: Float32Array;
  runoff: Float32Array;
  activity: Float32Array;
  dormancy: Float32Array;
  density: Float32Array;
  content: Float32Array;
  rivers: CitationFlow[];
  now: number;
  layoutRebuilt: boolean;
  landforms: Map<string, Landform>;
  formBins: Map<string, string[]>;
  formsDirty: boolean;
  constructor(saved: Partial<Layout> = {}) {
    this.pages = new Map();
    this.books = new Map();
    this.edges = [];
    this.adjacency = new Map();
    this.bins = new Map();
    this.dirty = new Set();
    this.changedChunks = new Set();
    this.layout =
      saved?.version === 4 && saved.regions && saved.pages
        ? JSON.parse(JSON.stringify(saved))
        : { version: 4, regions: {}, books: {}, pages: {} };
    this.base = new Float32Array(STRIDE * STRIDE).fill(-3);
    this.heights = Float32Array.from(this.base);
    this.sourceHeights = Float32Array.from(this.base);
    this.runoff = new Float32Array(this.base.length);
    this.activity = new Float32Array(this.base.length);
    this.dormancy = new Float32Array(this.base.length);
    this.density = new Float32Array(this.base.length);
    this.content = new Float32Array(this.base.length);
    this.rivers = [];
    this.now = Date.now();
    this.layoutRebuilt = false;
    this.landforms = new Map();
    this.formBins = new Map();
    this.formsDirty = true;
  }
  binKey(x: number, z: number) {
    return Math.floor(x / 10) + ',' + Math.floor(z / 10);
  }
  index(p: WorldPage, add: boolean) {
    const k = this.binKey(p.x, p.z);
    if (add) {
      if (!this.bins.has(k)) this.bins.set(k, new Set());
      this.bins.get(k)!.add(p.id);
    } else {
      this.bins.get(k)?.delete(p.id);
      if (!this.bins.get(k)?.size) this.bins.delete(k);
    }
  }
  setBooks(rows: Book[]) {
    this.books.clear();
    for (const b of rows.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      const p = this.layout.books[b.id] || { x: 0, z: 0 };
      this.books.set(b.id, { ...b, ...p });
    }
  }
  prepareLayout(rows: Page[], edges: Edge[] = []) {
    rows = rows.slice().sort((a, b) => a.id.localeCompare(b.id));
    const groups = new Map<string, Page[]>();
    for (const p of rows) {
      if (!groups.has(p.box)) groups.set(p.box, []);
      groups.get(p.box)!.push(p);
    }
    let rebuild = false;
    for (const [id, ps] of groups)
      if (
        !this.layout.regions[id] ||
        ps.some((p) => this.layout.pages[p.id] && this.layout.pages[p.id].box !== id)
      )
        rebuild = true;
    if (rebuild) {
      this.layout = { version: 4, regions: {}, books: {}, pages: {}, forms: {} };
      const total = rows.length || 1,
        nodes = [...groups]
          .map(([id, ps]) => ({
            id,
            count: ps.length,
            r: 8 + 65 * Math.sqrt(ps.length / total),
            x: 0,
            z: 0,
          }))
          .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
      for (let i = 0; i < nodes.length; i++) {
        const a = i * Math.PI * (3 - Math.sqrt(5)),
          r = 18 * Math.sqrt(i);
        nodes[i].x = Math.cos(a) * r;
        nodes[i].z = Math.sin(a) * r;
      }
      const lookup = new Map(nodes.map((n, i) => [n.id, i])),
        links = new Map<string, number>(),
        pageBox = new Map(rows.map((p) => [p.id, p.box]));
      for (const e of edges) {
        const a = lookup.get(pageBox.get(e.source) || ''),
          b = lookup.get(pageBox.get(e.target) || '');
        if (a === undefined || b === undefined || a === b) continue;
        const key = Math.min(a, b) + ',' + Math.max(a, b);
        links.set(key, (links.get(key) || 0) + (Number(e.weight) || 1));
      }
      for (let step = 0; step < 280; step++) {
        const force = nodes.map((n) => ({ x: -n.x * 0.003, z: -n.z * 0.003 }));
        for (let i = 0; i < nodes.length; i++)
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i],
              b = nodes[j],
              dx = b.x - a.x,
              dz = b.z - a.z,
              d = Math.max(0.01, Math.hypot(dx, dz)),
              wanted = (a.r + b.r) * 0.92 + 4,
              repel = Math.max(0, wanted - d) * 0.045 + 12 / (d * d),
              weight = links.get(i + ',' + j) || 0,
              pull = weight ? Math.log1p(weight) * 0.0018 * Math.max(0, d - wanted * 0.7) : 0,
              f = pull - repel;
            force[i].x += (dx / d) * f;
            force[i].z += (dz / d) * f;
            force[j].x -= (dx / d) * f;
            force[j].z -= (dz / d) * f;
          }
        for (let i = 0; i < nodes.length; i++) {
          nodes[i].x += clamp(force[i].x, -1.8, 1.8);
          nodes[i].z += clamp(force[i].z, -1.8, 1.8);
        }
      }
      const extent = Math.max(100, ...nodes.map((n) => Math.hypot(n.x, n.z) + n.r * 1.4)),
        scale = Math.min(1, 170 / extent);
      for (const n of nodes) {
        let vx = 0,
          vz = 0;
        for (const [key, w] of links) {
          const [i, j] = key.split(',').map(Number),
            a = nodes[i],
            b = nodes[j];
          if (a === n) {
            vx += (b.x - a.x) * w;
            vz += (b.z - a.z) * w;
          } else if (b === n) {
            vx += (a.x - b.x) * w;
            vz += (a.z - b.z) * w;
          }
        }
        const angle = Math.hypot(vx, vz) > 0 ? Math.atan2(vz, vx) : Math.atan2(n.z, n.x);
        this.layout.regions[n.id] = { x: n.x * scale, z: n.z * scale, r: n.r * scale, angle };
        this.layout.books[n.id] = { x: n.x * scale, z: n.z * scale };
      }
    }
    this.layout.forms ||= {};
    for (const [box, ps] of groups) {
      const region = this.layout.regions[box],
        buckets = new Map<string, Page[]>();
      for (const p of ps) {
        const month = /^\d{6}/.test(p.id) ? p.id.slice(0, 6) : 'undated';
        if (!buckets.has(month)) buckets.set(month, []);
        buckets.get(month)!.push(p);
      }
      const bookMean = ps.reduce((v, p) => v + Math.log1p(p.chars || 0), 0) / ps.length;
      let cumulative = 0;
      for (const [month, members] of [...buckets].sort(([a], [b]) => a.localeCompare(b))) {
        const key = box + '|' + month;
        let form = this.layout.forms[key];
        if (!form) {
          const t = (cumulative + members.length / 2) / ps.length - 0.5,
            mean = members.reduce((v, p) => v + Math.log1p(p.chars || 0), 0) / members.length,
            u = t * region.r * 1.6,
            v = clamp((mean - bookMean) * region.r * 0.35, -region.r * 0.5, region.r * 0.5);
          form = {
            box,
            month,
            x: region.x + Math.cos(region.angle) * u - Math.sin(region.angle) * v,
            z: region.z + Math.sin(region.angle) * u + Math.cos(region.angle) * v,
            r: Math.max(5, region.r * Math.sqrt(members.length / ps.length) * 0.82),
            capacity: Math.max(16, members.length * 1.6),
            next: 0,
          };
          this.layout.forms[key] = form;
        }
        for (const p of members.slice().sort((a, b) => a.id.localeCompare(b.id))) {
          if (!this.layout.pages[p.id]) {
            const slot = form.next++,
              a = slot * Math.PI * (3 - Math.sqrt(5)),
              r = form.r * Math.sqrt((slot + 0.5) / form.capacity) * 0.83;
            this.layout.pages[p.id] = {
              x: clamp(form.x + Math.cos(a) * r, -180, 180),
              z: clamp(form.z + Math.sin(a) * r, -180, 180),
              slot,
              box,
              form: key,
              radius: clamp(3 + Math.log2(1 + (p.chars || 0) / 1000) * 0.6, 3, 9),
            };
          }
        }
        cumulative += members.length;
      }
    }
    for (const [id, b] of this.books) Object.assign(b, this.layout.books[id] || { x: 0, z: 0 });
    this.layoutRebuilt = rebuild;
    return rebuild;
  }
  position(id: string, box: string) {
    const p = this.layout.pages[id];
    if (!p || p.box !== box) throw Error('Page 位置尚未由元信息布局建立');
    return p;
  }
  invalidate(p: Point & { radius: number }) {
    const r = p.radius,
      x0 = clamp(Math.floor((p.x - r + 200) / CELL), 0, GRID),
      x1 = clamp(Math.ceil((p.x + r + 200) / CELL), 0, GRID),
      z0 = clamp(Math.floor((p.z - r + 200) / CELL), 0, GRID),
      z1 = clamp(Math.ceil((p.z + r + 200) / CELL), 0, GRID);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        if ((x * CELL - 200 - p.x) ** 2 + (z * CELL - 200 - p.z) ** 2 < r * r)
          this.dirty.add(z * STRIDE + x);
  }
  upsert(row: Page) {
    const old = this.pages.get(row.id),
      position = this.position(row.id, row.box);
    position.radius = clamp(3 + Math.log2(1 + (row.chars || 0) / 1000) * 0.6, 3, 9);
    if (
      old &&
      old.title === row.title &&
      old.updated === row.updated &&
      old.chars === row.chars &&
      old.box === row.box &&
      old.x === position.x &&
      old.z === position.z &&
      old.radius === position.radius
    )
      return false;
    const p = {
      ...row,
      x: position.x,
      z: position.z,
      radius: position.radius,
      slot: position.slot,
      form: position.form,
    };
    if (old) {
      this.index(old, false);
      this.invalidate(old);
    }
    this.pages.set(p.id, p);
    this.index(p, true);
    this.invalidate(p);
    this.formsDirty = true;
    return true;
  }
  remove(id: string) {
    const p = this.pages.get(id);
    if (!p) return;
    this.index(p, false);
    this.invalidate(p);
    this.pages.delete(id);
    this.formsDirty = true;
  }
  setNow(now: number) {
    if (Math.floor(now / 86400000) !== Math.floor(this.now / 86400000))
      for (const p of this.pages.values()) this.invalidate(p);
    this.now = now;
  }
  setEdges(rows: Edge[]) {
    const merged = new Map<string, Edge>();
    this.adjacency.clear();
    for (const e of rows) {
      if (e.source === e.target || !this.pages.has(e.source) || !this.pages.has(e.target)) continue;
      const k = e.source + '|' + e.target;
      if (!merged.has(k)) merged.set(k, { ...e, weight: Number(e.weight) || 1 });
    }
    this.edges = [...merged.values()];
    for (const e of this.edges)
      for (const id of [e.source, e.target]) {
        if (!this.adjacency.has(id)) this.adjacency.set(id, []);
        this.adjacency.get(id)!.push(e);
      }
    this.rivers = this.makeRivers();
  }
  related(id: string) {
    const m = new Map<string, number>();
    for (const e of this.adjacency.get(id) || []) {
      const other = e.source === id ? e.target : e.source;
      m.set(other, (m.get(other) || 0) + e.weight);
    }
    return [...m]
      .map(([id, weight]) => ({ page: this.pages.get(id)!, weight }))
      .sort((a, b) => b.weight - a.weight || a.page.id.localeCompare(b.page.id));
  }
  refreshLandforms() {
    const next = new Map<string, Landform>();
    for (const p of this.pages.values()) {
      const geometry = this.layout.forms![p.form];
      if (!geometry) continue;
      if (!next.has(p.form))
        next.set(p.form, {
          ...geometry,
          count: 0,
          chars: 0,
          support: 0,
          angle: 0,
          stretch: 0,
          bound: 0,
          mass: 0,
        });
      const f = next.get(p.form)!;
      f.count++;
      f.chars += Math.max(0, p.chars || 0);
    }
    for (const [key, f] of next) {
      f.support = Math.min(85, f.r * 2.5 + 5);
      f.angle = this.layout.regions[f.box]?.angle || 0;
      f.stretch = 1 + Math.min(2.4, Math.log1p(f.count) / 3);
      f.bound = f.support * Math.sqrt(f.stretch);
      f.mass = 2 + 2.2 * Math.log1p(f.count) + 1.4 * Math.log1p(f.chars / 10000);
      const old = this.landforms.get(key);
      if (
        !old ||
        old.count !== f.count ||
        old.chars !== f.chars ||
        old.x !== f.x ||
        old.z !== f.z ||
        old.r !== f.r ||
        old.stretch !== f.stretch
      ) {
        if (old) this.invalidate({ ...old, radius: old.bound });
        this.invalidate({ ...f, radius: f.bound });
      }
    }
    for (const [key, f] of this.landforms)
      if (!next.has(key)) this.invalidate({ ...f, radius: f.bound });
    this.landforms = next;
    this.formBins.clear();
    for (const [key, f] of next)
      for (let bz = Math.floor((f.z - f.bound) / 10); bz <= Math.floor((f.z + f.bound) / 10); bz++)
        for (
          let bx = Math.floor((f.x - f.bound) / 10);
          bx <= Math.floor((f.x + f.bound) / 10);
          bx++
        ) {
          const k = bx + ',' + bz;
          if (!this.formBins.has(k)) this.formBins.set(k, []);
          this.formBins.get(k)!.push(key);
        }
    this.formsDirty = false;
  }
  explain(x: number, z: number) {
    let density = 0,
      content = 0,
      active = 0,
      dormant = 0;
    const contributors = [],
      forms = [];
    for (let bz = Math.floor((z - 10) / 10); bz <= Math.floor((z + 10) / 10); bz++)
      for (let bx = Math.floor((x - 10) / 10); bx <= Math.floor((x + 10) / 10); bx++)
        for (const id of this.bins.get(bx + ',' + bz) || []) {
          const p = this.pages.get(id)!,
            c = contribution(p, x, z, this.now);
          if (!c) continue;
          density += c.density;
          content += c.content;
          active += c.active;
          dormant += c.dormant;
          contributors.push({ id, weight: c.density, chars: p.chars || 0 });
        }
    let mass = 0;
    for (const key of this.formBins.get(this.binKey(x, z)) || []) {
      const f = this.landforms.get(key)!,
        dx = x - f.x,
        dz = z - f.z,
        u = dx * Math.cos(f.angle) + dz * Math.sin(f.angle),
        v = -dx * Math.sin(f.angle) + dz * Math.cos(f.angle),
        d = ((u * u) / f.stretch + v * v * f.stretch) / (f.support * f.support);
      if (d >= 1) continue;
      const w = Math.exp(-4 * d) * (1 - d) ** 2;
      mass += f.mass * w;
      forms.push({ key, count: f.count, chars: f.chars, weight: w });
    }
    return {
      height:
        -3 + 20 * Math.log1p(mass / 12) + 1.6 * Math.log1p(content) + 0.8 * Math.log1p(density),
      mass,
      density,
      content,
      active: density ? active / density : 0,
      dormant: density ? dormant / density : 0,
      contributors,
      forms,
    };
  }
  sample(i: number) {
    const e = this.explain((i % STRIDE) * CELL - 200, Math.floor(i / STRIDE) * CELL - 200);
    this.activity[i] = e.active;
    this.dormancy[i] = e.dormant;
    this.density[i] = e.density;
    this.content[i] = e.content;
    return e.height;
  }
  step(limit = 900) {
    if (this.formsDirty) this.refreshLandforms();
    let n = 0;
    for (const i of this.dirty) {
      this.sourceHeights[i] = this.sample(i);
      this.heights[i] = this.sourceHeights[i];
      const x = i % STRIDE,
        z = Math.floor(i / STRIDE);
      for (const cx of new Set([
        Math.min(7, Math.floor(x / CHUNK)),
        Math.max(0, Math.floor((x - 1) / CHUNK)),
      ]))
        for (const cz of new Set([
          Math.min(7, Math.floor(z / CHUNK)),
          Math.max(0, Math.floor((z - 1) / CHUNK)),
        ]))
          this.changedChunks.add(cz * 8 + cx);
      this.dirty.delete(i);
      if (++n >= limit) break;
    }
    if (n && !this.dirty.size) this.carveDrainage();
    return n;
  }
  carveDrainage() {
    const h = this.sourceHeights,
      flow = new Float32Array(h.length);
    const order = [];
    for (let i = 0; i < h.length; i++)
      if (h[i] > 0) {
        flow[i] = 1;
        order.push(i);
      }
    order.sort((a, b) => h[b] - h[a] || a - b);
    const slope = new Float32Array(h.length);
    for (const i of order) {
      const x = i % STRIDE,
        z = Math.floor(i / STRIDE);
      let best = -1,
        fall = 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || x + dx < 0 || x + dx > GRID || z + dz < 0 || z + dz > GRID) continue;
          const j = (z + dz) * STRIDE + x + dx,
            d = (h[i] - h[j]) / Math.hypot(dx, dz);
          if (d > fall) {
            fall = d;
            best = j;
          }
        }
      slope[i] = fall;
      if (best >= 0) flow[best] += flow[i];
    }
    for (let i = 0; i < h.length; i++) {
      const cut =
          h[i] > 0
            ? Math.min(4, Math.sqrt(Math.log1p(flow[i])) * 1.3) * Math.min(1, slope[i] * 0.8)
            : 0,
        next = h[i] - cut;
      if (Math.abs(next - this.heights[i]) > 0.0001) {
        const x = i % STRIDE,
          z = Math.floor(i / STRIDE);
        for (const cx of new Set([
          Math.min(7, Math.floor(x / CHUNK)),
          Math.max(0, Math.floor((x - 1) / CHUNK)),
        ]))
          for (const cz of new Set([
            Math.min(7, Math.floor(z / CHUNK)),
            Math.max(0, Math.floor((z - 1) / CHUNK)),
          ]))
            this.changedChunks.add(cz * 8 + cx);
      }
      this.heights[i] = next;
    }
    this.runoff = flow;
  }
  height(x: number, z: number) {
    const gx = clamp((x + 200) / CELL, 0, GRID - 0.00001),
      gz = clamp((z + 200) / CELL, 0, GRID - 0.00001),
      ix = Math.floor(gx),
      iz = Math.floor(gz),
      u = gx - ix,
      v = gz - iz,
      i = iz * STRIDE + ix;
    return (
      (this.heights[i] * (1 - u) + this.heights[i + 1] * u) * (1 - v) +
      (this.heights[i + STRIDE] * (1 - u) + this.heights[i + STRIDE + 1] * u) * v
    );
  }
  // Citation flows: weighted centroids of real cross-notebook references, not decorative rivers.
  makeRivers() {
    const groups = new Map<
      string,
      {
        source: string;
        target: string;
        weight: number;
        ax: number;
        az: number;
        bx: number;
        bz: number;
      }
    >();
    for (const e of this.edges) {
      const a = this.pages.get(e.source),
        b = this.pages.get(e.target);
      if (!a || !b || a.box === b.box) continue;
      const key = a.box + '|' + b.box;
      if (!groups.has(key))
        groups.set(key, { source: a.box, target: b.box, weight: 0, ax: 0, az: 0, bx: 0, bz: 0 });
      const g = groups.get(key)!,
        w = e.weight;
      g.weight += w;
      g.ax += a.x * w;
      g.az += a.z * w;
      g.bx += b.x * w;
      g.bz += b.z * w;
    }
    return [...groups.values()]
      .sort(
        (a, b) =>
          b.weight - a.weight ||
          (a.source + '|' + a.target).localeCompare(b.source + '|' + b.target),
      )
      .slice(0, 12)
      .map((g) => {
        const a = { x: g.ax / g.weight, z: g.az / g.weight },
          b = { x: g.bx / g.weight, z: g.bz / g.weight },
          path = Array.from({ length: 61 }, (_, i) => ({
            x: a.x + ((b.x - a.x) * i) / 60,
            z: a.z + ((b.z - a.z) * i) / 60,
          })) as CitationFlow;
        path.source = g.source;
        path.target = g.target;
        path.weight = g.weight;
        return path;
      });
  }
  route(a: Point, b: Point) {
    const n = 97,
      step = CELL * 2,
      idx = (p: Point) =>
        clamp(Math.round((p.z + 200) / step), 0, n - 1) * n +
        clamp(Math.round((p.x + 200) / step), 0, n - 1),
      start = idx(a),
      end = idx(b),
      cost = new Float64Array(n * n).fill(Infinity),
      parent = new Int32Array(n * n).fill(-1),
      done = new Uint8Array(n * n),
      heap = new Heap();
    cost[start] = 0;
    heap.push(start, 0);
    while (heap.size) {
      const { value: i } = heap.pop()!;
      if (done[i]) continue;
      done[i] = 1;
      if (i === end) break;
      const x = i % n,
        z = Math.floor(i / n),
        h = this.heights[z * 2 * STRIDE + x * 2];
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || x + dx < 0 || x + dx >= n || z + dz < 0 || z + dz >= n) continue;
          const nx = x + dx,
            nz = z + dz,
            j = nz * n + nx,
            nh = this.heights[nz * 2 * STRIDE + nx * 2],
            dist = Math.hypot(dx, dz) * step;
          const weight =
              dist * (1 + Math.max(0, nh - 24) * 0.045 + (nh < 0.6 ? 5 : 0)) + Math.abs(nh - h) * 5,
            newCost = cost[i] + weight;
          if (newCost >= cost[j]) continue;
          cost[j] = newCost;
          parent[j] = i;
          const heuristic = Math.hypot(nx - (end % n), nz - Math.floor(end / n)) * step;
          heap.push(j, newCost + heuristic);
        }
    }
    const result = [];
    let i = end;
    while (i >= 0 && result.length < n * n) {
      result.push({ x: (i % n) * step - 200, z: Math.floor(i / n) * step - 200 });
      if (i === start) break;
      i = parent[i];
    }
    if (i !== start) return [a, b];
    result.reverse();
    result[0] = { x: a.x, z: a.z };
    result[result.length - 1] = { x: b.x, z: b.z };
    return result;
  }
}
