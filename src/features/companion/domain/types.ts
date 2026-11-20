/** Only fields required by eligibility rules; the adapter retains the complete account object. */
export interface CompanionUser {
  profile?: { name?: string; [key: string]: unknown };
  stats?: {
    buffs?: { streaks?: boolean | number; [key: string]: unknown };
    class?: string;
    lvl?: number;
    hp?: number;
    maxHealth?: number;
    mp?: number;
    gp?: number;
    int?: number;
    exp?: number;
    maxMP?: number;
    toNextLevel?: number;
    [key: string]: unknown;
  };
  preferences?: {
    disableClasses?: boolean;
    size?: string;
    language?: string;
    costume?: boolean;
    skin?: string;
    shirt?: string;
    chair?: string;
    sleep?: boolean;
    hair?: {
      color?: string;
      bangs?: number;
      base?: number;
      mustache?: number;
      beard?: number;
      flower?: number;
    };
    [key: string]: unknown;
  };
  items?: {
    gear?: {
      owned?: Record<string, boolean>;
      equipped?: Record<string, string>;
      costume?: Record<string, string>;
      [key: string]: unknown;
    };
    food?: Record<string, number>;
    eggs?: Record<string, number>;
    hatchingPotions?: Record<string, number>;
    quests?: Record<string, number>;
    currentPet?: string;
    currentMount?: string;
    [key: string]: unknown;
  };
  _statsComputed?: { maxMP?: number };
  flags?: { armoireEnabled?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}
export interface CompanionSkill {
  key?: string;
  target?: string;
  lvl: number;
  mana: number;
}
export interface PurchasableItem {
  key: string;
  price: number;
  currency: string;
  kind?: string;
  owned?: boolean;
  locked?: boolean;
}
export type CompanionAction = { kind: 'cast'; key: string } | { kind: 'buy'; key: string };
export type ActionStatus = '' | 'pending' | 'uncertain';
export interface ActionRecord {
  kind: CompanionAction['kind'];
  key: string;
  at: number;
}
export function companionAction(kind: unknown, key: unknown): CompanionAction {
  if (kind !== 'cast' && kind !== 'buy') throw new Error('不支持的操作');
  if (typeof key !== 'string' || !(kind === 'cast' ? /^[a-zA-Z]+$/ : /^[\w-]+$/).test(key))
    throw new Error(kind === 'cast' ? '技能标识不正确' : '商品标识不正确');
  return { kind, key };
}
export function hasUncertainResult(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'uncertain' in error && !!error.uncertain;
}

export interface CatalogItem {
  key?: string;
  text?: string;
  notes?: string;
  int?: number;
  klass?: string;
  specialClass?: string;
  value?: number;
  currency?: string;
  class?: string;
  purchaseType?: string;
  locked?: boolean;
  owned?: boolean;
  [key: string]: unknown;
}
export interface CatalogSkill extends Partial<CompanionSkill> {
  text?: string;
  notes?: string;
  [key: string]: unknown;
}
export interface CompanionContent {
  spells?: Record<string, Record<string, CatalogSkill>>;
  gear?: { flat?: Record<string, CatalogItem> };
  food?: Record<string, CatalogItem>;
  eggs?: Record<string, CatalogItem>;
  hatchingPotions?: Record<string, CatalogItem>;
  quests?: Record<string, CatalogItem>;
  potion?: CatalogItem;
  armoire?: CatalogItem;
  [key: string]: unknown;
}
export interface ShopSnapshot {
  featured?: { items?: CatalogItem[] };
  categories?: Array<{ items?: CatalogItem[] }>;
  [key: string]: unknown;
}
export interface InventoryItem {
  key: string;
  name: string;
  notes: string;
  image: string;
  category: string;
  quantity: number;
  equipped: boolean;
}
export interface ShopItem extends PurchasableItem {
  name: string;
  notes: string;
  image: string;
}
export interface ArmoireResult {
  armoire?: { type?: string; value?: number; dropKey?: string; dropText?: string };
  [key: string]: unknown;
}
export interface RewardPresentation {
  name: string;
  notes: string;
  type: string;
  image?: string;
}
