import { skillBlockReason, purchaseBlockReason, equipBlockReason } from '../domain/eligibility.js';
import { hasUncertainResult } from '../domain/types.js';
import type { CompanionAction } from '../domain/types.js';
import type { ExecuteActionPorts } from './ports.js';

export interface ActionOutcome {
  result: unknown;
  message: string;
}
/** The composition root serializes this use case against all other account mutations. */
export async function executeAction(
  action: CompanionAction,
  ports: ExecuteActionPorts,
): Promise<ActionOutcome> {
  const { gateway, journal } = ports;
  if (journal.hasPending()) throw new Error('上次操作结果尚未确认，请先在 Habitica 核对');
  const catalog = await gateway.loadCatalog(action.kind);
  const user = await gateway.readPlayer();
  if (!ports.isCurrent()) throw new Error('连接已改变，请重新打开面板');
  ports.onUser(user);
  if (action.kind === 'cast') {
    const spell = catalog.skillFor(user, action.key);
    if (!spell) throw new Error('当前职业没有这个技能');
    const reason = skillBlockReason(spell, user);
    if (reason) throw new Error(reason);
  } else if (action.kind === 'equip') {
    const gear = catalog.gearFor(user, action.key);
    if (!gear) throw new Error('装备目录已变化，请重新打开背包');
    const reason = equipBlockReason(gear, user);
    if (reason) throw new Error(reason);
  } else {
    const item = catalog.productFor(user, action.key);
    if (!item) throw new Error('商品已变化，请重新打开商店');
    const reason = purchaseBlockReason(item, user);
    if (reason) throw new Error(reason);
  }
  // This must succeed before the non-idempotent request is issued.
  journal.begin(action, ports.now());
  ports.onStatus('pending');
  let result: unknown;
  try {
    result = await gateway.execute(action);
  } catch (error) {
    if (hasUncertainResult(error)) {
      gateway.invalidateUser();
      ports.onStatus('uncertain');
      throw new Error('操作结果尚未确认，请先在 Habitica 核对；不会自动重发。');
    }
    // A definitive rejection is retryable only after its durable marker is removed.
    journal.clear();
    ports.onStatus('');
    throw error;
  }
  gateway.invalidateUser();
  if (action.kind === 'buy') {
    gateway.invalidateShops();
    ports.onShopsInvalidated();
  }
  try {
    journal.clear();
  } catch {
    // Remote success is known. A local cleanup failure must never return to a retryable state.
    throw new Error(
      '操作已成功，但本机操作记录未能清除；请先在 Habitica 核对后解除暂停，不要重复提交。',
    );
  }
  ports.onStatus('');
  if (!ports.isCurrent()) return { result, message: '' };
  try {
    const updated = await gateway.readPlayer();
    if (ports.isCurrent()) ports.onUser(updated);
    return { result, message: '' };
  } catch {
    return { result, message: '操作已成功，角色数据暂未刷新，请稍后刷新。' };
  }
}
