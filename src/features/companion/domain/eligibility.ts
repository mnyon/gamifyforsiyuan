import type { CompanionSkill, CompanionUser, EquippableGear, PurchasableItem } from './types.js';

export function skillBlockReason(
  skill: CompanionSkill | null | undefined,
  user: CompanionUser | null | undefined,
) {
  if (!skill || !user) return '连接 Habitica 后查看职业技能';
  if (!['self', 'party'].includes(skill.target || ''))
    return skill.target === 'task'
      ? '需指定任务的技能，暂时不支持释放'
      : '需选择目标的技能，暂时不支持释放';
  if (user.preferences?.disableClasses) return '当前账号已关闭职业系统';
  if (Number(user.stats?.lvl || 0) < skill.lvl) return `等级 ${skill.lvl} 解锁`;
  if ((user.stats?.hp ?? 0) <= 0) return '请先在 Habitica 恢复角色';
  if (Number(user.stats?.mp || 0) < skill.mana) return '法力不足';
  if (skill.key === 'frost' && user.stats?.buffs?.streaks) return '冰霜增益已生效';
  return '';
}

export function equipBlockReason(
  gear: EquippableGear | null | undefined,
  user: CompanionUser | null | undefined,
) {
  if (!gear || !user) return '连接 Habitica 后管理装备';
  if (user.items?.gear?.owned?.[gear.key] !== true) return '尚未持有这件装备';
  return '';
}

export function purchaseBlockReason(item: PurchasableItem, user: CompanionUser | null | undefined) {
  if (item.owned || user?.items?.gear?.owned?.[item.key]) return '已拥有';
  if (item.locked) return '尚未解锁';
  if (item.currency !== 'gold') return '请前往 Habitica 官方商店购买';
  if (!Number.isFinite(item.price) || item.price < 0) return '价格暂不可用';
  if ((user?.stats?.hp ?? 0) <= 0) return '请先在 Habitica 恢复角色';
  if (item.kind === 'potion' && (user?.stats?.hp ?? 0) >= (user?.stats?.maxHealth || 50))
    return '生命已满';
  if (Number(user?.stats?.gp || 0) < item.price)
    return `还差 ${(item.price - Number(user?.stats?.gp || 0)).toFixed(2)} 金币`;
  return '';
}
