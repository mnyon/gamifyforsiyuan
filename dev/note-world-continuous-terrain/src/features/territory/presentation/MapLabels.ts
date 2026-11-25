import * as THREE from 'three';
import type { WorldModel } from '../domain/WorldModel.js';
export type MapLabel = {
  el: HTMLDivElement;
  x: number;
  z: number;
  kind: 'book' | 'selected' | 'page';
  id: string;
};
export function refreshLabels(
  labels: MapLabel[],
  model: WorldModel,
  selected: string | null,
  container: HTMLElement,
): MapLabel[] {
  for (const l of labels) l.el.remove();
  labels = [];
  for (const b of model.books.values()) {
    const el = document.createElement('div');
    el.className = 'map-label';
    el.textContent = b.name;
    container.append(el);
    labels.push({ el, x: b.x, z: b.z, kind: 'book', id: b.id });
  }
  if (selected && model.pages.has(selected)) {
    const p = model.pages.get(selected)!,
      el = document.createElement('div');
    el.className = 'map-label page selected';
    el.textContent = p.title;
    container.append(el);
    labels.push({ el, x: p.x, z: p.z, kind: 'selected', id: p.id });
  }
  const neighbours = selected ? model.related(selected!).slice(0, 12) : [];
  for (const { page: p } of neighbours) {
    const el = document.createElement('div');
    el.className = 'map-label page';
    el.textContent = p.title;
    container.append(el);
    labels.push({ el, x: p.x, z: p.z, kind: 'page', id: p.id });
  }
  return labels;
}
export function placeLabels(
  labels: MapLabel[],
  model: WorldModel,
  camera: THREE.OrthographicCamera,
  container: HTMLElement,
  overviewZoom: number,
) {
  const w = container.clientWidth,
    h = container.clientHeight,
    rects: Array<{ x: number; y: number; w: number; h: number }> = [],
    visibleBooks = new Set([...model.pages.values()].map((p) => p.box));
  const sorted = labels
    .slice()
    .sort(
      (a, b) =>
        (a.kind === 'selected' ? -10 : a.kind === 'page' ? -5 : 0) -
        (b.kind === 'selected' ? -10 : b.kind === 'page' ? -5 : 0),
    );
  for (const l of sorted) {
    const p = new THREE.Vector3(l.x, model.height(l.x, l.z) + 4, l.z).project(camera),
      x = (p.x * 0.5 + 0.5) * w,
      y = (-p.y * 0.5 + 0.5) * h;
    let show = p.z < 1 && p.z > -1 && x > 45 && x < w - 40 && y > 60 && y < h - 80;
    if (l.kind === 'book' && !visibleBooks.has(l.id)) show = false;
    if (l.kind === 'page' && camera.zoom < overviewZoom * 1.45) show = false;
    const bw = Math.min(180, (l.el.textContent || '').length * 12 + 18),
      r = { x: x - bw / 2, y: y - 20, w: bw, h: 23 };
    if (
      l.kind !== 'selected' &&
      rects.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)
    )
      show = false;
    if (show) {
      rects.push(r);
      l.el.style.transform = `translate(-50%,-100%) translate(${x}px,${y}px)`;
    }
    l.el.hidden = !show;
  }
}
