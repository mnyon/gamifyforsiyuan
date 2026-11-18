export const STAR_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 2 2.8 6.2L22 11l-7.2 2.8L12 21l-2.8-7.2L2 11l7.2-2.8L12 2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

import { avatarLayers } from './habitica.js';

export class GamifyView {
  constructor({ css, onConnect, onSound, onRefresh, onResolve }) {
    this.host = document.createElement('div'); this.host.id = 'gamify-for-siyuan-view';
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${css}</style>
      <section class="card" aria-label="Gamify for SiYuan" hidden>
        <header><div class="brand">${STAR_ICON}<span>GAMIFY <b>for SiYuan</b></span></div><div class="tools"><button class="icon settings-toggle" aria-label="连接设置" title="连接设置">⚙</button><button class="icon close" aria-label="收起卡片">×</button></div></header>
        <div class="dashboard">
          <div class="scene"><div class="orbit"></div><i class="star s1">✦</i><i class="star s2">✧</i><i class="star s3">·</i><i class="star s4">✦</i><div class="moon"></div><div class="hill back"></div><div class="hill front"></div><div class="pedestal"></div><div class="avatar" role="img" aria-label="Habitica 角色"><span class="placeholder">✧</span></div><span class="scene-caption">一点一滴，皆是成长</span></div>
          <div class="identity"><span class="eyebrow player-caption">YOUR ADVENTURE</span><h2 class="player-name">冒险，从这里开始</h2><div class="player-meta">连接你的 Habitica 角色</div></div>
          <div class="vitals" hidden><div class="bar-label"><span><i class="heart">♥</i> 生命值</span><span class="hp-text"></span></div><div class="track hp"><span></span></div><div class="coins"><span>◈ <b class="gold">0</b> 金币</span><span class="level"></span></div></div>
          <div class="quest"><div class="quest-top"><span class="eyebrow">下一次奖励</span><span class="fraction"><b class="progress">0</b><span> / </span><span class="target">—</span></span></div><div class="track reward"><span></span></div><p class="remaining">连接后，开始积累每一个完成</p><div class="pending"></div></div>
          <div class="connection"><span class="connection-dot"></span><span class="connection-label">尚未连接 Habitica</span><button class="text refresh">刷新</button></div><div class="notice" role="status"></div><button class="resolve" hidden>核对待领取奖励</button>
        </div>
        <form class="settings" hidden autocomplete="off"><span class="eyebrow">连接你的冒险</span><h2>与 Habitica 同行</h2><p>完成笔记里的小事，也让角色向前一步。</p><label>User ID<input name="userId" required spellcheck="false" autocomplete="off" placeholder="Habitica 用户 ID"></label><label>API Token<input name="token" type="password" required autocomplete="off" placeholder="Habitica API Token"></label><a href="https://habitica.com/user/settings/api" target="_blank" rel="noopener noreferrer">在 Habitica 中查看连接信息 ↗</a><label class="sound"><input name="sound" type="checkbox" checked> 完成音效<span>轻巧、短促的回应</span></label><button class="primary" type="submit">连接并保存</button><p class="privacy">凭据仅保存在当前设备；不上传笔记内容。连接时会创建一个最低难度的专用正向习惯。</p><div class="form-status" role="status"></div></form>
        <footer><span class="footer-star">✧</span> 每一件小事，都算数。</footer>
      </section><div class="toast" role="status" hidden>${STAR_ICON}<span></span></div><div class="particles" aria-hidden="true"></div>`;
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
  update({ state, user, message = '', status = 'offline', backlog = 0 }) {
    const text = (selector, value) => { this.root.querySelector(selector).textContent = value; };
    const progress = state.credits.length, target = state.target;
    text('.progress', progress); text('.target', target ?? '—');
    this.root.querySelector('.reward span').style.width = `${target ? Math.min(100, progress / target * 100) : 0}%`;
    const waiting = state.rewards.filter(r => r.status !== 'sent').length;
    text('.remaining', waiting ? `${waiting} 次奖励待领取 · 继续积累下一轮` : target ? `再完成 ${Math.max(0, target - progress)} 个 TODO，迎接下一次奖励` : '正在读取你的 TODO……');
    const pending = Object.keys(state.pending).length;
    text('.pending', pending ? `${pending} 个完成正在确认 · 保持勾选 60 秒` : `未完成 ${backlog.toLocaleString()} 项 · 本轮目标固定，进度跨天保留`);
    text('.notice', message);
    text('.connection-label', { online: 'Habitica 已连接', offline: '尚未连接 Habitica', waiting: '奖励待领取', paused: '当前窗口仅展示', checking: '正在连接 Habitica' }[status] || status);
    this.root.querySelector('.connection-dot').dataset.status = status;
    this.root.querySelector('.resolve').hidden = !state.rewards.some(r => ['sending', 'uncertain'].includes(r.status));
    if (this.root.querySelector('.resolve').hidden) this.root.querySelector('.retry').hidden = true;
    this.root.querySelector('.vitals').hidden = !user;
    if (user) {
      text('.player-name', user.profile?.name || '冒险者');
      text('.player-meta', `Lv. ${user.stats.lvl} · ${{ warrior: '战士', wizard: '法师', healer: '医者', rogue: '盗贼' }[user.stats.class] || '冒险者'}`);
      const max = user.stats.maxHealth || 50;
      text('.hp-text', `${Math.max(0, user.stats.hp).toFixed(0)} / ${max}`);
      this.root.querySelector('.hp span').style.width = `${Math.max(0, Math.min(100, user.stats.hp / max * 100))}%`;
      text('.gold', Number(user.stats.gp || 0).toFixed(2)); text('.level', `已领取 ${state.total} 次奖励`);
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
  }
  feedback(message, celebrate = false, point) {
    const toast = this.root.querySelector('.toast'); toast.querySelector('span').textContent = message; toast.hidden = false; toast.classList.toggle('celebrate', celebrate);
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { toast.hidden = true; }, 2800); this.chime(celebrate);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = this.card.getBoundingClientRect(), x = point?.x ?? (this.card.hidden ? innerWidth - 44 : rect.left + rect.width / 2), y = point?.y ?? (this.card.hidden ? innerHeight - 70 : rect.top + 155);
    const field = this.root.querySelector('.particles');
    for (let i = 0; i < (celebrate ? 30 : 9); i++) {
      if (field.childElementCount > 80) break;
      const particle = document.createElement('i'); particle.textContent = i % 3 ? '✦' : '·';
      particle.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(i * 2.4) * (celebrate ? 110 : 48)}px;--dy:${Math.sin(i * 2.4) * (celebrate ? 100 : 44) - 30}px;--delay:${i * 9}ms;color:${['#a8e8c9', '#d5c1ff', '#ffe6a0'][i % 3]}`;
      field.append(particle); particle.addEventListener('animationend', () => particle.remove(), { once: true });
    }
  }
  destroy() { clearTimeout(this.toastTimer); this.audio?.close(); document.removeEventListener('pointerdown', this.outside); document.removeEventListener('keydown', this.escape); this.host.remove(); }
}
