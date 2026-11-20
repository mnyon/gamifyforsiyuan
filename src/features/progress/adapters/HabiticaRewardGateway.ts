import type { RewardGateway } from '../application/ports.js';
import type { HabitReceipt, PlayerStats } from '../domain/reward.js';

/** Minimal structural contract for verified reward settlement. */
export interface HabiticaRewardClient {
  task(alias: string): Promise<HabitReceipt>;
  user(options: { fresh: boolean }): Promise<{ stats?: PlayerStats }>;
  score(alias: string): Promise<PlayerStats>;
}
export class HabiticaRewardGateway implements RewardGateway {
  constructor(private readonly client: HabiticaRewardClient) {}
  readTask(alias: string) {
    return this.client.task(alias);
  }
  readPlayer() {
    return this.client.user({ fresh: true });
  }
  score(alias: string) {
    return this.client.score(alias);
  }
}
