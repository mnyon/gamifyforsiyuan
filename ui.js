import { HABITICA_ICON } from './icon.js';
export const STAR_ICON = HABITICA_ICON;

import { avatarLayers } from './habitica.js';

export class GamifyView {
  constructor({ css, onConnect, onSound, onRefresh, onResolve, onTestAction = async () => {} }) {
    this.host = document.createElement('div'); this.host.id = 'gamify-for-siyuan-view';
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
    this.effects = new Set(); this.effectTimers = new Set();
    document.body.append(this.host); this.card = this.root.querySelector('.card');
    this.root.querySelector('.close').onclick = () => this.close();
    this.root.querySelector('.settings-toggle').onclick = () => this.settings(!this.isSettings);
    this.root.querySelector('.refresh').onclick = () => onRefresh();
    this.root.querySelector('.resolve').onclick = async () => {
      await onResolve(false);
      if (this.root.querySelector('.resolve').hidden) return;
      this.root.querySelector('.retry').hidden = false;
    };
    const retry = document.createElement('button'); retry.className = 'resolve retry'; retry.hidden = true;
    retry.textContent = '确认未到账，重新领取'; retry.onclick = () => onResolve(true);
    this.root.querySelector('.dashboard').append(retry);
    const form = this.root.querySelector('form');
    /* @test-only:start */
    const testControls = document.createElement('div'); testControls.className = 'test-settings';
    testControls.innerHTML = '<span class="eyebrow">测试构建 · 仅模拟奖励</span><p class="privacy">独立模拟进度：每 3 项结算，勾选保持约 3 秒。不连接 Habitica，不修改真实奖励进度。日常使用请安装正式包。</p>';
    form.prepend(testControls);
    const testActions = document.createElement('div'); testActions.className = 'test-actions'; testActions.hidden = true;
    testActions.innerHTML = '<span class="eyebrow">测试模式 · 奖励均为模拟</span><div><button type="button" class="text" data-action="todo">模拟完成 TODO</button><button type="button" class="text" data-action="reward">预览金币特效</button></div>';
    testActions.onclick = async event => {
      const button = event.target.closest('button'); if (!button) return;
      button.disabled = true;
      try { await onTestAction(button.dataset.action); } catch (error) { this.feedback(error.message); }
      finally { button.disabled = false; }
    };
    this.root.querySelector('.dashboard').prepend(testActions);
    /* @test-only:end */
    form.onsubmit = async event => {
      event.preventDefault(); const button = form.querySelector('.primary'); button.disabled = true; this.formStatus('正在连接……');
      try { await onConnect({ userId: form.elements.userId.value.trim(), token: form.elements.token.value.trim(), sound: form.elements.sound.checked }); this.formStatus('连接成功'); this.settings(false); }
      catch (e) { this.formStatus(e.message); } finally { button.disabled = false; }
    };
    form.elements.sound.onchange = () => onSound(form.elements.sound.checked);
    this.outside = event => { if (!event.composedPath().includes(this.host) && !event.target.closest?.('[data-type="gamify-for-siyuancompanion"]')) this.close(); };
    this.escape = event => { if (event.key === 'Escape' && !this.card.hidden) { this.close(); this.opener?.focus(); } };
    document.addEventListener('pointerdown', this.outside); document.addEventListener('keydown', this.escape);
  }
  formStatus(message) { this.root.querySelector('.form-status').textContent = message; }
  credentials(value) {
    const form = this.root.querySelector('form'); form.elements.userId.value = value.userId || ''; form.elements.token.value = value.token || '';
    form.elements.sound.checked = value.sound !== false; this.soundEnabled = value.sound !== false;
  }
  settings(show) { this.isSettings = show; this.root.querySelector('.settings').hidden = !show; this.root.querySelector('.dashboard').hidden = show; if (show) this.root.querySelector('input').focus(); }
  open(opener) { this.opener = opener; this.card.hidden = false; this.root.querySelector('.close').focus(); this.unlockSound(); }
  close() { this.card.hidden = true; }
  update({ state, user, message = '', status = 'offline', backlog = 0, testMode = false }) {
    this.testMode = testMode;
    /* @test-only:start */
    this.root.querySelector('.test-actions').hidden = !testMode;
    this.root.querySelector('.primary').disabled = testMode;
    /* @test-only:end */
    if (testMode) user = { profile: { name: '练习中的冒险者' }, stats: { lvl: 1, hp: 50, maxHealth: 50, gp: state.total, class: 'warrior' } };
    const text = (selector, value) => { this.root.querySelector(selector).textContent = value; };
    const progress = Math.min(state.credits.length, state.target || 0), target = state.target;
    const pending = Object.keys(state.pending).length;
    text('.progress', progress); text('.target', target ?? '—');
    this.root.querySelector('.reward span').style.width = `${target ? Math.min(100, progress / target * 100) : 0}%`;
    let preview = this.root.querySelector('.reward .pending-progress');
    if (!preview) { preview = document.createElement('i'); preview.className = 'pending-progress'; this.root.querySelector('.reward').append(preview); }
    preview.style.left = `${target ? Math.min(100, progress / target * 100) : 0}%`;
    preview.style.width = `${target ? Math.min(pending, Math.max(0, target - progress)) / target * 100 : 0}%`;
    let pendingCount = this.root.querySelector('.pending-count');
    if (!pendingCount) { pendingCount = document.createElement('small'); pendingCount.className = 'pending-count'; this.root.querySelector('.fraction').append(pendingCount); }
    const fitting = Math.min(pending, Math.max(0, (target || 0) - progress));
    const overflow = Math.max(0, state.credits.length + pending - (target || 0));
    pendingCount.textContent = fitting ? ` +${fitting}` : '';
    const waiting = state.rewards.filter(r => r.status !== 'sent').length;
    text('.remaining', waiting ? `${waiting} 次奖励待领取 · 继续积累下一轮` : target ? progress + fitting >= target ? '本轮已集齐，待确认后结算' : `再完成 ${Math.max(0, target - progress - fitting)} 个 TODO，迎接下一次奖励` : '正在读取你的 TODO……');
    text('.pending', (pending ? `${pending} 项待计入 · 保持勾选 ${testMode ? 3 : 60} 秒` : testMode ? '模拟进度独立保存 · 也可勾选笔记中的 TODO 测试' : `未完成 ${backlog.toLocaleString()} 项 · 本轮目标固定，进度跨天保留`) + (overflow ? ` · 另 ${overflow} 项留待下一轮` : ''));
    text('.notice', message);
    text('.connection-label', { online: 'Habitica 已连接', offline: '尚未连接 Habitica', waiting: '奖励待领取', paused: '当前窗口仅展示', checking: '正在连接 Habitica' }[status] || status);
    if (testMode) text('.connection-label', '测试模式 · 不发送 Habitica 请求');
    this.root.querySelector('.connection-dot').dataset.status = status;
    this.root.querySelector('.resolve').hidden = !state.rewards.some(r => ['sending', 'uncertain'].includes(r.status));
    if (this.root.querySelector('.resolve').hidden) this.root.querySelector('.retry').hidden = true;
    this.root.querySelector('.vitals').hidden = !user;
    if (!user) {
      text('.player-name', '冒险，从这里开始'); text('.player-meta', '连接你的 Habitica 角色');
      this.avatarKey = null; this.root.querySelector('.avatar').innerHTML = '<span class="placeholder">✧</span>';
    }
    if (user) {
      text('.player-name', user.profile?.name || '冒险者');
      text('.player-meta', `Lv. ${user.stats.lvl} · ${{ warrior: '战士', wizard: '法师', healer: '医者', rogue: '盗贼' }[user.stats.class] || '冒险者'}`);
      const max = user.stats.maxHealth || 50;
      text('.hp-text', `${Math.max(0, user.stats.hp).toFixed(0)} / ${max}`);
      this.root.querySelector('.hp span').style.width = `${Math.max(0, Math.min(100, user.stats.hp / max * 100))}%`;
      text('.gold', Number(user.stats.gp || 0).toFixed(2)); text('.level', `${testMode ? '已模拟' : '已领取'} ${state.total} 次奖励`);
      const layers = avatarLayers(user), key = layers.join('|');
      if (key !== this.avatarKey) {
        this.avatarKey = key; const avatar = this.root.querySelector('.avatar'); avatar.replaceChildren();
        const placeholder = document.createElement('span'); placeholder.className = 'placeholder'; placeholder.textContent = '✧'; avatar.append(placeholder); let loaded = 0;
        for (const name of layers) {
          const img = document.createElement('img'); img.alt = ''; img.draggable = false;
          img.src = `https://habitica-assets.s3.amazonaws.com/mobileApp/images/${name}.png`;
          img.onload = () => { if (++loaded > 1) placeholder.hidden = true; };
          img.onerror = () => { img.remove(); if (loaded < 2) placeholder.title = '角色素材暂时无法加载'; }; avatar.append(img);
        }
      }
    }
  }
  async unlockSound() {
    try { const Audio = globalThis.AudioContext || globalThis.webkitAudioContext; if (Audio) { this.audio ||= new Audio(); if (this.audio.state === 'suspended') await this.audio.resume(); } } catch { /* Audio is optional. */ }
  }
  chime(celebrate) {
    if (!this.soundEnabled || !this.audio || this.audio.state !== 'running' || Date.now() - (this.lastSound || 0) < 350) return;
    this.lastSound = Date.now();
    (celebrate ? [659.25, 830.61, 987.77, 1318.51] : [880, 1318.51]).forEach((frequency, i) => {
      const start = this.audio.currentTime + i * 0.065, oscillator = this.audio.createOscillator(), gain = this.audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.055, start + 0.012); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(start); oscillator.stop(start + 0.35);
    });
    if (celebrate) [1568, 2093, 2637].forEach((frequency, i) => {
      const start = this.audio.currentTime + 0.42 + i * 0.09;
      const tone = this.audio.createOscillator(), gain = this.audio.createGain();
      tone.type = 'triangle'; tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.018, start); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      tone.connect(gain); gain.connect(this.audio.destination); tone.start(start); tone.stop(start + 0.18);
    });
  }
  later(callback, delay) {
    const timer = setTimeout(() => { this.effectTimers.delete(timer); callback(); }, delay);
    this.effectTimers.add(timer); return timer;
  }
  visibleTodo({ blockId, element } = {}) {
    const candidates = element?.isConnected ? [element] : blockId ? document.querySelectorAll(`[data-node-id="${CSS.escape(blockId)}"]`) : [];
    return [...candidates].find(node => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    });
  }
  completeTodo(context = {}) {
    if (this.effects.size >= 16) return;
    const element = this.visibleTodo(context);
    const label = '完成了一件事' + (context.target ? ` · ${Math.min(context.progress, context.target)}/${context.target}` : '') + (context.overflow ? ` · 另 ${context.overflow} 项待计入下一轮` : '');
    if (!element) { this.feedback(label, false, context.point); return; }
    this.chime(false);
    this.root.querySelector('.announcer').textContent = '完成了一件事';
    const field = this.root.querySelector('.line-effects');
    // These overlays never become children of the editor or change note content.
    const effect = document.createElement('div'); effect.className = 'line-complete';
    effect.innerHTML = '<span class="line-sweep"></span><span class="success-mark"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="m10 16 4 4 8-9"/></svg></span><span class="line-label">完成了一件事</span>';
    effect.querySelector('.line-label').textContent = label;
    field.append(effect);
    const entry = { effect, element, blockId: context.blockId };
    this.effects.add(entry);
    const position = () => {
      const target = this.visibleTodo(entry);
      if (!target) { effect.hidden = true; return; }
      entry.element = target;
      const r = target.getBoundingClientRect();
      const action = target.querySelector('.protyle-action--task')?.getBoundingClientRect();
      const height = Math.min(54, r.height), cy = action ? action.top + action.height / 2 - r.top : height / 2;
      effect.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${height}px;--cy:${cy}px;--cx:${action ? action.left + action.width / 2 - r.left : 14}px;--label-x:${Math.max(40, Math.min(r.width - 146, 180))}px`;
    };
    position();
    const r = effect.getBoundingClientRect();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.sparkles({ x: r.left + 18, y: r.top + Math.min(27, r.height / 2) }, 14);
    const follow = () => { if (this.effects.has(entry)) { position(); entry.frame = requestAnimationFrame(follow); } };
    entry.frame = requestAnimationFrame(follow);
    this.later(() => { this.effects.delete(entry); cancelAnimationFrame(entry.frame); effect.remove(); }, 1350);
  }
  rewardFeedback(gold, context = {}) {
    const known = typeof gold === 'number' && Number.isFinite(gold) && gold >= 0;
    const message = (this.testMode ? '模拟' : '') + (known ? `获得 ${gold.toFixed(2)} 金币` : '已获得 Habitica 奖励');
    this.feedback(message, true, undefined, false);
    this.root.querySelector('.toast').classList.add('coin-toast');
    const field = this.root.querySelector('.particles');
    const cardRect = this.card.getBoundingClientRect();
    const source = this.visibleTodo(context)?.getBoundingClientRect();
    const origin = source ? { x: Math.min(innerWidth - 90, source.left + Math.min(190, source.width / 2)), y: Math.max(35, source.top + Math.min(28, source.height / 2)) } :
      this.card.hidden ? { x: innerWidth - 150, y: innerHeight - 140 } : { x: cardRect.left + cardRect.width / 2, y: cardRect.top + 145 };
    const goldNode = !this.card.hidden && !this.isSettings ? this.root.querySelector('.gold') : null;
    const dock = document.querySelector('[data-type="gamify-for-siyuancompanion"]');
    const destination = (goldNode || dock)?.getBoundingClientRect();
    const end = destination?.width ? { x: destination.left + destination.width / 2, y: destination.top + destination.height / 2 } : { x: innerWidth - 25, y: innerHeight - 60 };
    const loot = document.createElement('div'); loot.className = 'loot-number'; loot.textContent = (this.testMode ? '模拟 ' : '') + (known ? `+${gold.toFixed(2)} 金币` : '获得奖励');
    loot.style.cssText = `left:${Math.max(85, Math.min(innerWidth - 100, origin.x))}px;top:${origin.y - 22}px`; field.append(loot);
    this.later(() => loot.remove(), 1800);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.sparkles(origin, 24, true);
    const available = Math.max(0, 96 - field.childElementCount);
    for (let i = 0; i < Math.min(16, available); i++) {
      const coin = document.createElement('i'); coin.className = 'coin-flight'; coin.innerHTML = '<span>✧</span>';
      const angle = i * 2.39996, radius = 32 + (i % 5) * 12;
      coin.style.cssText = `left:${origin.x}px;top:${origin.y}px;--burst-x:${Math.cos(angle) * radius}px;--burst-y:${Math.sin(angle) * radius - 45}px;--land-x:${end.x - origin.x}px;--land-y:${end.y - origin.y}px;--coin-delay:${i * 28}ms;--turn:${i * 70}deg`;
      field.append(coin); this.later(() => coin.remove(), 1900 + i * 28);
    }
    if (goldNode) this.later(() => {
      const animation = goldNode.animate([{ color: '#fff2bb', textShadow: '0 0 14px #ffd166', transform: 'scale(1.2)' }, { color: 'inherit', textShadow: 'none', transform: 'scale(1)' }], { duration: 550 });
      animation.finished.catch(() => {});
    }, 1000);
  }
  sparkles(point, count = 9, gold = false) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const field = this.root.querySelector('.particles');
    for (let i = 0; i < count; i++) {
      if (field.childElementCount > 72) break;
      const particle = document.createElement('i'); particle.className = 'spark'; particle.textContent = i % 3 ? '✦' : '·';
      particle.style.cssText = `left:${point.x}px;top:${point.y}px;--dx:${Math.cos(i * 2.4) * (gold ? 100 : 56)}px;--dy:${Math.sin(i * 2.4) * (gold ? 85 : 42) - 24}px;--delay:${i * 8}ms;color:${gold ? ['#ffe7a0', '#ffd166', '#fff9d4'][i % 3] : ['#a8e8c9', '#d5c1ff', '#e4fff1'][i % 3]}`;
      field.append(particle); this.later(() => particle.remove(), 1200);
    }
  }
  feedback(message, celebrate = false, point, emitStars = true) {
    const toast = this.root.querySelector('.toast'); toast.querySelector('span').textContent = message; toast.hidden = false; toast.classList.toggle('celebrate', celebrate);
    toast.classList.remove('coin-toast');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { toast.hidden = true; }, 2800); this.chime(celebrate);
    if (!emitStars) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = this.card.getBoundingClientRect(), x = point?.x ?? (this.card.hidden ? innerWidth - 44 : rect.left + rect.width / 2), y = point?.y ?? (this.card.hidden ? innerHeight - 70 : rect.top + 155);
    this.sparkles({ x, y }, celebrate ? 30 : 9);
  }
  destroy() { clearTimeout(this.toastTimer); for (const timer of this.effectTimers) clearTimeout(timer); for (const entry of this.effects) cancelAnimationFrame(entry.frame); this.effects.clear(); this.audio?.close(); document.removeEventListener('pointerdown', this.outside); document.removeEventListener('keydown', this.escape); this.host.remove(); }
}
