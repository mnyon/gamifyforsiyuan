// Reward tint study: purple afterglow for old-document (maintenance) rewards,
// gold for new progress, one undifferentiated green for writing and deleting.
// Preview-only: the plugin source stays untouched. The purple afterglow is
// routed through the follower's existing purple term, so what you see here is
// exactly what a small plugin change would produce.
import { required } from '../../src/presentation/elements.js';
import type { Point } from '../../src/presentation/types.js';
import { GamifyView } from '../../src/presentation/GamifyView.js';
import PREVIEW_CSS from '../../src/presentation/styles.css';

const editor = required(document, '.protyle-wysiwyg'),
  writing = required(document, '#writing');
const status = required(document, '#status');
const view = new GamifyView({
  css: PREVIEW_CSS,
  async onConnect() {},
  onSound() {},
});
view.soundEnabled = false;

let savedRange: Range | null = null;
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
}

// Candidate treatment: a maintenance reward keeps the full reward ceremony
// but its caret afterglow uses the purple term instead of the gold one.
let tint: 'gold' | 'purple' = 'gold';
const baseCaretFeedback = view.caretFeedback.bind(view);
view.caretFeedback = (point: Point, gold = false, weight = 0) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    view.stopCaretFollower();
    return;
  }
  if (gold && tint === 'purple') {
    const follower = view.followEditingPoint(point, true);
    follower.goldUntil = 0;
    follower.maintenanceUntil = performance.now() + 1800;
    if (follower.element.querySelectorAll('.beam-sweep').length < 2) {
      const light = document.createElement('i');
      light.className = 'beam-sweep purple';
      follower.element.append(light);
      view.later(() => light.remove(), 900);
    }
    return;
  }
  baseCaretFeedback(point, gold, weight);
};

let progress = 0;
editor.addEventListener('input', () => {
  saveSelection();
  progress = Math.min(1, progress + 0.03);
  view.editingFeedback({ progress });
  status.textContent = '输入或删除，光都是同一种绿——不评判动作方向。';
});

required(document, '#gold').onclick = () => {
  tint = 'gold';
  focusWriting();
  view.rewardFeedback(1.25, { caret: true });
  status.textContent = '普通奖励（新进展）：金色余晖，缓缓回落。';
};
required(document, '#purple').onclick = () => {
  tint = 'purple';
  focusWriting();
  view.rewardFeedback(0.8, { caret: true });
  status.textContent = '旧文档奖励（照料已有笔记）：紫色余晖，缓缓回落。';
};
required(document, '#maintenance').onclick = () => {
  focusWriting();
  view.maintainBlock({ weight: 2 });
  status.textContent = '对照：既有的旧块维护反馈，紫色一闪（1.3 秒）。';
};
focusWriting();
view.editingFeedback({ progress: 0.2 });
