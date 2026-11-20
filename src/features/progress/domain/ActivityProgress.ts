import type { ProgressState, ActivityState, BlockEdit, RewardKind } from './types.js';
import { calendarDay } from './TodoProgress.js';

const DAY_MS = 86400000;
export const ACTIVITY_DEFAULTS = Object.freeze({
  alpha: 0.05,
  initialEditing: 400,
  minimumEditing: 100,
  initialMaintenance: 1,
  minimumMaintenance: 0.25,
  oldDays: 7,
  fullContribution: 20,
});

function dayNumber(day: string) {
  return Date.parse(day + 'T00:00:00Z') / DAY_MS;
}
export function parseBlockUpdated(value: unknown) {
  if (!/^\d{14}$/.test(String(value))) return null;
  const s = String(value),
    date = new Date(
      +s.slice(0, 4),
      +s.slice(4, 6) - 1,
      +s.slice(6, 8),
      +s.slice(8, 10),
      +s.slice(10, 12),
      +s.slice(12, 14),
    );
  return Number.isFinite(date.getTime()) &&
    calendarDay(date) === `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
    ? date.getTime()
    : null;
}
export function characterCount(text: unknown) {
  return Array.from(String(text).replace(/[\s\u200b\ufeff]/gu, '')).length;
}
// Compare code points before discarding whitespace: a space must not join two edits.
export function textEdit(before: string, after: string) {
  const a = Array.from(before),
    b = Array.from(after);
  let left = 0,
    right = 0;
  while (left < a.length && left < b.length && a[left] === b[left]) left++;
  while (
    right < a.length - left &&
    right < b.length - left &&
    a[a.length - 1 - right] === b[b.length - 1 - right]
  )
    right++;
  return {
    inserted: characterCount(b.slice(left, b.length - right).join('')),
    deleted: characterCount(a.slice(left, a.length - right).join('')),
  };
}
export function editingThreshold(index: number, target: number) {
  return Math.ceil(target * (index < 4 ? [0.15, 0.4, 0.7, 1][index] : 1 + (index - 3) * 0.3));
}

// Visual progress within the next reward segment. Read-only: opening the card
// or animating the caret must never advance a day or reserve a reward.
export function editingApproach(state: ProgressState, now = Date.now()) {
  const day = state.activity?.days?.[calendarDay(now)];
  if (!day) return 0;
  if (
    state.rewards.some(
      (reward) =>
        reward.kind === 'editing' &&
        reward.status !== 'sent' &&
        calendarDay(reward.created) === calendarDay(now),
    )
  )
    return 1;
  const lower = day.editingRewards
    ? editingThreshold(day.editingRewards - 1, day.editingTarget)
    : 0;
  const upper = editingThreshold(day.editingRewards, day.editingTarget);
  return Math.max(
    0,
    Math.min(1, (day.inserted + day.deleted - lower) / Math.max(1, upper - lower)),
  );
}

// Attached to the existing progress file; all reward types use its durable queue.
export class ActivityProgress {
  state: ProgressState & { activity: ActivityState };
  uid: () => string;
  constructor(state: ProgressState, uid: () => string = () => crypto.randomUUID()) {
    this.uid = uid;
    state.activity ||= {
      version: 1,
      editingBaseline: ACTIVITY_DEFAULTS.initialEditing,
      maintenanceBaseline: ACTIVITY_DEFAULTS.initialMaintenance,
      days: {},
    };
    if (state.activity.version !== 1) throw new Error('编辑统计版本不兼容');
    this.state = state as ProgressState & { activity: ActivityState };
  }
  day(now = Date.now()) {
    const a = this.state.activity,
      key = calendarDay(now),
      c = ACTIVITY_DEFAULTS;
    // A backwards clock never reopens an already settled day.
    if (a.current && key < a.current) return null;
    if (a.current && key !== a.current) {
      const previous = a.days[a.current],
        elapsed = dayNumber(key) - dayNumber(a.current);
      a.editingBaseline =
        ((1 - c.alpha) * a.editingBaseline + c.alpha * (previous.inserted + previous.deleted)) *
        (1 - c.alpha) ** (elapsed - 1);
      a.maintenanceBaseline =
        ((1 - c.alpha) * a.maintenanceBaseline + c.alpha * previous.maintenance) *
        (1 - c.alpha) ** (elapsed - 1);
    }
    a.current = key;
    return (a.days[key] ||= {
      inserted: 0,
      deleted: 0,
      maintenance: 0,
      blocks: {},
      editingRewards: 0,
      maintenanceReward: false,
      editingTarget: Math.max(c.minimumEditing, a.editingBaseline),
      maintenanceTarget: Math.max(c.minimumMaintenance, a.maintenanceBaseline),
    });
  }
  record({ id, inserted = 0, deleted = 0, previousUpdated = null }: BlockEdit, now = Date.now()) {
    if (
      !/^\d{14}-[a-z0-9]{7}$/.test(id) ||
      !Number.isSafeInteger(inserted) ||
      !Number.isSafeInteger(deleted) ||
      inserted < 0 ||
      deleted < 0 ||
      inserted + deleted === 0
    )
      return { maintenance: 0, rewards: 0 };
    const day = this.day(now);
    if (!day) return { maintenance: 0, rewards: 0 };
    day.inserted += inserted;
    day.deleted += deleted;
    const block = (day.blocks[id] ||= {
      inserted: 0,
      deleted: 0,
      previousUpdated,
      contribution: 0,
    });
    block.inserted += inserted;
    block.deleted += deleted;
    const age = Number.isFinite(block.previousUpdated)
      ? Math.max(0, (now - block.previousUpdated!) / DAY_MS)
      : 0;
    const weight = age >= ACTIVITY_DEFAULTS.oldDays ? Math.min(3, Math.log1p(age / 7)) : 0;
    // The weight is frozen at the first edit; subsequent edits only fill it in.
    block.weight ??= weight;
    const contribution =
      block.weight *
      Math.min(1, (block.inserted + block.deleted) / ACTIVITY_DEFAULTS.fullContribution);
    const maintenance = contribution - block.contribution;
    block.contribution = contribution;
    day.maintenance += maintenance;
    let rewards = 0;
    const queue = (kind: RewardKind) => {
      this.state.rewards.push({
        id: this.uid(),
        kind,
        status: 'queued',
        created: now,
        count: 1,
        sources: [id],
      });
      rewards++;
    };
    while (day.inserted + day.deleted >= editingThreshold(day.editingRewards, day.editingTarget)) {
      queue('editing');
      day.editingRewards++;
    }
    if (!day.maintenanceReward && day.maintenance >= day.maintenanceTarget) {
      queue('maintenance');
      day.maintenanceReward = true;
    }
    return { maintenance, rewards, weight: block.weight };
  }
}
