import { required } from './elements.js';
import type { GamifyView } from './GamifyView.js';

/**
 * Scene-level feedback: the reward cheer, the progress ambient and rare sky
 * events (meteor / lunar halo). Event-driven with no polling; all timers run
 * through the host registry so destroy cleans them up. The easter egg arms
 * only after sustained real editing, fires on a random delay and then enters
 * a cooldown — rare, unpredictable and not farmable.
 */
export class SceneFeedback {
  private readonly scene: HTMLElement;
  private readonly halo: HTMLElement;
  private lastCheer = -1000;
  private activeMs = 0;
  private lastActivityAt = 0;
  private armedTimer?: number;
  private cooldownUntil = 0;
  private parFrame = 0;
  private px = 0;
  private py = 0;
  private tx = 0;
  private ty = 0;
  private readonly onParMove: (event: PointerEvent) => void;
  private readonly onParLeave: () => void;
  constructor(private readonly host: GamifyView) {
    this.scene = required(host.root, '.scene');
    this.halo = required(this.scene, '.moon-halo');
    // Pointer parallax: eased toward the pointer, springs back on leave.
    // Fine pointers only — touch scrolling must not wiggle the scene.
    // Capability probes follow the plugin/platform.ts convention.
    this.onParMove = (event) => {
      if (
        this.host.destroyed ||
        !matchMedia('(pointer: fine)').matches ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      const rect = this.host.card.getBoundingClientRect();
      this.tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      this.ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      this.kick();
    };
    this.onParLeave = () => {
      this.tx = 0;
      this.ty = 0;
      this.kick();
    };
    this.host.card.addEventListener('pointermove', this.onParMove);
    this.host.card.addEventListener('pointerleave', this.onParLeave);
  }
  private kick() {
    if (!this.parFrame) this.parFrame = requestAnimationFrame(this.parLoop);
  }
  private parLoop = () => {
    this.px += (this.tx - this.px) * 0.08;
    this.py += (this.ty - this.py) * 0.08;
    this.scene.style.setProperty('--par-x', this.px.toFixed(3));
    this.scene.style.setProperty('--par-y', this.py.toFixed(3));
    this.parFrame =
      Math.abs(this.tx - this.px) > 0.002 || Math.abs(this.ty - this.py) > 0.002
        ? requestAnimationFrame(this.parLoop)
        : 0;
  };
  destroy() {
    this.host.card.removeEventListener('pointermove', this.onParMove);
    this.host.card.removeEventListener('pointerleave', this.onParLeave);
    cancelAnimationFrame(this.parFrame);
  }
  approach(value: number) {
    const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    this.scene.style.setProperty('--approach', v.toFixed(3));
  }
  cheer() {
    if (
      this.host.card.hidden ||
      this.host.destroyed ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const now = performance.now();
    // Bound re-triggers when an offline queue delivers several rewards.
    if (now - this.lastCheer < 900) return;
    this.lastCheer = now;
    const avatar = required(this.scene, '.avatar');
    avatar.classList.remove('cheer');
    void avatar.offsetWidth;
    avatar.classList.add('cheer');
    this.host.later(() => avatar.classList.remove('cheer'), 760);
  }
  activity() {
    if (this.host.destroyed) return;
    const now = performance.now();
    if (this.lastActivityAt) this.activeMs += Math.min(now - this.lastActivityAt, 2500);
    this.lastActivityAt = now;
    if (
      this.armedTimer === undefined &&
      this.activeMs >= 60000 &&
      now > this.cooldownUntil &&
      !document.hidden &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.armedTimer = this.host.later(
        () => {
          this.armedTimer = undefined;
          this.activeMs = 0;
          this.cooldownUntil = performance.now() + 120000;
          if (
            this.host.destroyed ||
            document.hidden ||
            matchMedia('(prefers-reduced-motion: reduce)').matches
          )
            return;
          if (Math.random() < 0.7) this.meteor();
          else this.moonBloom();
        },
        15000 + Math.random() * 45000,
      );
    }
  }
  meteor() {
    if (this.host.destroyed || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const streak = document.createElement('i');
    streak.className = 'meteor';
    this.scene.append(streak);
    this.host.later(() => streak.remove(), 1400);
  }
  moonBloom() {
    if (this.host.destroyed || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const moon = required(this.scene, '.moon');
    moon.classList.remove('bloom');
    this.halo.classList.remove('bloom');
    void moon.offsetWidth;
    moon.classList.add('bloom');
    this.halo.classList.add('bloom');
    this.host.later(() => {
      moon.classList.remove('bloom');
      this.halo.classList.remove('bloom');
    }, 3900);
  }
}
