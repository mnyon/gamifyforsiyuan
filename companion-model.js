export const HABITICA_ASSETS = 'https://habitica-assets.s3.amazonaws.com/mobileApp/images/';
export const safeAsset = value => typeof value === 'string' && /^[\w-]+$/.test(value);
export function assetURL(name) { return safeAsset(name) ? `${HABITICA_ASSETS}${name}.png` : ''; }
export function plainNotes(value) { return String(value || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim(); }
export function skillBlockReason(skill, user) {
  if (!skill || !user) return '连接 Habitica 后查看职业技能';
  if (!['self', 'party'].includes(skill.target)) return skill.target === 'task' ? '需要指定 Habitica 任务，请前往 Habitica 施放' : '需要选择目标，请前往 Habitica 施放';
  if (user.preferences?.disableClasses) return '当前账号已关闭职业系统';
  if (Number(user.stats?.lvl || 0) < skill.lvl) return `等级 ${skill.lvl} 解锁`;
  if ((user.stats?.hp ?? 0) <= 0) return '请先在 Habitica 恢复角色';
  if (Number(user.stats?.mp || 0) < skill.mana) return '法力不足';
  if (skill.key === 'frost' && user.stats?.buffs?.streaks) return '冰霜增益已生效';
  return '';
}
export function resourceLimits(user, content) {
  const stats = user?.stats || {}, level = Math.max(1, Number(stats.lvl) || 1);
  const xp = level < 5 ? 25 * level : level === 5 ? 150 : Math.round((level * level * .25 + 10 * level + 139.75) / 10) * 10;
  let intelligence = Number(stats.int || 0) + Number(stats.buffs?.int || 0) + Math.floor(Math.min(100, level) / 2);
  for (const key of Object.values(user?.items?.gear?.equipped || {})) {
    const item = content?.gear?.flat?.[key]; if (!item) continue;
    intelligence += Number(item.int || 0) * (item.klass === stats.class || item.specialClass === stats.class ? 2 : 1);
  }
  return { hp: stats.maxHealth || 50, xp: stats.toNextLevel || xp, mp: stats.maxMP ?? user?._statsComputed?.maxMP ?? (content ? Math.max(0, intelligence * 2 + 30) : null) };
}
export function inventoryItems(user, content) {
  if (!user || !content) return [];
  const items = user.items || {}, equipped = Object.values(items.gear?.equipped || {}), result = [];
  const add = (key, item, image, category, quantity, worn = false) => {
    if (!quantity || !safeAsset(image)) return;
    result.push({ key: `${category}:${key}`, name: item?.text || key, notes: plainNotes(item?.notes), image, category, quantity, equipped: worn });
  };
  for (const [key, owned] of Object.entries(items.gear?.owned || {})) if (owned && !/_base_0$/.test(key)) {
    const item = content.gear?.flat?.[key]; add(key, item, key.startsWith('armor_') ? `${user.preferences?.size || 'slim'}_${key}` : key, 'gear', 1, equipped.includes(key));
  }
  for (const [field, category, prefix] of [['food', 'food', 'Pet_Food_'], ['eggs', 'other', 'Pet_Egg_'], ['hatchingPotions', 'other', 'Pet_HatchingPotion_'], ['quests', 'quest', 'inventory_quest_scroll_']]) {
    for (const [key, count] of Object.entries(items[field] || {})) if (Number(count) > 0) add(key, content[field]?.[key], prefix + key, category, Number(count));
  }
  return result.sort((a, b) => Number(b.equipped) - Number(a.equipped) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
export function shopItems(market, gearShop, seasonal, content, user) {
  const available = (gearShop?.categories || []).flatMap(c => c.items || []), byKey = new Map(available.map(i => [i.key, i]));
  const seen = new Set(), list = [];
  const add = raw => {
    if (!raw || !safeAsset(raw.key) || seen.has(raw.key)) return;
    const item = byKey.get(raw.key) || raw;
    if (item.purchaseType !== 'gear' && !content?.gear?.flat?.[item.key]) return;
    seen.add(item.key);
    list.push({ key: item.key, name: item.text || content.gear.flat[item.key]?.text || item.key, notes: plainNotes(item.notes || content?.gear?.flat?.[item.key]?.notes), price: Number(item.value), currency: item.currency || 'gems', image: safeAsset(item.class) ? item.class : item.key.startsWith('armor_') ? `${user.preferences?.size || 'slim'}_${item.key}` : item.key, owned: !!user.items?.gear?.owned?.[item.key], locked: !!item.locked, kind: 'gear' });
  };
  for (const item of market?.featured?.items || []) add(item);
  for (const category of seasonal?.categories || []) for (const item of category.items || []) if (!item.specialClass || item.specialClass === user.stats?.class) add(item);
  for (const item of available) if (!item.locked && !item.owned && (!item.klass || item.klass === user.stats?.class)) add(item);
  return [...list.slice(0, 12), { key: 'potion', name: content?.potion?.text || '治疗药水', notes: plainNotes(content?.potion?.notes || '立即恢复 15 点生命'), price: content?.potion?.value || 25, currency: 'gold', image: 'shop_potion', kind: 'potion' }, { key: 'armoire', name: content?.armoire?.text || '魔法宝箱', notes: '可能获得装备、宠物食物或经验；结果由 Habitica 决定。', price: content?.armoire?.value || 100, currency: 'gold', image: 'shop_armoire', kind: 'armoire', locked: !user.flags?.armoireEnabled }];
}
export function purchaseBlockReason(item, user) {
  if (item.owned || user?.items?.gear?.owned?.[item.key]) return '已拥有';
  if (item.locked) return '尚未解锁';
  if (item.currency !== 'gold') return '请前往 Habitica 官方商店购买';
  if (!Number.isFinite(item.price) || item.price < 0) return '价格暂不可用';
  if ((user?.stats?.hp ?? 0) <= 0) return '请先在 Habitica 恢复角色';
  if (item.kind === 'potion' && user.stats.hp >= (user.stats.maxHealth || 50)) return '生命已满';
  if (Number(user?.stats?.gp || 0) < item.price) return `还差 ${(item.price - Number(user?.stats?.gp || 0)).toFixed(2)} 金币`;
  return '';
}
export function armoireReward(result, content) {
  const drop = result?.armoire;
  if (!drop) return null;
  if (drop.type === 'experience' && Number.isFinite(drop.value)) return { name: `经验 +${drop.value}`, notes: '经验已由 Habitica 结算。', type: 'experience' };
  if (drop.type === 'gear' && safeAsset(drop.dropKey)) { const item = content?.gear?.flat?.[drop.dropKey]; return { name: drop.dropText || item?.text || drop.dropKey, notes: plainNotes(item?.notes), image: drop.dropKey.startsWith('armor_') ? `slim_${drop.dropKey}` : drop.dropKey, type: 'gear' }; }
  if (drop.type === 'food' && safeAsset(drop.dropKey)) return { name: drop.dropText || content?.food?.[drop.dropKey]?.text || drop.dropKey, notes: plainNotes(content?.food?.[drop.dropKey]?.notes), image: `Pet_Food_${drop.dropKey}`, type: 'food' };
  return null;
}
