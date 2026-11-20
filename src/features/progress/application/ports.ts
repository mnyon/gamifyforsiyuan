import type { HabitReceipt, PlayerStats } from '../domain/reward.js';
import type { ProgressState, Reward } from '../domain/types.js';

/** HTTP/cache details stay outside the reward workflow. Reads must be fresh. */
export interface RewardGateway {
  readTask(alias: string): Promise<HabitReceipt>;
  readPlayer(): Promise<{ stats?: PlayerStats }>;
  score(alias: string): Promise<PlayerStats>;
}
export interface RewardWorkflow {
  state: ProgressState;
  gateway: RewardGateway;
  save(): Promise<void>;
  now(): number;
}
export interface SettlementPorts extends RewardWorkflow {
  shouldStop(): boolean;
  onSettled(reward: Reward, stats: PlayerStats): void;
}
export interface ReconciliationPorts extends RewardWorkflow {
  requestRetry: boolean;
  confirmRetry(): boolean | Promise<boolean>;
  onMessage(message: string): void;
  onRetryQueued(): void;
}
