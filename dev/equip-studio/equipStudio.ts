// Equip studio: an offline prototype of the equip/unequip loop. A fictional
// account and a simulated gateway exercise the interaction and the plugin's
// pause-on-uncertainty semantics without ever touching the real Habitica API.
import { required } from '../../src/presentation/elements.js';
import {
  assetURL,
  avatarLayers,
  inventoryItems,
} from '../../src/features/companion/application/projections.js';
import type {
  CompanionContent,
  CompanionUser,
  InventoryItem,
} from '../../src/features/companion/domain/types.js';
import PREVIEW_CSS from '../../src/presentation/styles.css';

const STUDIO_CSS = `
.stage-card{width:342px;max-width:100%;margin:auto;background:var(--panel);border:1px solid #ffffff1b;border-radius:20px;overflow:hidden;box-shadow:0 24px 80px #0005,0 4px 18px #0003}
.avatar-body{position:absolute;inset:0;transform-origin:bottom center;animation:avatar-idle 3.2s ease-in-out infinite}
.equip-flash .avatar-body{animation:avatar-idle 3.2s ease-in-out infinite,equip-pop .55s ease-out}
@keyframes avatar-idle{0%,100%{transform:translateY(0) scaleY(.995)}50%{transform:translateY(-1.5px) scaleY(1.01)}}
@keyframes equip-pop{0%{transform:scale(1);filter:none}30%{transform:scale(1.06) translateY(-2px);filter:drop-shadow(0 0 10px #c5acf988)}100%{transform:scale(1);filter:none}}
.loadout{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:12px 16px 16px}
.loadout span{font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:3px 8px}
.loadout b{color:#e6d3ae;font-weight:500}
.bag-panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px}
.bag-panel .bag-tabs{margin-bottom:12px}
.detail-actions{margin-top:10px}
.detail-actions .primary{width:auto;padding:7px 18px;font-size:11px}
.sim-row{display:flex;gap:8px;align-items:center;margin-top:14px;font-size:11px;color:var(--muted)}
.sim-row select{font:inherit;background:#ffffff06;color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:5px 8px}
.state-badge{font-size:10px;border-radius:6px;padding:3px 9px;border:1px solid var(--line);color:var(--muted)}
.state-badge.busy{color:#eac787;border-color:#eac78744}
.state-badge.paused{color:#ea9aab;border-color:#ea9aab44}
.equip-status{font-size:11px;color:var(--mint);min-height:36px;margin:10px 0 0;line-height:1.7}
.equip-status.warn{color:#ea9aab}
#ack{margin-top:8px;font-size:11px;padding:7px 14px}
`;

// Fictional catalog: real asset keys so sprites load, invented text.
const gearCatalog: Record<string, { text: string; notes: string; klass: string }> = {
  weapon_warrior_1: { text: '训练剑', notes: '战士的入门武器，结实可靠。', klass: 'warrior' },
  weapon_rogue_4: { text: '暗影短剑', notes: '轻盈利刃，适合迅捷的连击。', klass: 'rogue' },
  weapon_wizard_1: { text: '学徒法杖', notes: '蕴含微弱法力的木质法杖。', klass: 'wizard' },
  shield_warrior_1: { text: '圆木盾', notes: '朴素的防御装备。', klass: 'warrior' },
  shield_rogue_4: { text: '盗贼轻盾', notes: '不妨碍行动的轻便小盾。', klass: 'rogue' },
  head_warrior_1: { text: '铁盔', notes: '保护头部的基本护具。', klass: 'warrior' },
  head_rogue_4: { text: '暗影兜帽', notes: '遮住面容，融入夜色。', klass: 'rogue' },
  head_wizard_1: { text: '尖顶法师帽', notes: '学徒的标志性帽子。', klass: 'wizard' },
  armor_warrior_1: { text: '链甲', notes: '环环相扣的金属护甲。', klass: 'warrior' },
  armor_rogue_4: { text: '夜行衣', notes: '深色紧身衣，行动无声。', klass: 'rogue' },
  armor_wizard_1: { text: '学徒长袍', notes: '绣着基础符文的长袍。', klass: 'wizard' },
};
const content: CompanionContent = {
  gear: {
    flat: Object.fromEntries(
      Object.entries(gearCatalog).map(([key, item]) => [key, { key, ...item, value: 20 }]),
    ),
  },
};
const user: CompanionUser = {
  profile: { name: '预览冒险者' },
  stats: { lvl: 42, class: 'rogue', hp: 43, maxHealth: 50, gp: 128.5 },
  preferences: {
    skin: 'ddc994',
    size: 'slim',
    shirt: 'black',
    hair: { base: 1, bangs: 1, color: 'brown' },
  },
  items: {
    gear: {
      owned: Object.fromEntries(Object.keys(gearCatalog).map((key) => [key, true])),
      equipped: { weapon: 'weapon_warrior_1', armor: 'armor_warrior_1' },
    },
  },
};

const slots = [
  ['weapon', '武器'],
  ['shield', '盾牌'],
  ['head', '头部'],
  ['armor', '护甲'],
] as const;
type Slot = (typeof slots)[number][0];
const slotOf = (itemKey: string) => itemKey.split(':')[1].split('_')[0] as Slot;
const slotLabel = (slot: Slot) => slots.find(([key]) => key === slot)?.[1] || slot;

const host = required(document, '#stage');
const stage = host.attachShadow({ mode: 'open' });
stage.innerHTML = `<style>${PREVIEW_CSS}</style><style>${STUDIO_CSS}</style>
  <div class="stage-card"><div class="dashboard">
    <div class="scene"><div class="orbit"></div><i class="star s1">✦</i><i class="star s2">✧</i><i class="star s3">·</i><i class="star s4">✦</i><div class="moon"></div><div class="hill back"></div><div class="hill front"></div><div class="pedestal"></div><div class="avatar" role="img" aria-label="Habitica 角色"><span class="placeholder">✧</span></div></div>
    <div class="identity"><span class="eyebrow player-caption">YOUR ADVENTURE</span><h2 class="player-name"></h2><div class="player-meta"></div></div>
    <div class="loadout"></div>
  </div></div>`;
const stageCard = required(stage, '.stage-card');

// Simplified mirror of GamifyView's avatar rebuild (no mount/pet in this study).
function renderAvatar() {
  const avatar = required(stage, '.avatar');
  avatar.replaceChildren();
  const placeholder = document.createElement('span');
  placeholder.className = 'placeholder';
  placeholder.textContent = '✧';
  const body = document.createElement('div');
  body.className = 'avatar-body';
  avatar.append(placeholder, body);
  let loaded = 0;
  for (const name of avatarLayers(user)) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.className = 'character-layer';
    img.src = assetURL(name);
    img.onload = () => {
      if (++loaded > 1) placeholder.hidden = true;
    };
    img.onerror = () => {
      img.remove();
      if (loaded < 2) placeholder.title = '角色素材暂时无法加载';
    };
    body.append(img);
  }
  required(stage, '.player-name').textContent = user.profile?.name || '冒险者';
  required(stage, '.player-meta').textContent = `Lv. ${user.stats?.lvl ?? 1} · 盗贼`;
  const loadout = required(stage, '.loadout');
  loadout.replaceChildren();
  const equipped = user.items?.gear?.equipped || {};
  for (const [slot, label] of slots) {
    const chip = document.createElement('span');
    const key = equipped[slot];
    chip.append(`${label} `);
    const b = document.createElement('b');
    b.textContent = key ? gearCatalog[key]?.text || key : '空';
    chip.append(b);
    loadout.append(chip);
  }
}
function flashAvatar() {
  stageCard.classList.remove('equip-flash');
  // Restart the one-shot pop even on consecutive equips.
  void stageCard.offsetWidth;
  stageCard.classList.add('equip-flash');
  setTimeout(() => stageCard.classList.remove('equip-flash'), 600);
}

// Simulated gateway: mirrors executeAction's pause-on-uncertainty contract.
type SimMode = 'ok' | 'reject' | 'uncertain';
let mode: SimMode = 'ok';
let busy = false;
let paused = false;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const status = required(document, '#equip-status');
const badge = required(document, '#state-badge');
const ack = required(document, '#ack') as HTMLButtonElement;
function paintState(message: string, warn = false) {
  badge.textContent = busy ? '请求中' : paused ? '已暂停' : '空闲';
  badge.className = 'state-badge' + (busy ? ' busy' : paused ? ' paused' : '');
  status.textContent = message;
  status.classList.toggle('warn', warn);
  ack.hidden = !paused;
}
async function submit(item: InventoryItem, equip: boolean) {
  if (busy) return;
  if (paused) {
    paintState('已暂停：请先核对上一次不确定的结果，再尝试新操作。', true);
    return;
  }
  busy = true;
  renderBag();
  paintState(`正在${equip ? '穿戴' : '卸下'} ${item.name}……（模拟延迟 500ms）`);
  await wait(500);
  busy = false;
  if (mode === 'reject') {
    renderBag();
    paintState('被明确拒绝：该装备当前不可穿戴（模拟）。标记已清除，可以重试。', true);
    return;
  }
  if (mode === 'uncertain') {
    paused = true;
    renderBag();
    paintState('结果不确定：请求可能已生效。本地状态不变、后续操作暂停，绝不自动重发。', true);
    return;
  }
  const equipped = user.items!.gear!.equipped!;
  const slot = slotOf(item.key);
  if (equip) equipped[slot] = item.key.split(':')[1];
  else delete equipped[slot];
  renderAvatar();
  flashAvatar();
  renderBag();
  paintState(`已${equip ? '穿戴' : '卸下'} ${item.name}，角色即时重绘。`);
}
ack.onclick = () => {
  paused = false;
  renderBag();
  paintState('已人工核对并解除暂停（模拟：假定已在 Habitica 侧确认结果）。');
};

// Bag UI reuses the plugin's visual language and the real inventory projection.
let category: 'all' | Slot = 'all';
let selectedKey = '';
const tabs = required(document, '#bag-tabs');
const grid = required(document, '#bag-grid');
const detail = required(document, '#bag-detail');
function renderBag() {
  const items = inventoryItems(user, content);
  tabs.replaceChildren();
  for (const [key, label] of [['all', '全部'], ...slots] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-selected', String(category === key));
    b.onclick = () => {
      category = key;
      renderBag();
    };
    tabs.append(b);
  }
  const filtered = category === 'all' ? items : items.filter((i) => slotOf(i.key) === category);
  if (!filtered.some((i) => i.key === selectedKey)) selectedKey = filtered[0]?.key || '';
  const selected = filtered.find((i) => i.key === selectedKey);
  grid.replaceChildren();
  for (const item of filtered) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bag-slot' + (item.key === selectedKey ? ' selected' : '');
    b.title = item.name;
    b.setAttribute('aria-label', `${item.name}${item.equipped ? '，已装备' : ''}`);
    b.setAttribute('aria-pressed', String(item.key === selectedKey));
    const img = document.createElement('img');
    img.src = assetURL(item.image);
    img.alt = '';
    img.onerror = () => img.remove();
    b.append(img);
    if (item.equipped) {
      const dot = document.createElement('i');
      dot.className = 'equipped-dot';
      b.append(dot);
    }
    b.onclick = () => {
      selectedKey = item.key;
      renderBag();
    };
    grid.append(b);
  }
  for (let i = filtered.length; i < 8; i++) {
    const empty = document.createElement('span');
    empty.className = 'bag-slot empty';
    empty.textContent = '◇';
    empty.setAttribute('aria-hidden', 'true');
    grid.append(empty);
  }
  detail.replaceChildren();
  if (!selected) {
    detail.append(document.createTextNode('这个分类暂时没有物品。'));
    return;
  }
  const art = document.createElement('div');
  art.className = 'detail-art';
  const artImg = document.createElement('img');
  artImg.src = assetURL(selected.image);
  artImg.alt = '';
  artImg.onerror = () => artImg.remove();
  art.append(artImg);
  const info = document.createElement('div');
  const type = document.createElement('div');
  type.className = 'detail-type';
  type.textContent = `${slotLabel(slotOf(selected.key))} · ${selected.equipped ? '已装备' : '持有物品'}`;
  const h3 = document.createElement('h3');
  h3.textContent = selected.name;
  const p = document.createElement('p');
  p.textContent = selected.notes || '官方暂未提供物品说明';
  info.append(type, h3, p);
  const actions = document.createElement('div');
  actions.className = 'detail-actions';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  button.textContent = busy ? '请求中……' : selected.equipped ? '卸下' : '穿戴';
  button.disabled = busy || paused;
  button.onclick = () => submit(selected, !selected.equipped);
  actions.append(button);
  info.append(actions);
  detail.append(art, info);
}

const modeSelect = required(document, '#sim-mode') as HTMLSelectElement;
modeSelect.onchange = () => {
  mode = modeSelect.value as SimMode;
};

renderAvatar();
renderBag();
paintState('选择一件物品，点击"穿戴"或"卸下"。所有请求均为本地模拟。');
