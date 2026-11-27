import type {
  CompanionUser,
  CompanionContent,
  CatalogItem,
  CatalogSkill,
  ShopSnapshot,
  ArmoireResult,
} from '../../features/companion/domain/types.js';
import type { HabitReceipt, PlayerStats } from '../../features/progress/domain/reward.js';
export type Decoder<T> = (value: unknown) => T;
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Habitica 数据格式无效');
  return value as Record<string, unknown>;
}
function optionalFields(
  row: Record<string, unknown>,
  keys: string[],
  kind: 'string' | 'number' | 'boolean',
) {
  for (const key of keys) {
    const value = row[key];
    if (
      value !== undefined &&
      (typeof value !== kind || (kind === 'number' && !Number.isFinite(value)))
    )
      throw Error('Habitica 数据字段无效');
  }
}
function nested(
  row: Record<string, unknown>,
  key: string,
  check: (value: Record<string, unknown>) => void,
) {
  if (row[key] !== undefined) check(object(row[key]));
}
function dictionary(value: Record<string, unknown>, check: (value: unknown) => void) {
  for (const item of Object.values(value)) check(item);
}
export function stats(value: unknown): PlayerStats {
  const row = object(value);
  optionalFields(
    row,
    ['gp', 'hp', 'mp', 'lvl', 'int', 'exp', 'maxMP', 'maxHealth', 'toNextLevel'],
    'number',
  );
  optionalFields(row, ['class'], 'string');
  nested(row, 'buffs', (buffs) => {
    optionalFields(buffs, ['int'], 'number');
    if (
      buffs.streaks !== undefined &&
      typeof buffs.streaks !== 'boolean' &&
      typeof buffs.streaks !== 'number'
    )
      throw Error('Habitica 增益字段无效');
  });
  return row;
}
export function user(value: unknown): CompanionUser {
  const row = object(value);
  if (row.stats !== undefined) stats(row.stats);
  nested(row, 'preferences', (p) => {
    optionalFields(p, ['size', 'language', 'skin', 'shirt', 'chair'], 'string');
    optionalFields(p, ['disableClasses', 'costume', 'sleep'], 'boolean');
    nested(p, 'hair', (hair) => {
      optionalFields(hair, ['color'], 'string');
      optionalFields(hair, ['bangs', 'base', 'mustache', 'beard', 'flower'], 'number');
    });
  });
  nested(row, 'items', (items) => {
    optionalFields(items, ['currentPet', 'currentMount'], 'string');
    nested(items, 'gear', (gear) => {
      for (const kind of ['equipped', 'costume'])
        nested(gear, kind, (entries) =>
          dictionary(entries, (v) => {
            if (typeof v !== 'string') throw Error('Habitica 装备字段无效');
          }),
        );
      nested(gear, 'owned', (entries) =>
        dictionary(entries, (v) => {
          if (typeof v !== 'boolean') throw Error('Habitica 装备归属无效');
        }),
      );
    });
    for (const kind of ['food', 'eggs', 'hatchingPotions', 'quests'])
      nested(items, kind, (entries) =>
        dictionary(entries, (v) => {
          if (typeof v !== 'number' || !Number.isFinite(v)) throw Error('Habitica 背包数量无效');
        }),
      );
  });
  nested(row, 'flags', (flags) => optionalFields(flags, ['armoireEnabled'], 'boolean'));
  nested(row, '_statsComputed', (s) => optionalFields(s, ['maxMP'], 'number'));
  return row as CompanionUser;
}
export function task(value: unknown): HabitReceipt & { id?: string; alias?: string } {
  const row = object(value);
  optionalFields(row, ['id', 'alias', 'type'], 'string');
  optionalFields(row, ['priority', 'counterUp'], 'number');
  optionalFields(row, ['up', 'down'], 'boolean');
  if (row.history !== undefined) {
    if (!Array.isArray(row.history)) throw Error('Habitica 习惯历史无效');
    for (const item of row.history) optionalFields(object(item), ['scoredUp'], 'number');
  }
  return row as HabitReceipt;
}
export function tasks(value: unknown) {
  if (!Array.isArray(value)) throw Error('Habitica 习惯列表无效');
  return value.map(task);
}
function catalogItem(value: unknown): CatalogItem {
  const row = object(value);
  optionalFields(
    row,
    ['key', 'text', 'notes', 'klass', 'specialClass', 'currency', 'class', 'purchaseType'],
    'string',
  );
  optionalFields(row, ['locked', 'owned'], 'boolean');
  optionalFields(row, ['value', 'int'], 'number');
  return row as CatalogItem;
}
function skill(value: unknown): CatalogSkill {
  const row = object(value);
  catalogItem(row);
  optionalFields(row, ['target'], 'string');
  optionalFields(row, ['lvl', 'mana'], 'number');
  return row as CatalogSkill;
}
export function content(value: unknown): CompanionContent {
  const row = object(value);
  nested(row, 'spells', (classes) => {
    for (const [klass, spells] of Object.entries(classes))
      for (const value of Object.values(object(spells))) {
        const entry = skill(value);
        if (
          ['warrior', 'wizard', 'healer', 'rogue'].includes(klass) &&
          (entry.lvl === undefined || entry.mana === undefined)
        )
          throw Error('Habitica 职业技能数值无效');
      }
  });
  nested(row, 'gear', (gear) => nested(gear, 'flat', (flat) => dictionary(flat, catalogItem)));
  for (const key of ['food', 'eggs', 'hatchingPotions', 'quests'])
    nested(row, key, (items) => dictionary(items, catalogItem));
  for (const key of ['potion', 'armoire']) if (row[key] !== undefined) catalogItem(row[key]);
  return row as CompanionContent;
}
export function shop(value: unknown): ShopSnapshot {
  const row = object(value);
  const items = (v: Record<string, unknown>) => {
    if (v.items !== undefined) {
      if (!Array.isArray(v.items)) throw Error('Habitica 商店列表无效');
      v.items.forEach(catalogItem);
    }
  };
  nested(row, 'featured', items);
  if (row.categories !== undefined) {
    if (!Array.isArray(row.categories)) throw Error('Habitica 商店分类无效');
    row.categories.forEach((v) => items(object(v)));
  }
  return row as ShopSnapshot;
}
export function actionResult(value: unknown): ArmoireResult {
  const row = object(value);
  nested(row, 'armoire', (drop) => {
    optionalFields(drop, ['type', 'dropKey', 'dropText'], 'string');
    optionalFields(drop, ['value'], 'number');
  });
  return row as ArmoireResult;
}
/** Equip responses carry the updated user.items; validate the gear sets we read. */
export function equipResult(value: unknown): Record<string, unknown> {
  const row = object(value);
  nested(row, 'gear', (gear) => {
    for (const kind of ['equipped', 'costume'])
      nested(gear, kind, (entries) =>
        dictionary(entries, (v) => {
          if (typeof v !== 'string') throw Error('Habitica 装备字段无效');
        }),
      );
  });
  return row;
}
