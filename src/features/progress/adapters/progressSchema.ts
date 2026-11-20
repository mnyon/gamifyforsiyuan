import type { ProgressState } from '../domain/types.js';

type ObjectValue = Record<string, unknown>;
function object(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireValue(condition: unknown, field: string): asserts condition {
  if (!condition) throw new Error('进度文件格式不正确（' + field + '），已停止读取以保护已有记录');
}
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => number(value) && Number.isSafeInteger(value);
const positive = (value: unknown): value is number => number(value) && value > 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function entries(value: unknown, field: string): Array<[string, unknown]> {
  requireValue(object(value), field);
  const rows = Object.entries(value);
  requireValue(
    rows.every(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)),
    field,
  );
  return rows;
}
function optionalNumber(value: ObjectValue, fields: string[], field: string): void {
  for (const key of fields)
    requireValue(value[key] === undefined || number(value[key]), field + '.' + key);
}

/** Validate without defaults or field stripping: never silently reset old financial state. */
export function parseProgress(value: unknown): ProgressState {
  requireValue(object(value), 'document');
  requireValue(value.version === 1, 'version');
  requireValue(value.target === null || (integer(value.target) && value.target > 0), 'target');
  requireValue(integer(value.total), 'total');
  for (const key of ['alias', 'account'])
    requireValue(value[key] === undefined || text(value[key]), key);
  const used = new Map(entries(value.used, 'used'));
  for (const [day, rows] of used) {
    requireValue(date(day), 'used.day');
    for (const [, status] of entries(rows, 'used.items'))
      requireValue(['spent', 'unspent', true].includes(status as string | boolean), 'used.status');
  }
  for (const [id, item] of entries(value.pending, 'pending')) {
    requireValue(text(id) && object(item) && number(item.since) && date(item.day), 'pending.item');
  }
  requireValue(Array.isArray(value.credits), 'credits');
  for (const credit of value.credits) {
    requireValue(object(credit) && text(credit.id) && date(credit.day), 'credits.item');
    requireValue(used.has(credit.day), 'credits.day');
  }
  requireValue(Array.isArray(value.rewards), 'rewards');
  const ids = new Set<string>();
  for (const reward of value.rewards) {
    requireValue(object(reward) && text(reward.id) && !ids.has(reward.id), 'rewards.id');
    ids.add(reward.id);
    requireValue(
      typeof reward.status === 'string' &&
        ['queued', 'sending', 'uncertain', 'sent'].includes(reward.status),
      'rewards.status',
    );
    requireValue(
      reward.kind === undefined || reward.kind === 'editing' || reward.kind === 'maintenance',
      'rewards.kind',
    );
    requireValue(
      number(reward.created) && integer(reward.count) && reward.count > 0,
      'rewards.count',
    );
    requireValue(Array.isArray(reward.sources) && reward.sources.every(text), 'rewards.sources');
    optionalNumber(reward, ['attempted', 'before', 'historyBefore', 'goldBefore'], 'rewards');
    requireValue(
      reward.gold === undefined || reward.gold === null || number(reward.gold),
      'rewards.gold',
    );
  }
  if (value.snapshot !== undefined) {
    const s = value.snapshot;
    requireValue(
      object(s) && date(s.day) && integer(s.backlog) && integer(s.target) && s.target > 0,
      'snapshot',
    );
  }
  if (value.activity !== undefined) {
    const a = value.activity;
    requireValue(
      object(a) && a.version === 1 && number(a.editingBaseline) && number(a.maintenanceBaseline),
      'activity',
    );
    const days = new Map(entries(a.days, 'activity.days'));
    requireValue(
      a.current === undefined || (date(a.current) && days.has(a.current)),
      'activity.current',
    );
    for (const [key, day] of days) {
      requireValue(date(key) && object(day), 'activity.day');
      requireValue(
        integer(day.inserted) && integer(day.deleted) && number(day.maintenance),
        'activity.counts',
      );
      requireValue(
        integer(day.editingRewards) && typeof day.maintenanceReward === 'boolean',
        'activity.rewards',
      );
      requireValue(
        positive(day.editingTarget) && positive(day.maintenanceTarget),
        'activity.targets',
      );
      for (const [, block] of entries(day.blocks, 'activity.blocks')) {
        requireValue(
          object(block) &&
            integer(block.inserted) &&
            integer(block.deleted) &&
            number(block.contribution),
          'activity.block',
        );
        requireValue(
          block.previousUpdated === null || number(block.previousUpdated),
          'activity.previousUpdated',
        );
        optionalNumber(block, ['weight'], 'activity.block');
      }
    }
  }
  // Every accessed field is checked above; unknown extension fields intentionally survive round trips.
  return value as unknown as ProgressState;
}
