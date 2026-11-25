import { required } from '../../src/presentation/elements.js';
import type { CaretFollower, Point } from '../../src/presentation/types.js';
import { GamifyView } from '../../src/presentation/GamifyView.js';
import PREVIEW_CSS from '../../src/presentation/styles.css';

const editor = required(document, '.protyle-wysiwyg'),
  writing = required(document, '#writing');
const slider = required(document, 'input'),
  output = required(document, 'output'),
  status = required(document, '#status');
const view = new GamifyView({
  css: PREVIEW_CSS,
  async onConnect() {},
  onSound() {},
});
view.soundEnabled = false;
// Preview-only treatment: the chosen beam without rings or particle bursts.
const variantStyles = document.createElement('style');
variantStyles.textContent = `
.editing-glow[data-variant="beam"]:before{width:2px;height:var(--caret-height,20px);margin:0;transform:translate(-1px,-50%);border-radius:2px;opacity:calc(.65 + var(--breath-opacity,.25)*.35);box-shadow:0 0 4px currentColor,0 0 9px currentColor}
.editing-glow[data-variant="beam"]:after{width:8px;height:calc(var(--caret-height,20px) + 6px);margin:0;transform:translate(-4px,-50%) scaleX(var(--breath-scale,1));border:0;border-radius:8px;background:currentColor;filter:blur(5px);opacity:var(--breath-opacity,.25)}
.editing-glow.maintenance-tint{color:#d5c1ff!important;transition:color .5s}
.editing-glow.condense:after{width:var(--condense-width,8px);filter:blur(var(--condense-blur,5px));transform:translate(calc(var(--condense-width,8px)/-2),-50%) scaleX(var(--breath-scale,1))}
.beam-sweep{position:absolute;left:var(--origin-x);top:var(--origin-y);width:3px;height:var(--caret-height,20px);transform:translate(-1.5px,-50%);background:linear-gradient(to top,transparent 5%,#ffe3a0 40%,#fffbe7 50%,transparent 65%);background-size:100% 300%;border-radius:2px;box-shadow:0 0 5px #ffe3a0;animation:beam-sweep 850ms ease-out both;pointer-events:none}
.beam-sweep.purple{background-image:linear-gradient(to top,transparent 5%,#bda2ef 40%,#efe6ff 50%,transparent 65%);box-shadow:0 0 4px #d5c1ff}
.beam-trace{position:fixed;width:2px;border-radius:2px;background:currentColor;opacity:.18;pointer-events:none;animation:trace-fade 200ms ease-out both}
@keyframes beam-sweep{0%{background-position:0 0;opacity:0}15%{opacity:1}100%{background-position:0 100%;opacity:0}}
@keyframes trace-fade{to{opacity:0}}
@media(prefers-reduced-motion:reduce){.beam-sweep,.beam-trace{display:none}}
`;
view.root.append(variantStyles);
let variantFrame: number;
const options: Record<string, boolean> = {
  condense: false,
  sweep: false,
  purple: false,
  rest: false,
  wake: false,
  trail: false,
};
const descriptions = {
  condense: ['光晕凝聚', '接近奖励时柔光收拢。', '靠近'],
  sweep: ['到账上行光', '暖光从竖线底端升起。', '到账'],
  purple: ['维护紫光', '淡紫色从底端融入。', '维护'],
  rest: ['停顿余温', '停止后呼吸减慢，再淡出。', '停顿'],
  wake: ['恢复苏醒', '暂停后柔光渐渐展开。', '苏醒'],
  trail: ['短暂光痕', '移动光标时留下极短光痕。', '移动'],
};
let lastActivity = performance.now(),
  wakeStarted = 0,
  previewRest = false,
  trailLast = 0;
function addSweep(follower: CaretFollower, purple = false) {
  const light = document.createElement('i');
  light.className = 'beam-sweep' + (purple ? ' purple' : '');
  follower.element.append(light);
  view.later(() => light.remove(), 900);
}
function startActivity() {
  const now = performance.now();
  if (options.wake && (previewRest || now - lastActivity > 2300)) wakeStarted = now;
  lastActivity = now;
  previewRest = false;
}
function previewEffect(key: string) {
  focusWriting();
  if (key === 'condense') updateProgress(0.95);
  else if (key === 'sweep') reward();
  else if (key === 'purple') required(document, '#maintenance').click();
  else if (key === 'rest') {
    updateProgress(progress);
    lastActivity = performance.now() - 2500;
    previewRest = true;
    view.caretFollower!.until = performance.now() + 3500;
  } else if (key === 'wake') {
    wakeStarted = performance.now();
    lastActivity = performance.now();
    updateProgress(progress);
  } else if (key === 'trail') {
    const selection = getSelection()!,
      range = selection.getRangeAt(0);
    const node = range.startContainer;
    if (node instanceof Text && node.length) {
      range.setStart(node, Math.max(0, range.startOffset - 5));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    updateProgress(progress);
    status.textContent = '用方向键移动光标，或点击文字中的不同位置。';
  }
}
for (const [key, [name, description, action]] of Object.entries(descriptions)) {
  const row = document.createElement('div');
  row.className = 'effect-option';
  row.innerHTML = `<input id="effect-${key}" type="checkbox" aria-label="${name}"><label for="effect-${key}"><strong>${name}</strong><small>${description}</small></label><button type="button">试${action}</button>`;
  required(row, 'input').onchange = (event) => {
    options[key] = (event.target as HTMLInputElement).checked;
    focusWriting();
    updateProgress(progress);
  };
  required(row, 'button').onclick = () => {
    options[key] = true;
    required(row, 'input').checked = true;
    previewEffect(key);
  };
  required(document, '#effects').append(row);
}
required(document, '#baseline').onclick = () => {
  for (const key of Object.keys(options)) {
    options[key] = false;
    (required(document, '#effect-' + key) as HTMLInputElement).checked = false;
  }
  wakeStarted = 0;
  previewRest = false;
  focusWriting();
  updateProgress(progress);
  status.textContent = '基础版：荧光竖线、呼吸与渐变色。';
};
required(document, '#all-effects').onclick = () => {
  for (const key of Object.keys(options)) {
    options[key] = true;
    (required(document, '#effect-' + key) as HTMLInputElement).checked = true;
  }
  focusWriting();
  startActivity();
  updateProgress(progress);
  status.textContent = '全部开启。可以逐项关闭，比较哪一种更舒服。';
};
const tracePoints = new WeakMap<CaretFollower, Point>();
view.caretFeedback = (point, gold = false) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const follower = view.followEditingPoint(point, gold);
  if (!gold) follower.maintenanceUntil = performance.now() + 900;
  if (gold && options.sweep) addSweep(follower);
  else if (!gold && options.purple) addSweep(follower, true);
};
function updateVariantFrame() {
  const follower = view.caretFollower;
  const tracePoint = follower ? tracePoints.get(follower) : undefined;
  if (follower) {
    follower.element.dataset.variant = 'beam';
    follower.element.classList.toggle(
      'maintenance-tint',
      (follower.maintenanceUntil || 0) > performance.now() &&
        follower.goldUntil < performance.now(),
    );
    const selection = getSelection()!;
    const rect = selection.rangeCount
      ? Array.from(selection.getRangeAt(0).getClientRects()).find((rect) => rect.height > 0)
      : null;
    follower.element.style.setProperty(
      '--caret-height',
      `${Math.min(40, Math.max(12, rect?.height || 18))}px`,
    );
  }
  if (follower) {
    const now = performance.now(),
      idle = now - lastActivity;
    follower.element.classList.toggle('condense', options.condense);
    follower.element.style.setProperty('--condense-width', `${8 - 4 * follower.approach}px`);
    follower.element.style.setProperty('--condense-blur', `${5 - 2 * follower.approach}px`);
    if (options.rest && idle > 1800) {
      const slow = Math.min(1, (idle - 1800) / 3000);
      follower.element.style.setProperty('--breath-opacity', String(0.22 - slow * 0.12));
      follower.element.style.setProperty(
        '--breath-scale',
        String(0.95 - slow * 0.2 + 0.025 * Math.sin(now / 900)),
      );
    }
    if (options.wake && now - wakeStarted < 650) {
      const fraction = Math.max(0, (now - wakeStarted) / 650);
      follower.element.style.opacity = String(0.15 + 0.85 * fraction);
      follower.element.style.setProperty('--breath-scale', String(0.6 + 0.4 * fraction));
    }
    if (
      options.trail &&
      !follower.element.hidden &&
      now - trailLast > 35 &&
      tracePoint &&
      Math.hypot(follower.x - tracePoint.x, follower.y - tracePoint.y) > 2
    ) {
      const trace = document.createElement('i');
      trace.className = 'beam-trace';
      trace.style.cssText = `left:${follower.x}px;top:${follower.y - 9}px;height:18px;color:${follower.element.style.color}`;
      required(view.root, '.particles').append(trace);
      view.later(() => trace.remove(), 220);
      trailLast = now;
    }
    tracePoints.set(follower, { x: follower.x, y: follower.y });
  }
  document.body.classList.toggle(
    'preview-custom-caret',
    !!follower &&
      !follower.element.hidden &&
      Number(follower.element.style.opacity || 1) > 0.15 &&
      !!view.caretPoint(),
  );
  variantFrame = requestAnimationFrame(updateVariantFrame);
}
variantFrame = requestAnimationFrame(updateVariantFrame);
let progress = 0.35,
  demoIndex = 0,
  composing = false;
let savedRange: Range | null = null,
  demoTimer: number | undefined;
function saveSelection() {
  const selection = getSelection()!;
  if (selection.rangeCount && editor.contains(selection.anchorNode))
    savedRange = selection.getRangeAt(0).cloneRange();
}
document.addEventListener('selectionchange', saveSelection);
function focusWriting() {
  editor.focus({ preventScroll: true });
  const selection = getSelection()!;
  selection.removeAllRanges();
  if (savedRange && editor.contains(savedRange.startContainer)) selection.addRange(savedRange);
  else {
    const range = document.createRange();
    const walker = document.createTreeWalker(writing, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    while (walker.nextNode()) last = walker.currentNode;
    if (last) range.setStart(last, last.textContent?.length || 0);
    else range.selectNodeContents(writing);
    range.collapse(false);
    selection.addRange(range);
  }
  saveSelection();
  const bounds = editor.getBoundingClientRect();
  if (bounds.top < 0 || bounds.bottom > innerHeight)
    editor.scrollIntoView({ block: 'center', behavior: 'instant' });
}
function updateProgress(value: number) {
  progress = Math.max(0, Math.min(1, value));
  slider.value = String(Math.round(progress * 100));
  output.value = Math.round(progress * 100) + '%';
  view.editingFeedback({ progress });
}
function stopDemo() {
  clearInterval(demoTimer);
  demoTimer = undefined;
  required(document, '#demo').setAttribute('aria-pressed', 'false');
  required(document, '#demo').textContent = '播放自动演示';
}
function reward() {
  view.rewardFeedback(1, { caret: true });
  updateProgress(0);
  status.textContent = '竖线泛起金色，缓缓回落，然后开始新一轮。';
}
editor.addEventListener('pointerdown', () => {
  if (demoTimer) {
    stopDemo();
    status.textContent = '现在交给你，随意写几句话。';
  }
});
editor.addEventListener('compositionstart', () => {
  composing = true;
});
function typed() {
  startActivity();
  updateProgress(progress + 0.025);
  if (progress >= 1) reward();
  else status.textContent = '正在积累。停一会儿，光会慢慢安静下来。';
}
editor.addEventListener('input', (event) => {
  saveSelection();
  if (!composing && !(event as InputEvent).isComposing) typed();
});
editor.addEventListener('compositionend', () => {
  composing = false;
  typed();
});
slider.addEventListener('input', () => {
  stopDemo();
  focusWriting();
  updateProgress(Number(slider.value) / 100);
  status.textContent =
    progress > 0.85 ? '快要绽放了：呼吸稍快，微微泛金。' : '亮度和呼吸连续变化，不会突然跳档。';
});
required(document, '#reward').onclick = () => {
  stopDemo();
  focusWriting();
  reward();
};
required(document, '#maintenance').onclick = () => {
  stopDemo();
  focusWriting();
  view.maintainBlock({ weight: 2 });
  updateProgress(progress);
  status.textContent = '竖线短暂泛起淡紫色，轻轻回应一次维护。';
};
required(document, '#theme').onclick = (event) => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  (event.target as HTMLElement).textContent = light ? '切换深色' : '切换浅色';
  focusWriting();
  updateProgress(progress);
};
required(document, '#demo').onclick = () => {
  if (demoTimer) {
    stopDemo();
    status.textContent = '演示已暂停。也可以直接编辑文字。';
    return;
  }
  focusWriting();
  const text = '今天的灵感，从一个小小的念头开始。慢慢写下去，微光也在悄悄积累。';
  required(document, '#demo').setAttribute('aria-pressed', 'true');
  required(document, '#demo').textContent = '暂停自动演示';
  status.textContent = '自动演示中：积累 → 靠近 → 绽放 → 回落。';
  demoTimer = window.setInterval(() => {
    if (document.hidden) return;
    const selection = getSelection()!;
    if (!selection.rangeCount || !editor.contains(selection.anchorNode)) {
      stopDemo();
      return;
    }
    const range = selection.getRangeAt(0),
      node = document.createTextNode(text[demoIndex++ % text.length]);
    range.deleteContents();
    range.insertNode(node);
    range.setStart(node, node.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    saveSelection();
    startActivity();
    updateProgress(progress + 0.035);
    if (progress >= 1) reward();
    if (demoIndex % text.length === 0) {
      stopDemo();
      status.textContent = '演示结束。你可以继续写，或拖动滑杆比较。';
    }
  }, 180);
};
window.addEventListener('pagehide', () => {
  stopDemo();
  cancelAnimationFrame(variantFrame);
  document.body.classList.remove('preview-custom-caret');
  view.destroy();
});
focusWriting();
updateProgress(progress);
