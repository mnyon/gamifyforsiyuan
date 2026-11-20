export interface LegacyPageInput {
  id: string;
  group: number;
  title?: string;
  words: number;
  updated: number;
  links: string[];
}
export interface LegacyPage extends LegacyPageInput {
  x: number;
  y: number;
}

export const SIZE = 96,
  STRIDE = 97,
  RADIUS = 9,
  BIN = 12,
  DAY = 86400000;
export const GROUPS = [
  { name: '日常与生活', x: 26, y: 30 },
  { name: '技术与创造', x: 61, y: 26 },
  { name: '阅读与思考', x: 48, y: 59 },
  { name: '灵感收集', x: 76, y: 64 },
  { name: '远行手记', x: 21, y: 69 },
];
export function hash(s: string) {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rand(s: string) {
  return hash(s) / 4294967296;
}
function noise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    u = x - ix,
    v = y - iy,
    s = u * u * (3 - 2 * u),
    t = v * v * (3 - 2 * v),
    n = (a: number, b: number) => rand(a + ':' + b);
  return (
    (n(ix, iy) * (1 - s) + n(ix + 1, iy) * s) * (1 - t) +
    (n(ix, iy + 1) * (1 - s) + n(ix + 1, iy + 1) * s) * t
  );
}
export function pointFor(id: string, g: number) {
  const c = GROUPS[g],
    a = rand(id + 'angle') * Math.PI * 2,
    r = Math.sqrt(rand(id + 'radius')) * 13;
  return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
}
export class TerrainModel {
  pages = new Map<string, LegacyPage>();
  bins = new Map<string, Set<string>>();
  dirty = new Set<number>();
  day = 0;
  now = 0;
  height: Float32Array;
  activity: Float32Array;
  base: Float32Array;
  constructor() {
    this.pages = new Map();
    this.bins = new Map();
    this.dirty = new Set();
    this.day = 0;
    this.now = Date.UTC(2026, 10, 20);
    this.height = new Float32Array(STRIDE * STRIDE);
    this.activity = new Float32Array(STRIDE * STRIDE);
    this.base = new Float32Array(STRIDE * STRIDE);
    for (let y = 0; y <= SIZE; y++)
      for (let x = 0; x <= SIZE; x++) {
        let land = 0;
        for (const g of GROUPS)
          land = Math.max(land, 0.92 * Math.exp(-((x - g.x) ** 2 + (y - g.y) ** 2) / 210));
        this.base[y * STRIDE + x] =
          land - 0.33 + (noise(x / 9, y / 9) - 0.5) * 0.27 + (noise(x / 3, y / 3) - 0.5) * 0.06;
        this.dirty.add(y * STRIDE + x);
      }
  }
  key(x: number, y: number) {
    return Math.floor(x / BIN) + ',' + Math.floor(y / BIN);
  }
  index(p: LegacyPage, add: boolean) {
    const k = this.key(p.x, p.y);
    if (add) {
      if (!this.bins.has(k)) this.bins.set(k, new Set());
      this.bins.get(k)!.add(p.id);
    } else {
      this.bins.get(k)?.delete(p.id);
      if (this.bins.get(k)?.size === 0) this.bins.delete(k);
    }
  }
  invalidate(p: LegacyPage) {
    for (
      let y = Math.max(0, Math.floor(p.y - RADIUS));
      y <= Math.min(SIZE, Math.ceil(p.y + RADIUS));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(p.x - RADIUS));
        x <= Math.min(SIZE, Math.ceil(p.x + RADIUS));
        x++
      )
        if ((x - p.x) ** 2 + (y - p.y) ** 2 < RADIUS ** 2) this.dirty.add(y * STRIDE + x);
  }
  upsert(data: LegacyPageInput) {
    const old = this.pages.get(data.id);
    if (old) {
      this.invalidate(old);
      this.index(old, false);
    }
    const p = { ...data, ...(old ? { x: old.x, y: old.y } : pointFor(data.id, data.group)) };
    this.pages.set(p.id, p);
    this.index(p, true);
    this.invalidate(p);
    return p;
  }
  remove(id: string) {
    const p = this.pages.get(id);
    if (!p) return;
    this.invalidate(p);
    this.index(p, false);
    this.pages.delete(id);
    for (const q of this.pages.values()) q.links = q.links.filter((v) => v !== id);
  }
  age(p: LegacyPage) {
    return Math.max(0, (this.now + this.day * DAY - p.updated) / DAY);
  }
  sample(x: number, y: number): [number, number] {
    let h = this.base[y * STRIDE + x],
      a = 0;
    for (let by = Math.floor((y - RADIUS) / BIN); by <= Math.floor((y + RADIUS) / BIN); by++)
      for (let bx = Math.floor((x - RADIUS) / BIN); bx <= Math.floor((x + RADIUS) / BIN); bx++)
        for (const id of this.bins.get(bx + ',' + by) || []) {
          const p = this.pages.get(id)!,
            d = ((x - p.x) ** 2 + (y - p.y) ** 2) / RADIUS ** 2;
          if (d >= 1) continue;
          const w = (1 - d) ** 3;
          h += Math.min(0.23, 0.038 * Math.log2(1 + p.words / 200)) * w;
          a += Math.exp(-this.age(p) / 26) * w * 0.7;
        }
    return [h, Math.min(1, a)];
  }
  step(limit = 400) {
    let done = 0;
    for (const i of this.dirty) {
      const [h, a] = this.sample(i % STRIDE, Math.floor(i / STRIDE));
      this.height[i] = h;
      this.activity[i] = a;
      this.dirty.delete(i);
      if (++done >= limit) break;
    }
    return done;
  }
  advance(days: number) {
    this.day += days;
    for (const p of this.pages.values()) this.invalidate(p);
  }
  related(id: string) {
    const p = this.pages.get(id);
    return p
      ? [...this.pages.values()].filter(
          (q) => q.id !== id && (p.links.includes(q.id) || q.links.includes(id)),
        )
      : [];
  }
}
