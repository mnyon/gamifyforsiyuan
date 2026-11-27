import { required, errorMessage } from '../../../presentation/elements.js';
import type { GamifyView } from '../../../presentation/GamifyView.js';
import type {
  CompanionUser,
  CompanionContent,
  ShopSnapshot,
  ArmoireResult,
  RewardPresentation,
} from '../domain/types.js';
export type AdventurePage = 'home' | 'shop' | 'bag';
export interface AdventureOptions {
  onLoad?: (page: AdventurePage) => Promise<void>;
  onAction?: (kind: 'buy' | 'cast' | 'equip', key: string) => Promise<ArmoireResult | void>;
}
export interface AdventureSnapshot {
  user?: CompanionUser | null;
  content?: CompanionContent | null;
  shops?: { market: ShopSnapshot; gear: ShopSnapshot; seasonal: ShopSnapshot } | null;
  busy?: boolean;
  blocked?: string;
  testMode?: boolean;
}
import { assetURL, resourceLimits } from '../application/projections.js';
import { SkillPanel } from './SkillPanel.js';
import { ShopPanel } from './ShopPanel.js';
import { BagPanel } from './BagPanel.js';
import { ChestOverlay, type ChestState } from './ChestOverlay.js';

// All remote names and descriptions enter the DOM through textContent.
export const PACK_ART =
  '<svg viewBox="0 0 64 64" aria-hidden="true" shape-rendering="crispEdges"><path d="M24 9h16v5h5v5h6v35H13V19h6v-5h5z" fill="#211822"/><path d="M26 11h12v9h-4v-5h-4v5h-4z" fill="#c59c64"/><path d="M19 22h26v30H19z" fill="#674238"/><path d="M15 29h7v22h-7zm27 0h7v22h-7z" fill="#96664a"/><path d="M20 20h24v16H20z" fill="#bd8d58"/><path d="M23 20h18v4H23z" fill="#dfb778"/><path d="M23 38h18v14H23z" fill="#9c6848"/><path d="M28 29h8v11h-8z" fill="#4e3330"/><path d="M29 30h6v6h-6z" fill="#edca7c"/><path d="M31 31h2v3h-2z" fill="#67442e"/><path d="M17 51h30v4H17z" fill="#3b2930"/><path d="M14 23h6v5h-6zm30 0h6v5h-6z" fill="#dec89f"/></svg>';
/**
 * Adventure shell: navigation, shared snapshot state and the dialog/overlay
 * infrastructure. Page rendering lives in SkillPanel/ShopPanel/BagPanel and
 * the armoire reveal in ChestOverlay, each holding this view as its host.
 */
export class AdventureView {
  view: GamifyView;
  root: ShadowRoot;
  onLoad: NonNullable<AdventureOptions['onLoad']>;
  onAction: NonNullable<AdventureOptions['onAction']>;
  page: AdventurePage;
  base: string;
  shopButton: HTMLButtonElement;
  bagButton: HTMLButtonElement;
  element: HTMLDivElement;
  overlay: HTMLDivElement;
  keydown: (event: KeyboardEvent) => void;
  previousPage?: AdventurePage;
  user: CompanionUser | null = null;
  content?: CompanionContent | null;
  shops?: AdventureSnapshot['shops'];
  busy = false;
  blocked = '';
  testMode = false;
  signature = '';
  lastFocus: Element | null = null;
  performing = false;
  readonly skills: SkillPanel;
  readonly shop: ShopPanel;
  readonly bag: BagPanel;
  private readonly chestOverlay: ChestOverlay;
  constructor(
    view: GamifyView,
    { onLoad = async () => {}, onAction = async () => {} }: AdventureOptions = {},
  ) {
    this.view = view;
    this.root = view.root;
    this.onLoad = onLoad;
    this.onAction = onAction;
    this.page = 'home';
    this.base = `/plugins/gamify-for-siyuan/assets/`;
    const identity = required(this.root, '.identity');
    const info = document.createElement('div');
    while (identity.firstChild) info.append(identity.firstChild);
    identity.append(info);
    const shop = document.createElement('button');
    shop.className = 'shop-entry';
    shop.type = 'button';
    shop.setAttribute('aria-label', '进入旅人商店');
    shop.innerHTML = `<span class="shop-window"><span class="window-glow"></span><img data-src="${this.base}market_banner_npc-crop.png" alt="市场商人 Alex"><span class="window-spark">✧</span></span><span class="shop-plaque">旅人商店 <b>›</b></span>`;
    identity.append(shop);
    this.shopButton = shop;
    shop.onclick = () => this.navigate('shop');
    const bag = document.createElement('button');
    bag.className = 'bag-entry';
    bag.type = 'button';
    bag.setAttribute('aria-label', '打开冒险背包');
    bag.innerHTML = `<span class="bag-window">${PACK_ART}<span class="bag-stars">✧</span></span><span class="bag-plaque">冒险背包 ›</span>`;
    required(this.root, '.scene').append(bag);
    this.bagButton = bag;
    bag.onclick = () => this.navigate('bag');
    const vitals = required(this.root, '.vitals');
    for (const [kind, label] of [
      ['xp', '✦ 经验值'],
      ['mp', '◆ 法力值'],
    ]) {
      const row = document.createElement('div');
      row.className = 'extra-vital';
      row.innerHTML = `<div class="bar-label"><span>${label}</span><span class="${kind}-text"></span></div><div class="track ${kind}"><span></span></div>`;
      vitals.insertBefore(row, vitals.querySelector('.coins'));
    }
    this.element = document.createElement('div');
    this.element.className = 'adventure';
    this.element.innerHTML = `<section class="skill-section"><div class="section-label"><span>职业技能</span></div><div class="skills"></div><p class="skill-guidance">需指定任务或成员的技能，暂时不支持释放。</p></section><section class="adventure-shop" hidden><button class="back">← 返回角色</button><div class="shop-top"><div><span class="eyebrow">THE TRAVELER'S GOODS</span><h2>旅人商店</h2></div><span class="shop-gold"></span></div><div class="market-panorama"><img data-src="${this.base}market_banner_npc-crop.png" alt="商人 Alex"><span class="merchant-name">◆ Alex ◆</span></div><div class="equipment-shelf"><div class="products"></div></div><p class="shop-state" role="status"></p></section><section class="adventure-bag" hidden><button class="back">← 返回角色</button><div class="bag-heading bag-heading-merged"><div class="bag-title-art">${PACK_ART}</div><div class="bag-title-copy"><span class="label">YOUR ADVENTURE KIT</span><h2>冒险背包</h2></div><span class="bag-total"></span><span class="bag-heading-star" aria-hidden="true">✧</span></div><div class="bag-tabs" role="group" aria-label="背包分类"></div><div class="bag-grid"></div><div class="bag-detail" aria-live="polite"></div></section><p class="adventure-status" role="status"></p>`;
    required(this.root, '.vitals').after(this.element);
    this.element
      .querySelectorAll<HTMLElement>('.back')
      .forEach((b) => (b.onclick = () => this.navigate('home')));
    this.overlay = document.createElement('div');
    this.overlay.className = 'adventure-overlay';
    this.overlay.hidden = true;
    this.view.card.append(this.overlay);
    this.overlay.onclick = (e) => {
      if (
        e.target === this.overlay ||
        (e.target instanceof Element ? e.target : null)?.closest('[data-dismiss]')
      )
        this.dismiss();
    };
    this.keydown = (e) => {
      if (this.overlay.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.dismiss();
      }
      if (e.key === 'Tab') {
        const nodes = [
            ...this.overlay.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input'),
          ],
          first = nodes[0],
          last = nodes.at(-1);
        if (
          e.shiftKey &&
          document.activeElement === this.view.host &&
          this.root.activeElement === first
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && this.root.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', this.keydown, true);
    this.skills = new SkillPanel(this);
    this.shop = new ShopPanel(this);
    this.bag = new BagPanel(this);
    this.chestOverlay = new ChestOverlay(this);
  }
  node<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: unknown,
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  image(name: unknown, cls = '') {
    const img = this.node('img', cls);
    img.alt = '';
    img.draggable = false;
    img.loading = 'lazy';
    img.src = assetURL(name);
    img.onerror = () => {
      img.hidden = true;
    };
    return img;
  }
  text(selector: string, value: string) {
    const n = required(this.root, selector);
    if (n) n.textContent = value;
  }
  async navigate(page: AdventurePage) {
    if (!this.overlay.hidden) this.dismiss();
    this.page = page;
    this.updateVisibility();
    this.view.card.scrollTop = 0;
    if (page === 'home') {
      (this.previousPage === 'bag' ? this.bagButton : this.shopButton).focus();
      return;
    }
    this.previousPage = page;
    required(this.element, `.adventure-${page} .back`).focus();
    this.text('.adventure-status', '正在读取…');
    try {
      await this.onLoad(page);
      if (!this.view.destroyed) this.text('.adventure-status', '');
    } catch (error) {
      if (!this.view.destroyed) this.text('.adventure-status', errorMessage(error));
    }
  }
  updateVisibility() {
    const home = this.page === 'home';
    for (const selector of ['.scene', '.identity', '.vitals', '.skill-section'])
      required(this.root, selector).hidden =
        !home || (!this.user && selector !== '.scene' && selector !== '.identity');
    required(this.root, '.adventure-shop').hidden = this.page !== 'shop';
    required(this.root, '.adventure-bag').hidden = this.page !== 'bag';
    this.bagButton.hidden = this.shopButton.hidden = !this.user || this.testMode;
  }
  update({
    user,
    content,
    shops,
    busy = false,
    blocked = '',
    testMode = false,
  }: AdventureSnapshot = {}) {
    this.user = user || null;
    this.content = content;
    this.shops = shops;
    this.busy = busy;
    this.blocked = blocked;
    this.testMode = testMode;
    if (!user || testMode) this.page = 'home';
    this.updateVisibility();
    if (user && !testMode)
      for (const img of this.root.querySelectorAll<HTMLImageElement>('img[data-src]')) {
        img.src = img.dataset.src || '';
        delete img.dataset.src;
      }
    if (!user) {
      this.element.hidden = true;
      return;
    }
    this.element.hidden = testMode;
    const limits = resourceLimits(user, content);
    for (const [kind, current, max] of [
      ['xp', user.stats?.exp || 0, limits.xp],
      ['mp', user.stats?.mp || 0, limits.mp],
    ] as const) {
      this.text(`.${kind}-text`, `${Math.floor(current)} / ${max === null ? '—' : max}`);
      const bar = required(this.root, `.${kind}`);
      required(bar, 'span').style.width =
        `${max ? Math.max(0, Math.min(100, (current / max) * 100)) : 0}%`;
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', kind === 'xp' ? '经验值' : '法力值');
      bar.setAttribute('aria-valuenow', String(current));
      bar.setAttribute('aria-valuemin', '0');
      if (max !== null) bar.setAttribute('aria-valuemax', String(max));
    }
    this.skills.update();
    const signature = JSON.stringify([
      user.stats,
      user.items,
      user.preferences,
      !!content,
      shops,
      busy,
      blocked,
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.shop.render();
      this.bag.render();
    }
    this.text('.adventure-status', blocked);
  }
  dialog(
    title: string,
    notes: string,
    label: string,
    action: () => unknown | Promise<unknown>,
    disabled = false,
  ) {
    this.lastFocus = this.root.activeElement;
    this.overlay.replaceChildren();
    this.overlay.className = 'adventure-overlay';
    this.overlay.hidden = false;
    const sheet = this.node('section', 'adventure-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'adventure-dialog-title');
    const heading = this.node('h3', '', title);
    heading.id = 'adventure-dialog-title';
    const text = this.node('p', '', notes),
      status = this.node('p', 'dialog-status');
    status.setAttribute('role', 'status');
    const controls = this.node('div', 'dialog-actions');
    const cancel = this.node('button', 'secondary', '返回');
    cancel.type = 'button';
    cancel.dataset.dismiss = '';
    const submit = this.node('button', 'primary', label);
    submit.type = 'button';
    submit.disabled = disabled;
    submit.onclick = async () => {
      if (this.performing) return;
      this.performing = true;
      submit.disabled = cancel.disabled = true;
      status.textContent = '正在请求 Habitica，请稍候…';
      try {
        await this.view.unlockSound();
        await action();
      } catch (error) {
        if (!this.view.destroyed) {
          status.textContent = errorMessage(error);
          cancel.disabled = false; /* Re-open to revalidate before any retry. */
        }
      } finally {
        this.performing = false;
      }
    };
    controls.append(cancel, submit);
    sheet.append(heading, text, status, controls);
    this.overlay.append(sheet);
    this.view.card.scrollTop = 0;
    cancel.focus();
  }
  dismiss(force = false) {
    if (this.performing && !force) return;
    const chest = this.chestOverlay.chest;
    if (chest && !chest.revealed && !force) {
      this.chestOverlay.reveal();
      return;
    }
    this.chestOverlay.reset();
    this.overlay.hidden = true;
    this.overlay.replaceChildren();
    this.lastFocus?.isConnected && (this.lastFocus as HTMLElement).focus();
  }
  // Compatibility surface: verification tools and callers address the chest
  // through the adventure view; the overlay owns the actual state.
  get chest(): ChestState | null {
    return this.chestOverlay.chest;
  }
  openChest(reward: RewardPresentation | null) {
    this.chestOverlay.open(reward);
  }
  revealChest() {
    this.chestOverlay.reveal();
  }
  destroy() {
    this.chestOverlay.destroy();
    document.removeEventListener('keydown', this.keydown, true);
  }
}
