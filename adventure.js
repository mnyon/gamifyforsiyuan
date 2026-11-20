import { assetURL, plainNotes, skillBlockReason, resourceLimits, inventoryItems, shopItems, purchaseBlockReason, armoireReward, safeAsset } from './companion-model.js';

// All remote names and descriptions enter the DOM through textContent.
export const PACK_ART = '<svg viewBox="0 0 64 64" aria-hidden="true" shape-rendering="crispEdges"><path d="M24 9h16v5h5v5h6v35H13V19h6v-5h5z" fill="#211822"/><path d="M26 11h12v9h-4v-5h-4v5h-4z" fill="#c59c64"/><path d="M19 22h26v30H19z" fill="#674238"/><path d="M15 29h7v22h-7zm27 0h7v22h-7z" fill="#96664a"/><path d="M20 20h24v16H20z" fill="#bd8d58"/><path d="M23 20h18v4H23z" fill="#dfb778"/><path d="M23 38h18v14H23z" fill="#9c6848"/><path d="M28 29h8v11h-8z" fill="#4e3330"/><path d="M29 30h6v6h-6z" fill="#edca7c"/><path d="M31 31h2v3h-2z" fill="#67442e"/><path d="M17 51h30v4H17z" fill="#3b2930"/><path d="M14 23h6v5h-6zm30 0h6v5h-6z" fill="#dec89f"/></svg>';
export class AdventureView {
  constructor(view, { onLoad = async () => {}, onAction = async () => {} } = {}) {
    this.view = view; this.root = view.root; this.onLoad = onLoad; this.onAction = onAction; this.page = 'home'; this.category = 'all';
    this.base = `/plugins/gamify-for-siyuan/assets/`;
    const identity = this.root.querySelector('.identity');
    const info = document.createElement('div'); while (identity.firstChild) info.append(identity.firstChild); identity.append(info);
    const shop = document.createElement('button'); shop.className = 'shop-entry'; shop.type = 'button'; shop.setAttribute('aria-label', '进入旅人商店');
    shop.innerHTML = `<span class="shop-window"><span class="window-glow"></span><img data-src="${this.base}market_banner_npc-crop.png" alt="市场商人 Alex"><span class="window-spark">✧</span></span><span class="shop-plaque">旅人商店 <b>›</b></span>`;
    identity.append(shop); this.shopButton = shop; shop.onclick = () => this.navigate('shop');
    const bag = document.createElement('button'); bag.className = 'bag-entry'; bag.type = 'button'; bag.setAttribute('aria-label', '打开冒险背包');
    bag.innerHTML = `<span class="bag-window">${PACK_ART}<span class="bag-stars">✧</span></span><span class="bag-plaque">冒险背包 ›</span>`;
    this.root.querySelector('.scene').append(bag); this.bagButton = bag; bag.onclick = () => this.navigate('bag');
    const vitals = this.root.querySelector('.vitals');
    for (const [kind, label] of [['xp', '✦ 经验值'], ['mp', '◆ 法力值']]) {
      const row = document.createElement('div'); row.className = 'extra-vital';
      row.innerHTML = `<div class="bar-label"><span>${label}</span><span class="${kind}-text"></span></div><div class="track ${kind}"><span></span></div>`;
      vitals.insertBefore(row, vitals.querySelector('.coins'));
    }
    this.element = document.createElement('div'); this.element.className = 'adventure';
    this.element.innerHTML = `<section class="skill-section"><div class="section-label"><span>职业技能</span></div><div class="skills"></div><p class="skill-guidance">需指定任务或成员的技能，请前往 Habitica 施放。</p></section><section class="adventure-shop" hidden><button class="back">← 返回角色</button><div class="shop-top"><div><span class="eyebrow">THE TRAVELER'S GOODS</span><h2>旅人商店</h2></div><span class="shop-gold"></span></div><div class="market-panorama"><img data-src="${this.base}market_banner_npc-crop.png" alt="商人 Alex"><span class="merchant-name">◆ Alex ◆</span></div><div class="equipment-shelf"><div class="products"></div></div><p class="shop-state" role="status"></p></section><section class="adventure-bag" hidden><button class="back">← 返回角色</button><div class="bag-heading bag-heading-merged"><div class="bag-title-art">${PACK_ART}</div><div class="bag-title-copy"><span class="label">YOUR ADVENTURE KIT</span><h2>冒险背包</h2></div><span class="bag-total"></span><span class="bag-heading-star" aria-hidden="true">✧</span></div><div class="bag-tabs" role="group" aria-label="背包分类"></div><div class="bag-grid"></div><div class="bag-detail" aria-live="polite"></div><div class="bag-bottom"><span class="bag-state"></span><span>仅查看</span></div></section><p class="adventure-status" role="status"></p>`;
    this.root.querySelector('.connection').before(this.element);
    this.element.querySelectorAll('.back').forEach(b => b.onclick = () => this.navigate('home'));
    this.overlay = document.createElement('div'); this.overlay.className = 'adventure-overlay'; this.overlay.hidden = true;
    this.view.card.append(this.overlay); this.overlay.onclick = e => { if (e.target === this.overlay || e.target.closest('[data-dismiss]')) this.dismiss(); };
    this.keydown = e => {
      if (this.overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.dismiss(); }
      if (e.key === 'Tab') {
        const nodes = [...this.overlay.querySelectorAll('button:not(:disabled),a[href],input')], first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === this.view.host && this.root.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && this.root.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', this.keydown, true);
  }
  node(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
  image(name, cls = '') {
    const img = this.node('img', cls); img.alt = ''; img.draggable = false; img.loading = 'lazy'; img.src = assetURL(name);
    img.onerror = () => { img.hidden = true; }; return img;
  }
  text(selector, value) { const n = this.root.querySelector(selector); if (n) n.textContent = value; }
  async navigate(page) {
    if (!this.overlay.hidden) this.dismiss();
    this.page = page; this.updateVisibility(); this.view.card.scrollTop = 0;
    if (page === 'home') { (this.previousPage === 'bag' ? this.bagButton : this.shopButton).focus(); return; }
    this.previousPage = page;
    this.element.querySelector(`.adventure-${page} .back`).focus();
    this.text('.adventure-status', '正在读取…');
    try { await this.onLoad(page); if (!this.view.destroyed) this.text('.adventure-status', ''); }
    catch (error) { if (!this.view.destroyed) this.text('.adventure-status', error.message); }
  }
  updateVisibility() {
    const home = this.page === 'home';
    for (const selector of ['.scene', '.identity', '.vitals', '.skill-section']) this.root.querySelector(selector).hidden = !home || !this.user && selector !== '.scene' && selector !== '.identity';
    this.root.querySelector('.adventure-shop').hidden = this.page !== 'shop'; this.root.querySelector('.adventure-bag').hidden = this.page !== 'bag';
    this.bagButton.hidden = this.shopButton.hidden = !this.user || this.testMode;
  }
  update({ user, content, shops, busy = false, blocked = '', testMode = false, updated = 0 } = {}) {
    this.user = user; this.content = content; this.shops = shops; this.busy = busy; this.blocked = blocked; this.testMode = testMode;
    if (!user || testMode) this.page = 'home'; this.updateVisibility();
    if (user && !testMode) for (const img of this.root.querySelectorAll('img[data-src]')) { img.src = img.dataset.src; delete img.dataset.src; }
    if (!user) { this.element.hidden = true; return; } this.element.hidden = testMode;
    const limits = resourceLimits(user, content);
    for (const [kind, current, max] of [['xp', user.stats?.exp || 0, limits.xp], ['mp', user.stats?.mp || 0, limits.mp]]) {
      this.text(`.${kind}-text`, `${Math.floor(current)} / ${max === null ? '—' : max}`);
      const bar = this.root.querySelector(`.${kind}`); bar.querySelector('span').style.width = `${max ? Math.max(0, Math.min(100, current / max * 100)) : 0}%`;
      bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', kind === 'xp' ? '经验值' : '法力值'); bar.setAttribute('aria-valuenow', current); bar.setAttribute('aria-valuemin', 0); if (max !== null) bar.setAttribute('aria-valuemax', max);
    }
    const signature = JSON.stringify([user.stats, user.items, user.preferences, !!content, shops, busy, blocked]);
    if (signature !== this.signature) { this.signature = signature; this.renderSkills(); this.renderShop(); this.renderBag(); }
    this.text('.bag-state', updated ? `快照 · ${new Date(updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '账户快照');
    this.text('.adventure-status', blocked);
  }
  renderSkills() {
    const list = this.root.querySelector('.skills'); list.replaceChildren();
    const spells = Object.values(this.content?.spells?.[this.user.stats?.class] || {});
    if (!spells.length) { list.append(this.node('span', 'empty-copy', this.content ? '等级 11 后解锁职业技能' : '打开面板后加载职业技能')); return; }
    for (const spell of spells) {
      const reason = skillBlockReason(spell, this.user), disabled = reason || this.blocked || (this.busy ? '正在处理，请稍候' : '');
      const wrapper = this.node('div', 'skill-wrapper'); wrapper.title = disabled || plainNotes(spell.notes);
      const button = this.node('button', `skill${reason === '法力不足' ? ' mana-low' : ''}${spell.key === 'frost' && this.user.stats?.buffs?.streaks ? ' buff-active' : ''}`); button.type = 'button'; button.disabled = !!disabled;
      button.setAttribute('aria-label', `${spell.text}，${spell.mana} 法力${disabled ? '；' + disabled : ''}`);
      const icon = this.node('span', 'skill-icon'); icon.append(this.image(`shop_${spell.key}`)); icon.append(this.node('span', 'slot-glint')); button.append(icon, this.node('span', '', spell.text), this.node('small', '', `${spell.mana} MP`));
      wrapper.append(button); if (disabled) wrapper.append(this.node('small', 'skill-unavailable', spell.target === 'task' ? '需指定任务' : !['self', 'party'].includes(spell.target) ? '需选择目标' : reason || '暂不可用'));
      button.onclick = () => this.confirmSkill(spell); list.append(wrapper);
    }
  }
  confirmSkill(spell) {
    this.dialog(spell.text, `${plainNotes(spell.notes)}\n消耗 ${spell.mana} 点法力${spell.target === 'party' ? '，作用于当前队伍' : ''}。`, '确认施放', async () => {
      const result = await this.onAction('cast', spell.key); if (this.view.destroyed) return result; this.dismiss(true); this.view.feedback(`${spell.text}已施放`, true); return result;
    });
  }
  renderShop() {
    this.text('.shop-gold', `◉ ${Number(this.user.stats?.gp || 0).toFixed(2)}`);
    const list = this.root.querySelector('.products'); list.replaceChildren();
    if (!this.shops || !this.content) { this.text('.shop-state', '进入商店后读取官方商品'); return; }
    this.text('.shop-state', '商品与价格来自 Habitica · 宝石商品请在官方商店购买');
    this.products = shopItems(this.shops.market, this.shops.gear, this.shops.seasonal, this.content, this.user);
    for (const item of this.products) {
      const card = this.node('button', 'product'); card.type = 'button'; const art = this.node('div', 'product-art'); art.append(this.image(item.image));
      const info = this.node('div', 'product-info'); info.append(this.node('b', '', item.name), this.node('small', '', `${item.currency === 'gold' ? '◉' : '◆'} ${Number.isFinite(item.price) ? item.price : '—'}`), this.node('span', 'gap', purchaseBlockReason(item, this.user) || '可以购买'));
      card.append(art, info); card.onclick = () => this.confirmBuy(item); list.append(card);
    }
  }
  confirmBuy(item) {
    const reason = purchaseBlockReason(item, this.user) || this.blocked || (this.busy ? '正在处理，请稍候' : '');
    this.dialog(item.name, `${item.notes}\n价格 ${item.price} ${item.currency === 'gold' ? '金币' : '宝石'}${item.kind === 'potion' ? '，购买后立即使用' : ''}。${reason ? '\n' + reason : ''}`, reason || (item.kind === 'armoire' ? '购买并开启' : '确认购买'), async () => {
      const result = await this.onAction('buy', item.key); if (this.view.destroyed) return; this.dismiss(true);
      if (item.kind === 'armoire') this.openChest(armoireReward(result, this.content));
      else this.view.feedback(`${item.name}购买成功`, true);
    }, !!reason);
    if (item.currency !== 'gold') { const link = this.node('a', 'official-shop-link', '前往 Habitica 官方商店 ↗'); link.href = 'https://habitica.com/shops/market'; link.target = '_blank'; link.rel = 'noopener noreferrer'; this.overlay.querySelector('.adventure-sheet').append(link); }
  }
  renderBag() {
    const items = inventoryItems(this.user, this.content), filtered = items.filter(i => this.category === 'all' || i.category === this.category);
    this.text('.bag-total', `${items.length} 种物品`);
    const tabs = this.root.querySelector('.bag-tabs'); tabs.replaceChildren();
    for (const [key, title] of [['all', '全部'], ['gear', '装备'], ['food', '食物'], ['other', '蛋与药水'], ['quest', '任务卷轴']]) {
      const b = this.node('button', '', title); b.type = 'button'; b.setAttribute('aria-pressed', this.category === key); b.onclick = () => { this.category = key; this.renderBag(); [...tabs.children].find(n => n.textContent === title)?.focus(); }; tabs.append(b);
    }
    const selected = filtered.find(i => i.key === this.selected) || filtered[0]; this.selected = selected?.key;
    const grid = this.root.querySelector('.bag-grid'); grid.replaceChildren();
    for (const item of filtered) {
      const b = this.node('button', `bag-slot${item === selected ? ' selected' : ''}`); b.type = 'button'; b.title = item.name;
      b.setAttribute('aria-label', `${item.name}，数量 ${item.quantity}${item.equipped ? '，已装备' : ''}`); b.setAttribute('aria-pressed', item === selected); b.append(this.image(item.image), this.node('small', '', item.quantity)); if (item.equipped) b.append(this.node('i', 'equipped-dot'));
      b.onclick = () => { this.selected = item.key; this.renderBag(); [...grid.children].find(n => n.title === item.name)?.focus(); }; grid.append(b);
    }
    for (let i = filtered.length; i < 12; i++) { const empty = this.node('span', 'bag-slot empty', '◇'); empty.setAttribute('aria-hidden', 'true'); grid.append(empty); }
    const detail = this.root.querySelector('.bag-detail'); detail.replaceChildren();
    if (!selected) { detail.append(this.node('p', '', this.content ? '这个分类暂时没有物品。' : '正在读取物品说明…')); return; }
    const art = this.node('div', 'detail-art'); art.append(this.image(selected.image)); const info = this.node('div'); info.append(this.node('div', 'detail-type', selected.equipped ? '已装备' : '持有物品'), this.node('h3', '', selected.name), this.node('p', '', selected.notes || '官方暂未提供物品说明'), this.node('small', '', `持有数量 · ${selected.quantity}`)); detail.append(art, info);
  }
  dialog(title, notes, label, action, disabled = false) {
    this.lastFocus = this.root.activeElement; this.overlay.replaceChildren(); this.overlay.className = 'adventure-overlay'; this.overlay.hidden = false;
    const sheet = this.node('section', 'adventure-sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'adventure-dialog-title');
    const heading = this.node('h3', '', title); heading.id = 'adventure-dialog-title'; const text = this.node('p', '', notes), status = this.node('p', 'dialog-status'); status.setAttribute('role', 'status'); const controls = this.node('div', 'dialog-actions');
    const cancel = this.node('button', 'secondary', '返回'); cancel.type = 'button'; cancel.dataset.dismiss = '';
    const submit = this.node('button', 'primary', label); submit.type = 'button'; submit.disabled = disabled;
    submit.onclick = async () => {
      if (this.performing) return; this.performing = true; submit.disabled = cancel.disabled = true; status.textContent = '正在请求 Habitica，请稍候…';
      try { await this.view.unlockSound(); await action(); }
      catch (error) { if (!this.view.destroyed) { status.textContent = error.message; cancel.disabled = false; /* Re-open to revalidate before any retry. */ } }
      finally { this.performing = false; }
    };
    controls.append(cancel, submit); sheet.append(heading, text, status, controls); this.overlay.append(sheet); this.view.card.scrollTop = 0; cancel.focus();
  }
  dismiss(force = false) {
    if (this.performing && !force) return;
    if (this.chest && !this.chest.revealed && !force) { this.revealChest(); return; }
    clearTimeout(this.chestTimer); this.chest = null; this.overlay.hidden = true; this.overlay.replaceChildren(); this.lastFocus?.isConnected && this.lastFocus.focus();
  }
  openChest(reward) {
    // The server result is already settled; this animation never generates a drop.
    this.dialog('魔法宝箱', '', '', () => {}, true); this.chest = { reward, revealed: false };
    this.overlay.classList.add('chest-overlay'); const sheet = this.overlay.firstChild; sheet.className = 'sheet'; sheet.replaceChildren();
    const opening = this.node('div', 'opening'); opening.innerHTML = '<button class="skip" data-dismiss>跳过动画 ↗</button><div class="chest-kicker">THE ENCHANTED ARMOIRE</div><h3 id="adventure-dialog-title">魔法宝箱</h3><p>一份未知的惊喜，正在等待你。</p><div class="chest-stage"><div class="rays"></div><div class="chest-aura"></div><div class="halo"></div></div><button class="primary">开启宝箱</button><div class="burst"></div>';
    opening.querySelector('.chest-stage').append(this.image('shop_armoire', 'chest-image')); sheet.append(opening);
    opening.querySelector('.primary').onclick = () => { if (this.chest?.charging) return; this.chest.charging = true; opening.classList.add('charging'); this.chestSound(false); opening.querySelector('.primary').disabled = true; this.chestTimer = setTimeout(() => this.revealChest(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 2400); };
    opening.querySelector('.primary').focus();
  }
  revealChest() {
    if (!this.chest || this.chest.revealed) return; clearTimeout(this.chestTimer); this.chest.revealed = true;
    const reward = this.chest.reward, opening = this.overlay.querySelector('.opening'); if (!opening) return;
    opening.classList.remove('charging'); opening.classList.add('revealed'); opening.replaceChildren();
    const label = this.node('div', 'chest-kicker', reward ? `YOU DISCOVERED · ${{ gear: '装备', food: '食物', experience: '经验' }[reward.type]}` : 'HABITICA'); const stage = this.node('div', 'chest-stage');
    for (const cls of ['rays', 'chest-aura', 'halo']) stage.append(this.node('div', cls));
    for (let i = 0; i < 22; i++) { const mote = this.node('i', 'mote'); mote.style.setProperty('--angle', `${i * 16.36}deg`); mote.style.setProperty('--delay', `${i % 4 * .04}s`); stage.append(mote); }
    stage.append(reward?.image ? this.image(reward.image, 'reward-art') : this.node('span', 'reward-experience', '✦'));
    const heading = this.node('h3', '', reward?.name || '宝箱已开启'); heading.id = 'adventure-dialog-title'; const notes = this.node('p', '', reward?.notes || 'Habitica 已完成购买，请在背包或官方账号中查看结果。'); const done = this.node('button', 'primary', '收下奖励'); done.type = 'button'; done.dataset.dismiss = '';
    opening.append(label, stage, heading, notes, done, this.node('div', 'burst')); this.chestSound(true); done.focus();
  }
  chestSound(reveal) {
    if (!this.view.soundEnabled || !this.view.audio || this.view.audio.state !== 'running') return;
    const audio = this.view.audio;
    (reveal ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [130.81, 196, 261.63, 392, 523.25]).forEach((f, i) => {
      const tone = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + i * (reveal ? .09 : .35); tone.type = 'sine'; tone.frequency.value = f; tone.connect(gain); gain.connect(audio.destination); gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.035, start + .03); gain.gain.exponentialRampToValueAtTime(.001, start + 1.1); tone.start(start); tone.stop(start + 1.2);
    });
  }
  destroy() { clearTimeout(this.chestTimer); document.removeEventListener('keydown', this.keydown, true); }
}
