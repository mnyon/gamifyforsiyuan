import { receiptConfirms } from '../domain/reward.js';
import type { ReconciliationPorts } from './ports.js';

export async function reconcileRewards(ports: ReconciliationPorts): Promise<void> {
  const { state, gateway, save, now, onMessage } = ports;
  for (const reward of state.rewards.filter(
    (reward) => reward.status === 'sending' || reward.status === 'uncertain',
  )) {
    if (!state.alias) throw new Error('奖励专用习惯尚未初始化');
    const task = await gateway.readTask(state.alias);
    if (receiptConfirms(reward, task, now())) {
      reward.status = 'sent';
      state.total++;
      onMessage('已核对，奖励领取成功');
    } else {
      reward.status = 'uncertain';
      onMessage('领取结果尚未确认，已暂停自动重试。请先核对 Habitica 中的专用习惯。');
      // Missing evidence is never proof of failure: retry requires explicit user confirmation.
      if (
        ports.requestRetry &&
        now() - (reward.attempted ?? now()) >= 60000 &&
        (await ports.confirmRetry())
      ) {
        reward.status = 'queued';
        ports.onRetryQueued();
        onMessage('将在下一次检查时重新领取');
      }
    }
    await save();
  }
}
