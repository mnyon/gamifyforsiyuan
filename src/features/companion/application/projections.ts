import type {
  CompanionUser,
  CompanionContent,
  CatalogItem,
  ShopSnapshot,
  InventoryItem,
  ShopItem,
  ArmoireResult,
  RewardPresentation,
} from '../domain/types.js';
export const HABITICA_ASSETS = 'https://habitica-assets.s3.amazonaws.com/mobileApp/images/';
export const safeAsset = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w-]+$/.test(value);
export function assetURL(name: unknown) {
  return safeAsset(name) ? `${HABITICA_ASSETS}${name}.png` : '';
}
export function plainNotes(value: unknown) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}
export function resourceLimits(
  user: CompanionUser | null | undefined,
  content?: CompanionContent | null,
) {
  const stats = user?.stats || {},
    level = Math.max(1, Number(stats.lvl) || 1);
  const xp =
    level < 5
      ? 25 * level
      : level === 5
        ? 150
        : Math.round((level * level * 0.25 + 10 * level + 139.75) / 10) * 10;
  let intelligence =
    Number(stats.int || 0) + Number(stats.buffs?.int || 0) + Math.floor(Math.min(100, level) / 2);
  for (const key of Object.values(user?.items?.gear?.equipped || {})) {
    const item = content?.gear?.flat?.[key];
    if (!item) continue;
    intelligence +=
      Number(item.int || 0) *
      (item.klass === stats.class || item.specialClass === stats.class ? 2 : 1);
  }
  return {
    hp: stats.maxHealth || 50,
    xp: stats.toNextLevel || xp,
    mp:
      stats.maxMP ??
      user?._statsComputed?.maxMP ??
      (content ? Math.max(0, intelligence * 2 + 30) : null),
  };
}
export function inventoryItems(
  user: CompanionUser | null | undefined,
  content: CompanionContent | null | undefined,
): InventoryItem[] {
  if (!user || !content) return [];
  const items = user.items || {},
    equipped = Object.values(items.gear?.equipped || {}),
    result: InventoryItem[] = [];
  const add = (
    key: string,
    item: CatalogItem | undefined,
    image: string,
    category: string,
    quantity: number,
    worn = false,
  ) => {
    if (!quantity || !safeAsset(image)) return;
    result.push({
      key: `${category}:${key}`,
      name: item?.text || key,
      notes: plainNotes(item?.notes),
      image,
      category,
      quantity,
      equipped: worn,
    });
  };
  for (const [key, owned] of Object.entries(items.gear?.owned || {}))
    if (owned && !/_base_0$/.test(key)) {
      const item = content.gear?.flat?.[key];
      add(
        key,
        item,
        key.startsWith('armor_') ? `${user.preferences?.size || 'slim'}_${key}` : key,
        'gear',
        1,
        equipped.includes(key),
      );
    }
  for (const [field, category, prefix] of [
    ['food', 'food', 'Pet_Food_'],
    ['eggs', 'other', 'Pet_Egg_'],
    ['hatchingPotions', 'other', 'Pet_HatchingPotion_'],
    ['quests', 'quest', 'inventory_quest_scroll_'],
  ] as const) {
    for (const [key, count] of Object.entries(items[field] || {}))
      if (Number(count) > 0) add(key, content[field]?.[key], prefix + key, category, Number(count));
  }
  return result.sort(
    (a, b) =>
      Number(b.equipped) - Number(a.equipped) ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name),
  );
}
export function shopItems(
  market: ShopSnapshot | null | undefined,
  gearShop: ShopSnapshot | null | undefined,
  seasonal: ShopSnapshot | null | undefined,
  content: CompanionContent | null | undefined,
  user: CompanionUser,
): ShopItem[] {
  const available = (gearShop?.categories || []).flatMap((c) => c.items || []),
    byKey = new Map(available.map((i) => [i.key, i]));
  const seen = new Set(),
    list: ShopItem[] = [];
  const add = (raw: CatalogItem | undefined) => {
    if (!raw || !safeAsset(raw.key) || seen.has(raw.key)) return;
    const item = byKey.get(raw.key) || raw;
    if (!item.key) return;
    if (item.purchaseType !== 'gear' && !content?.gear?.flat?.[item.key]) return;
    seen.add(item.key);
    list.push({
      key: item.key,
      name: item.text || content?.gear?.flat?.[item.key]?.text || item.key,
      notes: plainNotes(item.notes || content?.gear?.flat?.[item.key]?.notes),
      price: Number(item.value),
      currency: item.currency || 'gems',
      image: safeAsset(item.class)
        ? item.class
        : item.key.startsWith('armor_')
          ? `${user.preferences?.size || 'slim'}_${item.key}`
          : item.key,
      owned: !!user.items?.gear?.owned?.[item.key],
      locked: !!item.locked,
      kind: 'gear',
    });
  };
  for (const item of market?.featured?.items || []) add(item);
  for (const category of seasonal?.categories || [])
    for (const item of category.items || [])
      if (!item.specialClass || item.specialClass === user.stats?.class) add(item);
  for (const item of available)
    if (!item.locked && !item.owned && (!item.klass || item.klass === user.stats?.class)) add(item);
  return [
    ...list.slice(0, 12),
    {
      key: 'potion',
      name: content?.potion?.text || '治疗药水',
      notes: plainNotes(content?.potion?.notes || '立即恢复 15 点生命'),
      price: content?.potion?.value || 25,
      currency: 'gold',
      image: 'shop_potion',
      kind: 'potion',
    },
    {
      key: 'armoire',
      name: content?.armoire?.text || '魔法宝箱',
      notes: '可能获得装备、宠物食物或经验；结果由 Habitica 决定。',
      price: content?.armoire?.value || 100,
      currency: 'gold',
      image: 'shop_armoire',
      kind: 'armoire',
      locked: !user.flags?.armoireEnabled,
    },
  ];
}
export function armoireReward(
  result: ArmoireResult | null | undefined,
  content: CompanionContent | null | undefined,
): RewardPresentation | null {
  const drop = result?.armoire;
  if (!drop) return null;
  if (drop.type === 'experience' && typeof drop.value === 'number' && Number.isFinite(drop.value))
    return { name: `经验 +${drop.value}`, notes: '经验已由 Habitica 结算。', type: 'experience' };
  if (drop.type === 'gear' && safeAsset(drop.dropKey)) {
    const item = content?.gear?.flat?.[drop.dropKey];
    return {
      name: drop.dropText || item?.text || drop.dropKey,
      notes: plainNotes(item?.notes),
      image: drop.dropKey.startsWith('armor_') ? `slim_${drop.dropKey}` : drop.dropKey,
      type: 'gear',
    };
  }
  if (drop.type === 'food' && safeAsset(drop.dropKey))
    return {
      name: drop.dropText || content?.food?.[drop.dropKey]?.text || drop.dropKey,
      notes: plainNotes(content?.food?.[drop.dropKey]?.notes),
      image: `Pet_Food_${drop.dropKey}`,
      type: 'food',
    };
  return null;
}

export function avatarLayers(user: CompanionUser) {
  const p = user.preferences || {};
  const gear = user.items?.gear?.[p.costume ? 'costume' : 'equipped'] || {};
  const size = p.size || 'slim';
  const hair = p.hair || {};
  const layers = [
    p.chair && `chair_${p.chair}`,
    gear.back,
    `skin_${p.skin || 'ddc994'}${p.sleep ? '_sleep' : ''}`,
    `${size}_shirt_${p.shirt || 'black'}`,
    'head_0',
    gear.armor && `${size}_${gear.armor}`,
    gear.back_collar,
    ...(['bangs', 'base', 'mustache', 'beard'] as const).map(
      (slot) => hair[slot] && `hair_${slot}_${hair[slot]}_${hair.color || 'brown'}`,
    ),
    gear.body,
    gear.eyewear,
    gear.head,
    gear.headAccessory,
    hair.flower && `hair_flower_${hair.flower}`,
    gear.shield,
    gear.weapon,
    p.sleep && 'zzz',
  ];
  return layers.filter(
    (v): v is string =>
      typeof v === 'string' && !!v && /^[\w-]+$/.test(v) && !/(?:_base_0|chair_none)$/.test(v),
  );
}

export { skillBlockReason, purchaseBlockReason } from '../domain/eligibility.js';
