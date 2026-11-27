import { required, input, errorMessage } from './elements.js';
import type { Credentials } from '../features/connection/domain/credentials.js';
import type { ProgressState } from '../features/progress/domain/types.js';
import type { CompanionUser } from '../features/companion/domain/types.js';
import type {
  AdventureOptions,
  AdventureSnapshot,
} from '../features/companion/presentation/AdventureView.js';
import type { Point, FeedbackContext, CaretFollower, ViewOptions, ViewSnapshot } from './types.js';
import { AdventureView } from '../features/companion/presentation/AdventureView.js';
import { HABITICA_ICON } from './icon.js';
export const STAR_ICON = HABITICA_ICON;

import { editingApproach } from '../features/progress/domain/ActivityProgress.js';
import { CaretLight } from './CaretLight.js';
import { RewardEffects } from './RewardEffects.js';
import { SceneFeedback } from './SceneFeedback.js';
import { avatarSignature, buildAvatar } from './avatar.js';

/**
 * Card shell: settings, lifecycle, the account snapshot and sound. The
 * editing light lives in CaretLight, reward feedback in RewardEffects and
 * the sprite stack in avatar.ts. The delegating methods below are the stable
 * surface that previews and verification tools address (and may override).
 */
export class GamifyView {
  host: HTMLDivElement;
  root: ShadowRoot;
  card: HTMLElement;
  adventure: AdventureView;
  caret: CaretLight;
  effects: RewardEffects;
  scene: SceneFeedback;
  effectTimers: Set<number>;
  outside: (event: PointerEvent) => void;
  escape: (event: KeyboardEvent) => void;
  soundEnabled = true;
  isSettings = false;
  testMode = false;
  destroyed = false;
  audio?: AudioContext;
  lastSound = 0;
  opener?: HTMLElement;
  avatarKey: string | null = null;
  constructor({ css, onConnect, onSound, onAdventureLoad, onAdventureAction }: ViewOptions) {
    this.host = document.createElement('div');
    this.host.id = 'gamify-for-siyuan-view';
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${css}</style>
      <section class="card" aria-label="Gamify for SiYuan" hidden>
        <header><div class="brand">${STAR_ICON}<span>GAMIFY <b>for SiYuan</b></span></div><div class="tools"><button class="icon settings-toggle" aria-label="连接设置" title="连接设置">⚙</button><button class="icon close" aria-label="收起卡片">×</button></div></header>
        <div class="dashboard">
          <div class="scene"><div class="orbit"></div><i class="star s1">✦</i><i class="star s2">✧</i><i class="star s3">·</i><i class="star s4">✦</i><div class="moon-halo"></div><div class="moon"></div><div class="hill back"></div><div class="hill front"></div><div class="pedestal"></div><i class="mote-ambient m1"></i><i class="mote-ambient m2"></i><i class="mote-ambient m3"></i><i class="mote-ambient m4"></i><div class="ground-glow"></div><div class="avatar" role="img" aria-label="Habitica 角色"><span class="placeholder">✧</span></div></div>
          <div class="identity"><span class="eyebrow player-caption">YOUR ADVENTURE</span><h2 class="player-name">冒险，从这里开始</h2><div class="player-meta">连接你的 Habitica 角色</div></div>
          <div class="vitals" hidden><div class="bar-label"><span><i class="heart">♥</i> 生命值</span><span class="hp-text"></span></div><div class="track hp"><span></span></div><div class="coins"><span>◈ <b class="gold">0</b> 金币</span><span class="level"></span></div></div>
          <div class="notice" role="status"></div>
        </div>
        <form class="settings" hidden autocomplete="off"><span class="eyebrow">连接你的冒险</span><h2>与 Habitica 同行</h2><p>完成笔记里的小事，也让角色向前一步。</p><label>User ID<input name="userId" required spellcheck="false" autocomplete="off" placeholder="Habitica 用户 ID"></label><label>API Token<input name="token" type="password" required autocomplete="off" placeholder="Habitica API Token"></label><a href="https://habitica.com/user/settings/api" target="_blank" rel="noopener noreferrer">在 Habitica 中查看连接信息 ↗</a><label class="sound"><input name="sound" type="checkbox" checked> 完成音效<span>轻巧、短促的回应</span></label><button class="primary" type="submit">连接并保存</button><p class="privacy">凭据仅保存在当前设备；不上传笔记内容。连接时会创建一个最低难度的专用正向习惯。</p><div class="form-status" role="status"></div></form>
      </section><div class="toast" role="status" hidden>${STAR_ICON}<span></span></div><div class="particles" aria-hidden="true"></div><div class="line-effects" aria-hidden="true"></div><div class="announcer" role="status"></div>`;
    this.caret = new CaretLight(this);
    this.effects = new RewardEffects(this);
    this.effectTimers = new Set();
    required(this.root, '.settings > p').textContent = '连接你的 Habitica 角色。';
    document.body.append(this.host);
    this.card = required(this.root, '.card');
    this.scene = new SceneFeedback(this);
    required(this.root, '.close').onclick = () => this.close();
    required(this.root, '.settings-toggle').onclick = () => this.settings(!this.isSettings);
    const form = required(this.root, 'form');
    const sharing = document.createElement('div');
    sharing.className = 'connection-sharing';
    sharing.innerHTML =
      '<label class="sound"><input name="syncCredentials" type="checkbox"> 随思源同步连接信息</label><p class="privacy">默认关闭。开启后，User ID 和 API Token 将明文保存在工作空间插件文件中，随思源数据同步；手机同步后可直接连接。</p>';
    required(form, '.primary').before(sharing);
    required(form, ':scope > .privacy').textContent =
      '凭据仅用于 Habitica，不上传笔记内容。未开启同步时仅保存在当前设备。';
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = required(form, '.primary');
      button.disabled = true;
      this.formStatus('正在连接……');
      try {
        await onConnect({
          userId: input(form, 'userId').value.trim(),
          token: input(form, 'token').value.trim(),
          sound: input(form, 'sound').checked,
          syncCredentials: input(form, 'syncCredentials').checked,
        });
        this.formStatus('连接成功');
        this.settings(false);
      } catch (e) {
        this.formStatus(errorMessage(e));
      } finally {
        button.disabled = false;
      }
    };
    input(form, 'sound').onchange = () => onSound(input(form, 'sound').checked);
    this.adventure = new AdventureView(this, {
      onLoad: onAdventureLoad,
      onAction: onAdventureAction,
    });
    this.outside = (event) => {
      if (
        !event.composedPath().includes(this.host) &&
        !(event.target instanceof Element ? event.target : null)?.closest(
          '[data-type="gamify-for-siyuancompanion"]',
        )
      )
        this.close();
    };
    this.escape = (event) => {
      if (event.key === 'Escape' && !this.card.hidden) {
        this.close();
        this.opener?.focus();
      }
    };
    document.addEventListener('pointerdown', this.outside);
    document.addEventListener('keydown', this.escape);
  }
  formStatus(message: string) {
    required(this.root, '.form-status').textContent = message;
  }
  credentials(value: Credentials) {
    const form = required(this.root, 'form');
    input(form, 'userId').value = value.userId || '';
    input(form, 'token').value = value.token || '';
    input(form, 'sound').checked = value.sound !== false;
    this.soundEnabled = value.sound !== false;
    input(form, 'syncCredentials').checked = value.syncCredentials === true;
  }
  settings(show: boolean) {
    this.isSettings = show;
    required(this.root, '.settings').hidden = !show;
    required(this.root, '.dashboard').hidden = show;
    if (show && !this.host.classList.contains('mobile')) required(this.root, 'input').focus();
  }
  open(opener?: HTMLElement) {
    this.opener = opener;
    this.card.hidden = false;
    if (!this.host.classList.contains('mobile')) required(this.root, '.close').focus();
    this.unlockSound();
  }
  close() {
    if (this.adventure?.performing) return;
    this.adventure?.dismiss(true);
    this.card.hidden = true;
  }
  update({ state, user, message = '', testMode = false, adventure = {} }: ViewSnapshot) {
    this.caret.approach = editingApproach(state);
    this.scene.approach(this.caret.approach);
    this.testMode = testMode;
    if (testMode)
      user = {
        profile: { name: '练习中的冒险者' },
        stats: { lvl: 1, hp: 50, maxHealth: 50, gp: state.total, class: 'warrior' },
      };
    const text = (selector: string, value: unknown) => {
      required(this.root, selector).textContent = String(value);
    };
    text('.notice', message);
    required(this.root, '.vitals').hidden = !user;
    if (!user) {
      text('.player-name', '冒险，从这里开始');
      text('.player-meta', '连接你的 Habitica 角色');
      this.avatarKey = null;
      required(this.root, '.avatar').innerHTML = '<span class="placeholder">✧</span>';
    }
    if (user) {
      text('.player-name', user.profile?.name || '冒险者');
      text(
        '.player-meta',
        `Lv. ${user.stats?.lvl} · ${({ warrior: '战士', wizard: '法师', healer: '医者', rogue: '盗贼' } as Record<string, string>)[user.stats?.class || ''] || '冒险者'}`,
      );
      const max = user.stats?.maxHealth || 50;
      text('.hp-text', `${Math.max(0, user.stats?.hp || 0).toFixed(0)} / ${max}`);
      required(this.root, '.hp span').style.width =
        `${Math.max(0, Math.min(100, ((user.stats?.hp || 0) / max) * 100))}%`;
      text('.gold', Number(user.stats?.gp || 0).toFixed(2));
      text('.level', `${testMode ? '已模拟' : '已领取'} ${state.total} 次奖励`);
      const key = avatarSignature(user);
      if (key !== this.avatarKey) {
        this.avatarKey = key;
        buildAvatar(required(this.root, '.avatar'), user);
      }
    }
    this.adventure.update({ user, testMode, ...adventure });
  }
  async unlockSound() {
    try {
      const Audio =
        globalThis.AudioContext ||
        (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Audio) {
        this.audio ||= new Audio();
        if (this.audio.state === 'suspended') await this.audio.resume();
      }
    } catch {
      /* Audio is optional. */
    }
  }
  chime(celebrate: boolean) {
    if (
      !this.soundEnabled ||
      !this.audio ||
      this.audio.state !== 'running' ||
      Date.now() - (this.lastSound || 0) < 350
    )
      return;
    this.lastSound = Date.now();
    (celebrate ? [659.25, 830.61, 987.77, 1318.51] : [880, 1318.51]).forEach((frequency, i) => {
      const start = this.audio!.currentTime + i * 0.065,
        oscillator = this.audio!.createOscillator(),
        gain = this.audio!.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.055, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      oscillator.connect(gain);
      gain.connect(this.audio!.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.35);
    });
    if (celebrate)
      [1568, 2093, 2637].forEach((frequency, i) => {
        const start = this.audio!.currentTime + 0.42 + i * 0.09;
        const tone = this.audio!.createOscillator(),
          gain = this.audio!.createGain();
        tone.type = 'triangle';
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        tone.connect(gain);
        gain.connect(this.audio!.destination);
        tone.start(start);
        tone.stop(start + 0.18);
      });
  }
  later(callback: () => void, delay: number) {
    const timer = window.setTimeout(() => {
      this.effectTimers.delete(timer);
      callback();
    }, delay);
    this.effectTimers.add(timer);
    return timer;
  }
  // Stable delegating surface. Previews may override these methods; internal
  // subsystems call them through the host so overrides keep taking effect.
  get caretFollower(): CaretFollower | null {
    return this.caret.follower;
  }
  get nativeCaretStyle(): HTMLStyleElement | undefined {
    return this.caret.nativeCaretStyle;
  }
  visibleTodo(context: FeedbackContext = {}) {
    return this.effects.visibleTodo(context);
  }
  completeTodo(context: FeedbackContext = {}) {
    this.effects.completeTodo(context);
  }
  cancelTodo(blockId: string) {
    this.effects.cancelTodo(blockId);
  }
  maintainBlock(context: FeedbackContext = {}) {
    this.caret.maintainBlock(context);
    this.scene.activity();
  }
  editingFeedback(context: FeedbackContext & { progress?: number } = {}) {
    this.caret.editingFeedback(context);
    this.scene.activity();
    this.scene.approach(this.caret.approach);
  }
  caretPoint(context: FeedbackContext = {}): Point | null {
    return this.caret.point(context);
  }
  caretFeedback(point: Point, gold = false, weight = 0, purpleAfterglow = false) {
    this.caret.feedback(point, gold, weight, purpleAfterglow);
  }
  followEditingPoint(point: Point, gold: boolean): CaretFollower {
    return this.caret.follow(point, gold);
  }
  stopCaretFollower() {
    this.caret.stop();
  }
  rewardFeedback(gold: number | null | undefined, context: FeedbackContext = {}) {
    this.effects.rewardFeedback(gold, context);
    this.scene.cheer();
  }
  meteor() {
    this.scene.meteor();
  }
  moonBloom() {
    this.scene.moonBloom();
  }
  sparkles(point: Point, count = 9, gold = false) {
    this.effects.sparkles(point, count, gold);
  }
  feedback(message: string, celebrate = false, point?: Point, emitStars = true) {
    this.effects.feedback(message, celebrate, point, emitStars);
  }
  destroy() {
    this.adventure?.destroy();
    this.destroyed = true;
    this.scene.destroy();
    this.caret.stop();
    this.caret.nativeCaretStyle?.remove();
    this.effects.destroy();
    for (const timer of this.effectTimers) clearTimeout(timer);
    this.audio?.close();
    document.removeEventListener('pointerdown', this.outside);
    document.removeEventListener('keydown', this.escape);
    this.host.remove();
  }
}
