import { required } from './elements.js';
import type { GamifyView } from './GamifyView.js';
import type { CaretFollower, FeedbackContext, Point } from './types.js';

/**
 * The editing-light subsystem: caret geometry measurement, the breathing
 * follower and its native-caret coordination. Holds the GamifyView as host
 * for the particle layer, the shared timer registry and lifecycle.
 */
export class CaretLight {
  follower: CaretFollower | null = null;
  nativeCaretStyle?: HTMLStyleElement;
  caretGeometry?: { height: number };
  approach = 0;
  constructor(private readonly host: GamifyView) {}
  maintainBlock(context: FeedbackContext = {}) {
    const point = this.point(context);
    if (point) this.feedback(point, false, context.weight);
  }
  editingFeedback({ blockId, progress = 0 }: FeedbackContext & { progress?: number } = {}) {
    this.approach = Math.max(0, Math.min(1, progress));
    const point = this.point({ blockId });
    if (!point || this.host.destroyed || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const follower = this.follow(point, false);
    const now = performance.now();
    if (now - follower.activityAt > 2300) follower.wakeAt = now;
    follower.activityAt = now;
    // A pause gently fades the light; stored progress is unaffected.
    follower.until = performance.now() + 6500;
  }
  point({ blockId }: FeedbackContext = {}): Point | null {
    if (!document.hasFocus()) return null;
    const selection = document.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return null;
    const range = selection.getRangeAt(0).cloneRange(),
      node = range.startContainer;
    const element = node instanceof Element ? node : node.parentElement;
    const block = element?.closest<HTMLElement>('[data-node-id]');
    const editor = element?.closest('.protyle-wysiwyg');
    if (!editor || (document.activeElement !== editor && !editor.contains(document.activeElement)))
      return null;
    if (
      !element?.closest('.protyle-wysiwyg') ||
      element.closest('[contenteditable="false"]') ||
      (blockId && block?.dataset.nodeId !== blockId)
    )
      return null;
    let rect: { left: number; top: number; height: number } | undefined = [
      ...range.getClientRects(),
    ].find((r) => r.height > 0);
    // Some WebViews return no rectangle for a collapsed range. Measure the
    // adjacent character without inserting markers or changing the selection.
    if (!rect && node.nodeType === 3 && (node.textContent || '').length) {
      const offset = range.startOffset,
        next = offset === 0;
      range.setStart(node, next ? 0 : offset - 1);
      range.setEnd(node, next ? 1 : offset);
      const adjacent = [...range.getClientRects()].find((r) => r.height > 0);
      if (adjacent)
        rect = {
          left: next ? adjacent.left : adjacent.right,
          top: adjacent.top,
          height: adjacent.height,
        };
    }
    if (!rect) {
      // Empty paragraphs have no adjacent character to measure.
      if (element.textContent?.replace(/[\s\u200b]/g, '')) return null;
      const bounds = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      rect = {
        left: bounds.left + parseFloat(style.paddingLeft || '0'),
        top: bounds.top + parseFloat(style.paddingTop || '0'),
        height: parseFloat(style.lineHeight) || parseFloat(style.fontSize) || 16,
      };
    }
    const x = rect.left,
      y = rect.top + rect.height / 2;
    const viewport = globalThis.visualViewport;
    const left = viewport?.offsetLeft || 0,
      top = viewport?.offsetTop || 0;
    if (
      !Number.isFinite(x + y) ||
      x < left ||
      x > left + (viewport?.width || innerWidth) ||
      y < top ||
      y > top + (viewport?.height || innerHeight)
    )
      return null;
    const bounds = block?.getBoundingClientRect();
    if (
      bounds &&
      (x < bounds.left - 2 || x > bounds.right + 2 || y < bounds.top || y > bounds.bottom)
    )
      return null;
    for (
      let parent = block?.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent),
        bounds = parent.getBoundingClientRect();
      if (
        /(auto|scroll|hidden|clip)/.test(style.overflowY) &&
        (y < bounds.top || y > bounds.bottom)
      )
        return null;
      if (
        /(auto|scroll|hidden|clip)/.test(style.overflowX) &&
        (x < bounds.left || x > bounds.right)
      )
        return null;
    }
    this.caretGeometry = { height: Math.max(12, Math.min(40, rect.height)) };
    return { x, y };
  }
  feedback(point: Point, gold = false, weight = 0) {
    if (this.host.destroyed) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this.stop();
      return;
    }
    const follower = this.follow(point, gold);
    if (!gold) follower.maintenanceUntil = performance.now() + 1300;
    // Bound simultaneous sweeps when an offline queue delivers several rewards.
    if (follower.element.querySelectorAll('.beam-sweep').length >= 2) return;
    const light = document.createElement('i');
    light.className = 'beam-sweep' + (gold ? '' : ' purple');
    follower.element.append(light);
    this.host.later(() => light.remove(), 900);
  }
  follow(point: Point, gold: boolean): CaretFollower {
    const now = performance.now();
    if (this.follower) {
      this.follower.until = Math.max(this.follower.until, now + (gold ? 3000 : 1600));
      if (gold) this.follower.goldUntil = now + 1800;
      return this.follower;
    }
    const element = document.createElement('div');
    element.className = 'editing-glow' + (gold ? ' gold' : '');
    element.setAttribute('aria-hidden', 'true');
    element.style.setProperty('--origin-x', `${point.x}px`);
    element.style.setProperty('--origin-y', `${point.y}px`);
    required(this.host.root, '.particles').append(element);
    const follower: CaretFollower = {
      frame: 0,
      element,
      origin: point,
      x: point.x,
      y: point.y,
      last: now,
      until: now + (gold ? 3000 : 1600),
      goldUntil: gold ? now + 1800 : 0,
      phase: 0,
      approach: this.approach || 0,
      listeners: [],
      activityAt: now,
      wakeAt: now,
    };
    this.follower = follower;
    const listen = (target: EventTarget, name: string, handler: EventListener) => {
      target.addEventListener(name, handler, { capture: true, passive: true });
      follower.listeners.push([target, name, handler]);
    };
    // Leave native composition rendering and selection handles untouched.
    listen(document, 'compositionstart', () => {
      follower.composing = true;
      if (this.nativeCaretStyle?.sheet) this.nativeCaretStyle!.sheet!.disabled = true;
      element.hidden = true;
    });
    listen(document, 'compositionend', () => {
      follower.composing = false;
    });
    this.nativeCaretStyle ||= document.createElement('style');
    this.nativeCaretStyle.textContent =
      '.protyle-wysiwyg:focus, .protyle-wysiwyg :focus { caret-color: transparent !important; }';
    if (!this.nativeCaretStyle.isConnected) document.head.append(this.nativeCaretStyle);
    this.nativeCaretStyle!.sheet!.disabled = true;
    const frame = (time: number) => {
      if (this.host.destroyed || this.follower !== follower) return;
      if (time >= follower.until || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.stop();
        return;
      }
      const target = this.point();
      const visible =
        target &&
        !follower.composing &&
        document.hasFocus() &&
        document.visibilityState !== 'hidden';
      element.hidden = !visible;
      if (!visible) this.nativeCaretStyle!.sheet!.disabled = true;
      const dt = Math.min(50, Math.max(0, time - follower.last));
      if (visible) {
        const distance = Math.hypot(target.x - follower.x, target.y - follower.y);
        // Frame-rate independent easing. Large jumps snap so feedback never
        // sweeps across unrelated panes when switching blocks or scrolling.
        const amount = distance > 240 || time - follower.last > 150 ? 1 : 1 - Math.exp(-dt / 38);
        follower.x += (target.x - follower.x) * amount;
        follower.y += (target.y - follower.y) * amount;
        element.style.transform = `translate3d(${follower.x - follower.origin.x}px,${follower.y - follower.origin.y}px,0)`;
        // Integrating phase keeps the breath continuous as progress changes.
        // Easing the intensity also gives each reward a soft landing/reset.
        follower.approach += ((this.approach || 0) - follower.approach) * (1 - Math.exp(-dt / 650));
        const progress = follower.approach;
        const idle = Math.max(0, Math.min(1, (time - follower.activityAt - 1800) / 3000));
        follower.phase += (dt * Math.PI * 2) / (3200 - 1200 * progress + idle * 2600);
        const breath = (1 - Math.cos(follower.phase)) / 2;
        const afterglow = Math.max(0, Math.min(1, (follower.goldUntil - time) / 1800));
        const warmth = Math.max(Math.max(0, (progress - 0.65) / 0.35) * 0.45, afterglow);
        const purple =
          Math.max(0, Math.min(1, ((follower.maintenanceUntil || 0) - time) / 1300)) *
          (1 - afterglow);
        const color = [181, 240, 216].map((channel, index) => {
          const warm = channel + ([255, 227, 160][index] - channel) * warmth;
          return Math.round(warm + ([213, 193, 255][index] - warm) * purple);
        });
        element.style.color = `rgb(${color.join(',')})`;
        element.style.setProperty(
          '--breath-scale',
          String(0.8 + breath * (0.12 + progress * 0.32) + afterglow * 0.18),
        );
        element.style.setProperty(
          '--breath-opacity',
          String(0.12 + progress * 0.16 + breath * (0.13 + progress * 0.2) + afterglow * 0.12),
        );
        element.style.setProperty('--caret-height', `${this.caretGeometry?.height || 18}px`);
        element.style.setProperty('--condense-width', `${8 - 4 * progress}px`);
        element.style.setProperty('--condense-blur', `${5 - 2 * progress}px`);
        const wake = Math.min(1, Math.max(0, (time - follower.wakeAt) / 650));
        const opacity =
          Math.min(1, Math.max(0, (follower.until - time) / 1400)) *
          (0.15 + 0.85 * wake) *
          (1 - idle * 0.35);
        element.style.opacity = String(opacity);
        this.nativeCaretStyle!.sheet!.disabled = opacity < 0.15;
      }
      follower.last = time;
      follower.frame = requestAnimationFrame(frame);
    };
    follower.frame = requestAnimationFrame(frame);
    return follower;
  }
  stop() {
    if (this.nativeCaretStyle?.sheet) this.nativeCaretStyle!.sheet!.disabled = true;
    const follower = this.follower;
    if (!follower) return;
    cancelAnimationFrame(follower.frame);
    for (const [target, name, handler] of follower.listeners)
      target.removeEventListener(name, handler, true);
    follower.element.remove();
    this.follower = null;
  }
}
