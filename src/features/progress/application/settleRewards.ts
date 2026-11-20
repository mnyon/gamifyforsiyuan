import { assertDedicatedHabit, earnedGold, scoredHistory } from '../domain/reward.js';
import type { SettlementPorts } from './ports.js';

function uncertain(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'uncertain' in error && !!error.uncertain;
}

/** The caller serializes settlement against purchases and reconciliation. */
export async function settleRewards(ports: SettlementPorts): Promise<void> {
  const { state, gateway, save, now, shouldStop, onSettled } = ports;
  if (state.rewards.some((reward) => reward.status === 'sending' || reward.status === 'uncertain'))
    return;
  for (const reward of state.rewards.filter((reward) => reward.status === 'queued')) {
    if (shouldStop()) break;
    const alias = state.alias;
    if (!alias) throw new Error('奖励专用习惯尚未初始化');
    const task = await gateway.readTask(alias);
    assertDedicatedHabit(task);
    const playerBefore = await gateway.readPlayer();
    reward.goldBefore = playerBefore.stats?.gp;
    reward.before = task.counterUp || 0;
    reward.historyBefore = scoredHistory(task);
    reward.status = 'sending';
    reward.attempted = now();
    // A durable before-counter MUST precede the non-idempotent remote mutation.
    await save();
    try {
      const stats = await gateway.score(alias);
      reward.gold = earnedGold(reward.goldBefore, stats.gp);
      reward.status = 'sent';
      state.total++;
      await save();
      onSettled(reward, stats);
    } catch (error) {
      // A failed post-score save or visual effect must never make a scored reward retryable.
      if (reward.status === 'sent') throw error;
      reward.status = uncertain(error) ? 'uncertain' : 'queued';
      await save();
      throw error;
    }
  }
}
