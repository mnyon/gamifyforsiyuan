import {
  TerrainModel,
  SIZE,
  STRIDE,
  DAY,
  GROUPS,
  rand,
  hash,
  pointFor,
} from './LegacyTerrainModel.js';

function $(id: 'map'): HTMLCanvasElement;
function $(id: 'page-select'): HTMLSelectElement;
function $(id: 'show-links'): HTMLInputElement;
function $(id: 'edit' | 'delete'): HTMLButtonElement;
function $(id: string): HTMLElement;
function $(id: string) {
  const e = document.getElementById(id);
  if (!e) throw Error(id);
  return e;
}
const canvas = $('map'),
  ctx = canvas.getContext('2d')!,
  model = new TerrainModel();
const names = [
  ['晨间小记', '周末的厨房', '家里的植物', '散步观察', '生活实验', '睡眠与节律', '日常的秩序'],
  [
    'Three.js 光影',
    '程序化地形',
    '插件构想',
    '交互设计',
    '数据与缓存',
    '学习 JavaScript',
    '像素世界',
  ],
  [
    '一本书的边角',
    '关于注意力',
    '知识的连接',
    '时间与记忆',
    '阅读摘记',
    '重新理解学习',
    '思考的工具',
  ],
  [
    '一闪而过的点子',
    '颜色与声音',
    '梦里的街道',
    '未来的小项目',
    '偶然的发现',
    '未完成的故事',
    '图形的节奏',
  ],
  ['山间小路', '城市漫步', '河边的傍晚', '旅行清单', '雨天的车站', '海岸线', '路上的人'],
];
for (let g = 0; g < 5; g++)
  for (let j = 0; j < 19; j++) {
    const id = 'demo-' + g + '-' + j;
    model.upsert({
      id,
      group: g,
      title: names[g][j % 7] + (j >= 7 ? ' · ' + (Math.floor(j / 7) + 1) : ''),
      words: Math.round(300 + rand(id + 'words') * 7000),
      updated: model.now - Math.floor(rand(id + 'age') * 115) * DAY,
      links: j ? ['demo-' + g + '-' + Math.floor(rand(id + 'link') * j)] : [],
    });
  }
for (const p of model.pages.values())
  if (rand(p.id + 'cross') > 0.8) p.links.push('demo-' + ((p.group + 1) % 5) + '-3');
while (model.dirty.size) model.step(20000);
const shownH = Float32Array.from(model.height),
  shownA = Float32Array.from(model.activity),
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let selected = 'demo-1-3',
  width = 0,
  height = 0,
  dpr = 1,
  scale = 1,
  zoom = 1,
  panX = 0,
  panY = 0,
  scheduled = false,
  last = 0,
  serial = 0,
  auto: number | undefined = undefined,
  hits: Array<{ id: string; x: number; y: number }> = [];
function project(x: number, y: number, z = 0) {
  return {
    x: width / 2 + panX + (x - y) * 6.5 * scale * zoom,
    y: height * 0.47 + panY + ((x + y - 96) * 3.35 - z * 32) * scale * zoom,
  };
}
function terrainAt(x: number, y: number) {
  return shownH[Math.round(y) * STRIDE + Math.round(x)];
}
function requestDraw() {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(draw);
  }
}
function resize() {
  const r = canvas.getBoundingClientRect();
  width = r.width;
  height = r.height;
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  scale = Math.min((width - 30) / 1110, (height - 110) / 600);
  requestDraw();
}
function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}
function landColor(h: number, a: number, shade: number) {
  let c =
    h < 0.045
      ? mix([157, 155, 100], [202, 187, 131], Math.max(0, h / 0.045))
      : h < 0.55
        ? mix([83, 111, 67], [117, 144, 87], Math.min(1, h / 0.55))
        : h < 0.95
          ? mix([117, 135, 96], [159, 157, 131], (h - 0.55) / 0.4)
          : mix([159, 157, 131], [216, 218, 199], Math.min(1, (h - 0.95) / 0.6));
  if (h > 0.045 && h < 0.95) c = mix(c, [155, 191, 102], a * 0.6);
  return 'rgb(' + c.map((v) => Math.max(0, Math.min(255, Math.round(v * shade)))).join(',') + ')';
}
function poly(ps: Array<{ x: number; y: number }>, fill: string) {
  ctx.beginPath();
  ctx.moveTo(ps[0].x, ps[0].y);
  for (let i = 1; i < ps.length; i++) ctx.lineTo(ps[i].x, ps[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function tree(x: number, y: number, z: number, age: number, id: string) {
  const p = project(x, y, z),
    s = scale * zoom * (0.7 + rand(id) * 0.4);
  ctx.fillStyle = '#172e2466';
  ctx.beginPath();
  ctx.ellipse(p.x + 3 * s, p.y + s, 5 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8e7753';
  ctx.fillRect(p.x - s * 0.6, p.y - 6 * s, s * 1.2, 7 * s);
  poly(
    [
      { x: p.x, y: p.y - 17 * s },
      { x: p.x - 5 * s, y: p.y - 5 * s },
      { x: p.x + 5 * s, y: p.y - 5 * s },
    ],
    age < 30 ? '#a7c67c' : age < 75 ? '#688357' : '#9c9a70',
  );
  poly(
    [
      { x: p.x, y: p.y - 17 * s },
      { x: p.x, y: p.y - 5 * s },
      { x: p.x + 5 * s, y: p.y - 5 * s },
    ],
    age < 30 ? '#759653' : '#536c49',
  );
}
function draw(t: number) {
  scheduled = false;
  const dt = Math.min(64, t - (last || t - 16));
  last = t;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const before = model.dirty.size;
  model.step(420);
  if (before)
    $('progress').textContent = model.dirty.size
      ? '分帧更新中 · 剩余 ' + model.dirty.size + ' 点'
      : '局部更新完成 · 地标位置保持稳定';
  let moving = false;
  const ease = reduced ? 1 : 1 - Math.exp(-dt / 170);
  for (let i = 0; i < shownH.length; i++) {
    const dh = model.height[i] - shownH[i],
      da = model.activity[i] - shownA[i];
    if (Math.abs(dh) + Math.abs(da) > 0.0005) {
      shownH[i] += dh * ease;
      shownA[i] += da * ease;
      moving = true;
    } else {
      shownH[i] = model.height[i];
      shownA[i] = model.activity[i];
    }
  }
  for (let d = 0; d < SIZE * 2 - 1; d++)
    for (let x = Math.max(0, d - SIZE + 1); x <= Math.min(SIZE - 1, d); x++) {
      const y = d - x,
        i = y * STRIDE + x,
        hs = [shownH[i], shownH[i + 1], shownH[i + STRIDE + 1], shownH[i + STRIDE]],
        h = hs.reduce((a, b) => a + b) / 4;
      if (h < -0.24) continue;
      const ps = [
        project(x, y, Math.max(0, hs[0])),
        project(x + 1, y, Math.max(0, hs[1])),
        project(x + 1, y + 1, Math.max(0, hs[2])),
        project(x, y + 1, Math.max(0, hs[3])),
      ];
      if (ps.every((p) => p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20))
        continue;
      if (h <= 0) {
        const c = mix([52, 94, 79], [16, 43, 38], Math.min(1, -h / 0.24));
        poly(ps, 'rgb(' + c.join(',') + ')');
        if (h > -0.04 && rand(x + ',' + y) > 0.72) {
          ctx.strokeStyle = '#9bb79b35';
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(ps[0].x, ps[0].y);
          ctx.lineTo(ps[1].x, ps[1].y);
          ctx.stroke();
        }
        continue;
      }
      const a = (shownA[i] + shownA[i + 1] + shownA[i + STRIDE] + shownA[i + STRIDE + 1]) / 4,
        shade = Math.max(0.63, Math.min(1.19, 1 + (hs[0] - hs[2]) * 1.8 + (hs[1] - hs[3]) * 0.9));
      poly(ps, landColor(h, a, shade));
      if (Math.floor(h * 14) !== Math.floor(hs[2] * 14) && h > 0.09) {
        ctx.strokeStyle = '#233f2322';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(ps[2].x, ps[2].y);
        ctx.lineTo(ps[3].x, ps[3].y);
        ctx.stroke();
      }
    }
  const sel = model.pages.get(selected);
  if (sel && $('show-links').checked)
    for (const q of model.related(selected)) {
      ctx.beginPath();
      for (let n = 0; n <= 36; n++) {
        const k = n / 36,
          x = sel.x + (q.x - sel.x) * k,
          y = sel.y + (q.y - sel.y) * k,
          p = project(x, y, Math.max(0, terrainAt(x, y)) + 0.07);
        n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.strokeStyle = '#f0d494a0';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  hits = [];
  for (const p of [...model.pages.values()].sort((a, b) => a.x + a.y - b.x - b.y)) {
    const z = Math.max(0, terrainAt(p.x, p.y)),
      pt = project(p.x, p.y, z),
      age = model.age(p),
      s = scale * zoom;
    tree(p.x - 0.5, p.y + 0.2, z, age, p.id);
    if (p.words > 2200) tree(p.x + 0.8, p.y + 0.7, z, age, p.id + 'b');
    if (age < 14) {
      ctx.fillStyle = '#dceca0';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y - 20 * s, 1.8 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.id === selected) {
      ctx.strokeStyle = '#f1d79b';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, 10 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      poly(
        [
          { x: pt.x, y: pt.y - 30 * s },
          { x: pt.x + 8 * s, y: pt.y - 27 * s },
          { x: pt.x, y: pt.y - 23 * s },
        ],
        '#eed3a1',
      );
      ctx.strokeStyle = '#e4d1a6';
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - 30 * s);
      ctx.lineTo(pt.x, pt.y - 9 * s);
      ctx.stroke();
    }
    hits.push({ id: p.id, x: pt.x, y: pt.y - 8 * s });
  }
  ctx.font = '500 12px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  for (const g of GROUPS) {
    const p = project(g.x - 13, g.y - 13, 0.5);
    ctx.fillStyle = '#0b201cbb';
    ctx.fillRect(p.x - 48, p.y - 12, 96, 23);
    ctx.fillStyle = '#d4d9b9';
    ctx.fillText(g.name, p.x, p.y + 4);
  }
  if (moving || model.dirty.size) requestDraw();
}
function refreshList() {
  const s = $('page-select');
  s.replaceChildren();
  for (const p of model.pages.values()) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = GROUPS[p.group].name + ' / ' + p.title;
    s.append(o);
  }
  s.value = selected;
  $('count').textContent = String(model.pages.size);
}
function detail() {
  const p = model.pages.get(selected);
  for (const id of ['edit', 'delete'] as const) $(id).disabled = !p;
  if (!p) {
    $('title').textContent = '尚无笔记';
    $('notebook').textContent = '新增一篇，让土地生长';
    for (const id of ['words', 'updated', 'links']) $(id).textContent = '—';
    $('caption').textContent = '新增一篇 Page，继续探索。';
    return;
  }
  $('notebook').textContent = GROUPS[p.group].name;
  $('title').textContent = p.title || '';
  $('words').textContent = p.words.toLocaleString();
  $('updated').textContent =
    Math.floor(model.age(p)) === 0 ? '今天' : Math.floor(model.age(p)) + ' 天前';
  $('links').textContent = model.related(selected).length + ' 篇';
  $('page-select').value = selected;
  $('caption').textContent = p.title + ' · ' + (model.age(p) < 30 ? '近期活跃' : '静静等待重访');
}
function changedEvent(text: string) {
  $('dirty').textContent = model.dirty.size.toLocaleString();
  $('event').textContent = text;
  $('day').textContent = '第 ' + model.day + ' 天';
  refreshList();
  detail();
  requestDraw();
}
function select(id: string) {
  selected = id;
  detail();
  requestDraw();
}
function add() {
  const g = serial % 5,
    id = 'added-page-' + ++serial,
    ps = [...model.pages.values()].filter((p) => p.group === g);
  model.upsert({
    id,
    group: g,
    title: '新生的想法 ' + serial,
    words: 1700,
    updated: model.now + model.day * DAY,
    links: ps.length ? [ps[serial % ps.length].id] : [],
  });
  selected = id;
  changedEvent('新增「新生的想法 ' + serial + '」；附近土地生长，其余地标保持原位。');
}
function edit() {
  const p = model.pages.get(selected);
  if (!p) return;
  model.upsert({ ...p, words: p.words + 1800, updated: model.now + model.day * DAY });
  changedEvent('「' + p.title + '」增加 1,800 字符。山丘抬升，附近恢复绿意。');
}
function advance() {
  model.advance(7);
  changedEvent('时间经过 7 天。活跃度渐变，已有山丘和地标位置保持稳定。');
}
$('add').onclick = add;
$('edit').onclick = edit;
$('advance').onclick = advance;
$('delete').onclick = () => {
  const p = model.pages.get(selected);
  if (!p) return;
  model.remove(selected);
  selected = model.pages.keys().next().value || '';
  changedEvent('移除「' + p.title + '」；附近山丘回落，关联路径同步移除。');
};
$('page-select').onchange = (e) => select((e.target as HTMLSelectElement).value);
$('show-links').onchange = requestDraw;
$('play').onclick = () => {
  if (auto) {
    clearInterval(auto);
    auto = undefined;
    $('play').textContent = '自动演示';
    $('play').setAttribute('aria-pressed', 'false');
  } else {
    let tick = 0;
    auto = window.setInterval(() => {
      if (document.hidden) return;
      tick++;
      if (tick % 4 === 0) advance();
      else if (tick % 3 === 0) add();
      else {
        const ps = [...model.pages.keys()];
        if (ps.length) select(ps[hash('tick' + tick) % ps.length]);
        edit();
      }
    }, 2400);
    $('play').textContent = '暂停演示';
    $('play').setAttribute('aria-pressed', 'true');
  }
};
function setZoom(z: number) {
  zoom = Math.max(0.65, Math.min(3, z));
  requestDraw();
}
$('plus').onclick = () => setZoom(zoom * 1.2);
$('minus').onclick = () => setZoom(zoom / 1.2);
$('home').onclick = () => {
  zoom = 1;
  panX = panY = 0;
  requestDraw();
};
let drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, px: panX, py: panY, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 4) drag.moved = true;
  if (drag.moved) {
    panX = drag.px + dx;
    panY = drag.py + dy;
    requestDraw();
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved) {
    const r = canvas.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top;
    let best = null,
      d = 22;
    for (const h of hits) {
      const v = Math.hypot(h.x - x, h.y - y);
      if (v < d) {
        d = v;
        best = h;
      }
    }
    if (best) select(best.id);
  }
  drag = null;
});
canvas.addEventListener('pointercancel', () => {
  drag = null;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    setZoom(zoom * Math.exp(-e.deltaY * 0.001));
  },
  { passive: false },
);
new ResizeObserver(resize).observe(canvas);
refreshList();
detail();
$('dirty').textContent = String(STRIDE * STRIDE);
$('progress').textContent = '初始地形已生成 · 点击写入，观察局部变化';
const diagnostics = { model, TerrainModel, pointFor, select, add, edit, advance };
declare global {
  interface Window {
    pageTerrainDemo: typeof diagnostics;
  }
}
window.pageTerrainDemo = diagnostics;
