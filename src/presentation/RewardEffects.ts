import { required } from './elements.js';
import type { GamifyView } from './GamifyView.js';
import type { EffectEntry, FeedbackContext, Point } from './types.js';

/**
 * Reward and completion feedback: line effects, toasts, sparkles and the
 * coin flight. Caret coordination goes through the host's delegating methods
 * so previews can override them.
 */
export class RewardEffects {
  effects = new Set<EffectEntry>();
  toastTimer?: number;
  constructor(private readonly host: GamifyView) {}
  visibleTodo({ blockId, element }: FeedbackContext = {}) {
    const candidates = element?.isConnected
      ? [element]
      : blockId
        ? document.querySelectorAll<HTMLElement>(`[data-node-id="${CSS.escape(blockId)}"]`)
        : [];
    return [...candidates].find((node) => {
      const r = node.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth
      );
    });
  }
  completeTodo(context: FeedbackContext = {}) {
    if (this.effects.size >= 16) return;
    const element = this.visibleTodo(context);
    const label = '完成了一件事';
    if (!element) {
      this.feedback(label, false, context.point);
      return;
    }
    this.host.chime(false);
    required(this.host.root, '.announcer').textContent = '完成了一件事';
    const field = required(this.host.root, '.line-effects');
    // These overlays never become children of the editor or change note content.
    const effect = document.createElement('div');
    effect.className = 'line-complete';
    effect.innerHTML =
      '<span class="line-sweep"></span><span class="success-mark"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="m10 16 4 4 8-9"/></svg></span><span class="line-label">完成了一件事</span>';
    required(effect, '.line-label').textContent = label;
    field.append(effect);
    const entry: EffectEntry = { effect, element, blockId: context.blockId, frame: 0 };
    this.effects.add(entry);
    const position = () => {
      const target = this.visibleTodo(entry);
      if (!target) {
        effect.hidden = true;
        return;
      }
      entry.element = target;
      const r = target.getBoundingClientRect();
      const action = target.querySelector('.protyle-action--task')?.getBoundingClientRect();
      const height = Math.min(54, r.height),
        cy = action ? action.top + action.height / 2 - r.top : height / 2;
      effect.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${height}px;--cy:${cy}px;--cx:${action ? action.left + action.width / 2 - r.left : 14}px;--label-x:${Math.max(40, Math.min(r.width - 146, 180))}px`;
    };
    position();
    const r = effect.getBoundingClientRect();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      this.sparkles({ x: r.left + 18, y: r.top + Math.min(27, r.height / 2) }, 14);
    const follow = () => {
      if (this.effects.has(entry)) {
        position();
        entry.frame = requestAnimationFrame(follow);
      }
    };
    entry.frame = requestAnimationFrame(follow);
    this.host.later(() => {
      this.effects.delete(entry);
      cancelAnimationFrame(entry.frame);
      effect.remove();
    }, 1350);
  }
  cancelTodo(blockId: string) {
    for (const entry of [...this.effects]) {
      if (entry.blockId !== blockId) continue;
      this.effects.delete(entry);
      cancelAnimationFrame(entry.frame);
      entry.effect.remove();
    }
  }
  rewardFeedback(gold: number | null | undefined, context: FeedbackContext = {}) {
    const host = this.host;
    const known = typeof gold === 'number' && Number.isFinite(gold) && gold >= 0;
    const message =
      (host.testMode ? '模拟' : '') +
      (known ? `获得 ${gold.toFixed(2)} 金币` : '已获得 Habitica 奖励');
    const field = required(host.root, '.particles');
    const cardRect = host.card.getBoundingClientRect();
    const source = this.visibleTodo(context)?.getBoundingClientRect();
    const caret = context.caret ? host.caretPoint(context) : null;
    const origin =
      caret ||
      (source && !context.caret
        ? {
            x: Math.min(innerWidth - 90, source.left + Math.min(190, source.width / 2)),
            y: Math.max(35, source.top + Math.min(28, source.height / 2)),
          }
        : host.card.hidden
          ? { x: innerWidth - 150, y: innerHeight - 140 }
          : { x: cardRect.left + cardRect.width / 2, y: cardRect.top + 145 });
    // Editing and TODO rewards share the same settlement feedback. The caret
    // also keeps its brief gold sweep; approaching a reward never calls here.
    if (caret) {
      required(host.root, '.announcer').textContent = message;
      host.caretFeedback(caret, true);
    }
    this.feedback(message, true, undefined, false);
    required(host.root, '.toast').classList.add('coin-toast');
    const goldNode = !host.card.hidden && !host.isSettings ? required(host.root, '.gold') : null;
    const dock = document.querySelector('[data-type="gamify-for-siyuancompanion"]');
    const destination = (goldNode || dock)?.getBoundingClientRect();
    const end = destination?.width
      ? { x: destination.left + destination.width / 2, y: destination.top + destination.height / 2 }
      : { x: innerWidth - 25, y: innerHeight - 60 };
    const loot = document.createElement('div');
    loot.className = 'loot-number';
    loot.textContent =
      (host.testMode ? '模拟 ' : '') + (known ? `+${gold.toFixed(2)} 金币` : '获得奖励');
    loot.style.cssText = `left:${Math.max(85, Math.min(innerWidth - 100, origin.x))}px;top:${origin.y - 22}px`;
    field.append(loot);
    host.later(() => loot.remove(), 1800);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.sparkles(origin, 24, true);
    const available = Math.max(0, 96 - field.childElementCount);
    for (let i = 0; i < Math.min(16, available); i++) {
      const coin = document.createElement('i');
      coin.className = 'coin-flight';
      coin.innerHTML = '<span>✧</span>';
      const angle = i * 2.39996,
        radius = 32 + (i % 5) * 12;
      coin.style.cssText = `left:${origin.x}px;top:${origin.y}px;--burst-x:${Math.cos(angle) * radius}px;--burst-y:${Math.sin(angle) * radius - 45}px;--land-x:${end.x - origin.x}px;--land-y:${end.y - origin.y}px;--coin-delay:${i * 28}ms;--turn:${i * 70}deg`;
      field.append(coin);
      host.later(() => coin.remove(), 1900 + i * 28);
    }
    if (goldNode)
      host.later(() => {
        const animation = goldNode.animate(
          [
            { color: '#fff2bb', textShadow: '0 0 14px #ffd166', transform: 'scale(1.2)' },
            { color: 'inherit', textShadow: 'none', transform: 'scale(1)' },
          ],
          { duration: 550 },
        );
        animation.finished.catch(() => {});
      }, 1000);
  }
  sparkles(point: Point, count = 9, gold = false) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const field = required(this.host.root, '.particles');
    for (let i = 0; i < count; i++) {
      if (field.childElementCount > 72) break;
      const particle = document.createElement('i');
      particle.className = 'spark';
      particle.textContent = i % 3 ? '✦' : '·';
      particle.style.cssText = `left:${point.x}px;top:${point.y}px;--dx:${Math.cos(i * 2.4) * (gold ? 100 : 56)}px;--dy:${Math.sin(i * 2.4) * (gold ? 85 : 42) - 24}px;--delay:${i * 8}ms;color:${gold ? ['#ffe7a0', '#ffd166', '#fff9d4'][i % 3] : ['#a8e8c9', '#d5c1ff', '#e4fff1'][i % 3]}`;
      field.append(particle);
      this.host.later(() => particle.remove(), 1200);
    }
  }
  feedback(message: string, celebrate = false, point?: Point, emitStars = true) {
    const host = this.host;
    const toast = required(host.root, '.toast');
    required(toast, 'span').textContent = message;
    toast.hidden = false;
    toast.classList.toggle('celebrate', celebrate);
    toast.classList.remove('coin-toast');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2800);
    host.chime(celebrate);
    if (!emitStars) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = host.card.getBoundingClientRect(),
      x = point?.x ?? (host.card.hidden ? innerWidth - 44 : rect.left + rect.width / 2),
      y = point?.y ?? (host.card.hidden ? innerHeight - 70 : rect.top + 155);
    this.sparkles({ x, y }, celebrate ? 30 : 9);
  }
  destroy() {
    clearTimeout(this.toastTimer);
    for (const entry of this.effects) cancelAnimationFrame(entry.frame);
    this.effects.clear();
  }
}
