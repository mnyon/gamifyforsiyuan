import { required, optional, input, errorMessage } from './elements.js';
import type { Credentials } from '../features/connection/domain/credentials.js';
import type { ProgressState } from '../features/progress/domain/types.js';
import type { CompanionUser } from '../features/companion/domain/types.js';
import type {
  AdventureOptions,
  AdventureSnapshot,
} from '../features/companion/presentation/AdventureView.js';
import type {
  Point,
  FeedbackContext,
  EffectEntry,
  CaretFollower,
  ViewOptions,
  ViewSnapshot,
} from './types.js';
import { AdventureView } from '../features/companion/presentation/AdventureView.js';
import { HABITICA_ICON } from './icon.js';
export const STAR_ICON = HABITICA_ICON;

import { avatarLayers } from '../features/companion/application/projections.js';
import { editingApproach } from '../features/progress/domain/ActivityProgress.js';

export class GamifyView {
  host: HTMLDivElement;
  root: ShadowRoot;
  card: HTMLElement;
  adventure: AdventureView;
  effects: Set<EffectEntry>;
  effectTimers: Set<number>;
  outside: (event: PointerEvent) => void;
  escape: (event: KeyboardEvent) => void;
  soundEnabled = true;
  isSettings = false;
  testMode = false;
  destroyed = false;
  editingApproach = 0;
  audio?: AudioContext;
  lastSound = 0;
  opener?: HTMLElement;
  avatarKey: string | null = null;
  toastTimer?: number;
  caretFollower: CaretFollower | null = null;
  nativeCaretStyle?: HTMLStyleElement;
  caretGeometry?: { height: number };
  constructor({
    css,
    onConnect,
    onSound,
    onRefresh,
    onResolve,
    onAdventureLoad,
    onAdventureAction,
    onOpenTerrain = () => {},
  }: ViewOptions) {
    this.host = document.createElement('div');
    this.host.id = 'gamify-for-siyuan-view';
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${css}</style>
      <section class="card" aria-label="Gamify for SiYuan" hidden>
        <header><div class="brand">${STAR_ICON}<span>GAMIFY <b>for SiYuan</b></span></div><div class="tools"><button class="icon settings-toggle" aria-label="连接设置" title="连接设置">⚙</button><button class="icon close" aria-label="收起卡片">×</button></div></header>
        <div class="dashboard">
          <div class="scene"><div class="orbit"></div><i class="star s1">✦</i><i class="star s2">✧</i><i class="star s3">·</i><i class="star s4">✦</i><div class="moon"></div><div class="hill back"></div><div class="hill front"></div><div class="pedestal"></div><div class="avatar" role="img" aria-label="Habitica 角色"><span class="placeholder">✧</span></div></div>
          <div class="identity"><span class="eyebrow player-caption">YOUR ADVENTURE</span><h2 class="player-name">冒险，从这里开始</h2><div class="player-meta">连接你的 Habitica 角色</div></div>
          <div class="vitals" hidden><div class="bar-label"><span><i class="heart">♥</i> 生命值</span><span class="hp-text"></span></div><div class="track hp"><span></span></div><div class="coins"><span>◈ <b class="gold">0</b> 金币</span><span class="level"></span></div></div>
          <div class="quest"><div class="quest-top"><span class="eyebrow">下一次奖励</span><span class="fraction"><b class="progress">0</b><span> / </span><span class="target">—</span></span></div><div class="track reward"><span></span></div><p class="remaining">连接后，开始积累每一个完成</p><div class="pending"></div></div>
          <div class="connection"><span class="connection-dot"></span><span class="connection-label">尚未连接 Habitica</span><button class="text refresh">刷新</button></div><div class="notice" role="status"></div><button class="resolve" hidden>核对待领取奖励</button>
        </div>
        <form class="settings" hidden autocomplete="off"><span class="eyebrow">连接你的冒险</span><h2>与 Habitica 同行</h2><p>完成笔记里的小事，也让角色向前一步。</p><label>User ID<input name="userId" required spellcheck="false" autocomplete="off" placeholder="Habitica 用户 ID"></label><label>API Token<input name="token" type="password" required autocomplete="off" placeholder="Habitica API Token"></label><a href="https://habitica.com/user/settings/api" target="_blank" rel="noopener noreferrer">在 Habitica 中查看连接信息 ↗</a><label class="sound"><input name="sound" type="checkbox" checked> 完成音效<span>轻巧、短促的回应</span></label><button class="primary" type="submit">连接并保存</button><p class="privacy">凭据仅保存在当前设备；不上传笔记内容。连接时会创建一个最低难度的专用正向习惯。</p><div class="form-status" role="status"></div></form>
      </section><div class="toast" role="status" hidden>${STAR_ICON}<span></span></div><div class="particles" aria-hidden="true"></div><div class="line-effects" aria-hidden="true"></div><div class="announcer" role="status"></div>`;
    this.effects = new Set();
    this.effectTimers = new Set();
    // Rewards are discovered through feedback; do not display goals or instructions.
    required(this.root, '.quest').hidden = true;
    required(this.root, '.settings > p').textContent = '连接你的 Habitica 角色。';
    document.body.append(this.host);
    this.card = required(this.root, '.card');
    required(this.root, '.close').onclick = () => this.close();
    required(this.root, '.settings-toggle').onclick = () => this.settings(!this.isSettings);
    required(this.root, '.refresh').onclick = () => onRefresh();
    required(this.root, '.resolve').onclick = async () => {
      await onResolve(false);
      if (required(this.root, '.resolve').hidden) return;
      required(this.root, '.retry').hidden = false;
    };
    const retry = document.createElement('button');
    retry.className = 'resolve retry';
    retry.hidden = true;
    retry.textContent = '确认未到账，重新领取';
    retry.onclick = () => onResolve(true);
    required(this.root, '.dashboard').append(retry);
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
    const auxiliary = document.createElement('div');
    auxiliary.className = 'companion-auxiliary';
    const terrain = document.createElement('button');
    terrain.type = 'button';
    terrain.className = 'terrain-entry';
    terrain.textContent = '笔记领地';
    terrain.setAttribute('aria-label', '打开笔记领地地图');
    const arrow = document.createElement('span');
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    terrain.append(arrow);
    terrain.onclick = () => {
      try {
        onOpenTerrain();
      } catch (error) {
        this.feedback(errorMessage(error));
      }
    };
    auxiliary.append(terrain);
    required(this.root, '.dashboard').append(auxiliary);
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
  update({
    state,
    user,
    message = '',
    status = 'offline',
    backlog = 0,
    testMode = false,
    adventure = {},
  }: ViewSnapshot) {
    this.editingApproach = editingApproach(state);
    this.testMode = testMode;
    if (testMode)
      user = {
        profile: { name: '练习中的冒险者' },
        stats: { lvl: 1, hp: 50, maxHealth: 50, gp: state.total, class: 'warrior' },
      };
    const text = (selector: string, value: unknown) => {
      required(this.root, selector).textContent = String(value);
    };
    const progress = Math.min(state.credits.length, state.target || 0),
      target = state.target;
    const pending = Object.keys(state.pending).length;
    text('.progress', progress);
    text('.target', target ?? '—');
    required(this.root, '.reward span').style.width =
      `${target ? Math.min(100, (progress / target) * 100) : 0}%`;
    let preview = optional(this.root, '.reward .pending-progress');
    if (!preview) {
      preview = document.createElement('i');
      preview.className = 'pending-progress';
      required(this.root, '.reward').append(preview);
    }
    preview.style.left = `${target ? Math.min(100, (progress / target) * 100) : 0}%`;
    preview.style.width = `${target ? (Math.min(pending, Math.max(0, target - progress)) / target) * 100 : 0}%`;
    let pendingCount = optional(this.root, '.pending-count');
    if (!pendingCount) {
      pendingCount = document.createElement('small');
      pendingCount.className = 'pending-count';
      required(this.root, '.fraction').append(pendingCount);
    }
    const fitting = Math.min(pending, Math.max(0, (target || 0) - progress));
    const overflow = Math.max(0, state.credits.length + pending - (target || 0));
    pendingCount.textContent = fitting ? ` +${fitting}` : '';
    const waiting = state.rewards.filter((r) => r.status !== 'sent').length;
    text(
      '.remaining',
      waiting
        ? `${waiting} 次奖励待领取 · 继续积累下一轮`
        : target
          ? progress + fitting >= target
            ? '本轮已集齐，待确认后结算'
            : `再完成 ${Math.max(0, target - progress - fitting)} 个 TODO，迎接下一次奖励`
          : '正在读取你的 TODO……',
    );
    text(
      '.pending',
      (pending
        ? `${pending} 项待计入 · 保持勾选 ${testMode ? 3 : 60} 秒`
        : testMode
          ? '模拟进度独立保存 · 也可勾选笔记中的 TODO 测试'
          : `未完成 ${backlog.toLocaleString()} 项 · 本轮目标固定，进度跨天保留`) +
        (overflow ? ` · 另 ${overflow} 项留待下一轮` : ''),
    );
    text('.notice', message);
    text(
      '.connection-label',
      {
        online: 'Habitica 已连接',
        offline: '尚未连接 Habitica',
        waiting: '奖励待领取',
        paused: '当前窗口仅展示',
        checking: '正在连接 Habitica',
      }[status] || status,
    );
    if (testMode) text('.connection-label', '测试模式 · 不发送 Habitica 请求');
    required(this.root, '.connection-dot').dataset.status = status;
    required(this.root, '.resolve').hidden = !state.rewards.some((r) =>
      ['sending', 'uncertain'].includes(r.status),
    );
    if (required(this.root, '.resolve').hidden) required(this.root, '.retry').hidden = true;
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
      const layers = avatarLayers(user),
        companions = user.items || {},
        key = layers.join('|') + '|' + companions.currentMount + '|' + companions.currentPet;
      if (key !== this.avatarKey) {
        this.avatarKey = key;
        const avatar = required(this.root, '.avatar');
        avatar.replaceChildren();
        const mount = /^[\w-]+$/.test(companions.currentMount || '')
          ? companions.currentMount || ''
          : '';
        const pet = /^[\w-]+$/.test(companions.currentPet || '') ? companions.currentPet || '' : '';
        avatar.classList.toggle('has-mount', !!mount);
        avatar.classList.toggle('has-pet', !!pet);
        const placeholder = document.createElement('span');
        placeholder.className = 'placeholder';
        placeholder.textContent = '✧';
        avatar.append(placeholder);
        let loaded = 0;
        const assets = [
          ...(mount ? ['Mount_Body_' + mount] : []),
          ...layers,
          ...(mount ? ['Mount_Head_' + mount] : []),
          ...(pet ? ['Pet-' + pet] : []),
        ];
        for (const name of assets) {
          const img = document.createElement('img');
          img.alt = '';
          img.draggable = false;
          img.className = name.startsWith('Mount_')
            ? 'mount-layer'
            : name.startsWith('Pet-')
              ? 'pet-layer'
              : 'character-layer' + (mount.includes('Kangaroo') ? ' kangaroo' : '');
          img.src = `https://habitica-assets.s3.amazonaws.com/mobileApp/images/${name}.png`;
          img.onload = () => {
            if (++loaded > 1) placeholder.hidden = true;
          };
          img.onerror = () => {
            img.remove();
            if (loaded < 2) placeholder.title = '角色素材暂时无法加载';
          };
          avatar.append(img);
        }
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
        gain.gain.setValueAtTime(0.018, start);
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
    this.chime(false);
    required(this.root, '.announcer').textContent = '完成了一件事';
    const field = required(this.root, '.line-effects');
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
    this.later(() => {
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
  maintainBlock(context: FeedbackContext = {}) {
    const point = this.caretPoint(context);
    if (point) this.caretFeedback(point, false, context.weight);
  }
  editingFeedback({ blockId, progress = 0 }: FeedbackContext & { progress?: number } = {}) {
    this.editingApproach = Math.max(0, Math.min(1, progress));
    const point = this.caretPoint({ blockId });
    if (!point || this.destroyed || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const follower = this.followEditingPoint(point, false);
    const now = performance.now();
    if (now - follower.activityAt > 2300) follower.wakeAt = now;
    follower.activityAt = now;
    // A pause gently fades the light; stored progress is unaffected.
    follower.until = performance.now() + 6500;
  }
  caretPoint({ blockId }: FeedbackContext = {}): Point | null {
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
  caretFeedback(point: Point, gold = false, weight = 0) {
    if (this.destroyed) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this.stopCaretFollower();
      return;
    }
    const follower = this.followEditingPoint(point, gold);
    if (!gold) follower.maintenanceUntil = performance.now() + 1300;
    // Bound simultaneous sweeps when an offline queue delivers several rewards.
    if (follower.element.querySelectorAll('.beam-sweep').length >= 2) return;
    const light = document.createElement('i');
    light.className = 'beam-sweep' + (gold ? '' : ' purple');
    follower.element.append(light);
    this.later(() => light.remove(), 900);
  }
  followEditingPoint(point: Point, gold: boolean): CaretFollower {
    const now = performance.now();
    if (this.caretFollower) {
      this.caretFollower.until = Math.max(this.caretFollower.until, now + (gold ? 3000 : 1600));
      if (gold) this.caretFollower.goldUntil = now + 1800;
      return this.caretFollower;
    }
    const element = document.createElement('div');
    element.className = 'editing-glow' + (gold ? ' gold' : '');
    element.setAttribute('aria-hidden', 'true');
    element.style.setProperty('--origin-x', `${point.x}px`);
    element.style.setProperty('--origin-y', `${point.y}px`);
    required(this.root, '.particles').append(element);
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
      approach: this.editingApproach || 0,
      listeners: [],
      activityAt: now,
      wakeAt: now,
    };
    this.caretFollower = follower;
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
      if (this.destroyed || this.caretFollower !== follower) return;
      if (time >= follower.until || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.stopCaretFollower();
        return;
      }
      const target = this.caretPoint();
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
        follower.approach +=
          ((this.editingApproach || 0) - follower.approach) * (1 - Math.exp(-dt / 650));
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
  stopCaretFollower() {
    if (this.nativeCaretStyle?.sheet) this.nativeCaretStyle!.sheet!.disabled = true;
    const follower = this.caretFollower;
    if (!follower) return;
    cancelAnimationFrame(follower.frame);
    for (const [target, name, handler] of follower.listeners)
      target.removeEventListener(name, handler, true);
    follower.element.remove();
    this.caretFollower = null;
  }
  rewardFeedback(gold: number | null | undefined, context: FeedbackContext = {}) {
    const known = typeof gold === 'number' && Number.isFinite(gold) && gold >= 0;
    const message =
      (this.testMode ? '模拟' : '') +
      (known ? `获得 ${gold.toFixed(2)} 金币` : '已获得 Habitica 奖励');
    const field = required(this.root, '.particles');
    const cardRect = this.card.getBoundingClientRect();
    const source = this.visibleTodo(context)?.getBoundingClientRect();
    const caret = context.caret ? this.caretPoint(context) : null;
    const origin =
      caret ||
      (source && !context.caret
        ? {
            x: Math.min(innerWidth - 90, source.left + Math.min(190, source.width / 2)),
            y: Math.max(35, source.top + Math.min(28, source.height / 2)),
          }
        : this.card.hidden
          ? { x: innerWidth - 150, y: innerHeight - 140 }
          : { x: cardRect.left + cardRect.width / 2, y: cardRect.top + 145 });
    // Editing and TODO rewards share the same settlement feedback. The caret
    // also keeps its brief gold sweep; approaching a reward never calls here.
    if (caret) {
      required(this.root, '.announcer').textContent = message;
      this.caretFeedback(caret, true);
    }
    this.feedback(message, true, undefined, false);
    required(this.root, '.toast').classList.add('coin-toast');
    const goldNode = !this.card.hidden && !this.isSettings ? required(this.root, '.gold') : null;
    const dock = document.querySelector('[data-type="gamify-for-siyuancompanion"]');
    const destination = (goldNode || dock)?.getBoundingClientRect();
    const end = destination?.width
      ? { x: destination.left + destination.width / 2, y: destination.top + destination.height / 2 }
      : { x: innerWidth - 25, y: innerHeight - 60 };
    const loot = document.createElement('div');
    loot.className = 'loot-number';
    loot.textContent =
      (this.testMode ? '模拟 ' : '') + (known ? `+${gold.toFixed(2)} 金币` : '获得奖励');
    loot.style.cssText = `left:${Math.max(85, Math.min(innerWidth - 100, origin.x))}px;top:${origin.y - 22}px`;
    field.append(loot);
    this.later(() => loot.remove(), 1800);
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
      this.later(() => coin.remove(), 1900 + i * 28);
    }
    if (goldNode)
      this.later(() => {
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
    const field = required(this.root, '.particles');
    for (let i = 0; i < count; i++) {
      if (field.childElementCount > 72) break;
      const particle = document.createElement('i');
      particle.className = 'spark';
      particle.textContent = i % 3 ? '✦' : '·';
      particle.style.cssText = `left:${point.x}px;top:${point.y}px;--dx:${Math.cos(i * 2.4) * (gold ? 100 : 56)}px;--dy:${Math.sin(i * 2.4) * (gold ? 85 : 42) - 24}px;--delay:${i * 8}ms;color:${gold ? ['#ffe7a0', '#ffd166', '#fff9d4'][i % 3] : ['#a8e8c9', '#d5c1ff', '#e4fff1'][i % 3]}`;
      field.append(particle);
      this.later(() => particle.remove(), 1200);
    }
  }
  feedback(message: string, celebrate = false, point?: Point, emitStars = true) {
    const toast = required(this.root, '.toast');
    required(toast, 'span').textContent = message;
    toast.hidden = false;
    toast.classList.toggle('celebrate', celebrate);
    toast.classList.remove('coin-toast');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2800);
    this.chime(celebrate);
    if (!emitStars) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = this.card.getBoundingClientRect(),
      x = point?.x ?? (this.card.hidden ? innerWidth - 44 : rect.left + rect.width / 2),
      y = point?.y ?? (this.card.hidden ? innerHeight - 70 : rect.top + 155);
    this.sparkles({ x, y }, celebrate ? 30 : 9);
  }
  destroy() {
    this.adventure?.destroy();
    this.destroyed = true;
    this.stopCaretFollower();
    this.nativeCaretStyle?.remove();
    clearTimeout(this.toastTimer);
    for (const timer of this.effectTimers) clearTimeout(timer);
    for (const entry of this.effects) cancelAnimationFrame(entry.frame);
    this.effects.clear();
    this.audio?.close();
    document.removeEventListener('pointerdown', this.outside);
    document.removeEventListener('keydown', this.escape);
    this.host.remove();
  }
}
