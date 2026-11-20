import { calendarDay } from './TodoProgress.js';
import type { Reward } from './types.js';

/** Only the fields needed to verify and reconcile our dedicated Habitica habit. */
export interface HabitReceipt {
  priority?: number;
  type?: string;
  down?: boolean;
  up?: boolean;
  counterUp?: number;
  history?: Array<{ scoredUp?: number }>;
}
export interface PlayerStats {
  gp?: number;
  [key: string]: unknown;
}
export function assertDedicatedHabit(task: HabitReceipt): void {
  if (task.priority !== 0.1 || task.type !== 'habit' || task.down || !task.up)
    throw new Error('专用习惯设置已改变，请恢复琐事难度、仅正向');
}
export function scoredHistory(task: HabitReceipt): number {
  return (task.history || []).reduce((sum, item) => sum + (item.scoredUp || 0), 0);
}
export function earnedGold(before: number | undefined, after: number | undefined): number | null {
  if (
    before === undefined ||
    after === undefined ||
    !Number.isFinite(before) ||
    !Number.isFinite(after)
  )
    return null;
  const change = after - before;
  return change >= 0 ? change : null;
}
export function receiptConfirms(reward: Reward, task: HabitReceipt, now: number): boolean {
  const sameDay = calendarDay(reward.attempted) === calendarDay(now);
  return (
    scoredHistory(task) > (reward.historyBefore ?? Infinity) ||
    (sameDay && (task.counterUp || 0) > (reward.before ?? Infinity))
  );
}
