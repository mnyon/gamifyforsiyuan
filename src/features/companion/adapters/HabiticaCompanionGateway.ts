import { shopItems } from '../application/projections.js';
import type { ActionCatalog, CompanionGateway } from '../application/ports.js';
import type {
  CompanionAction,
  CompanionUser,
  CompanionContent,
  ShopSnapshot,
} from '../domain/types.js';

export interface CatalogSnapshot {
  content?: CompanionContent | null;
  shops?: { market: ShopSnapshot; gear: ShopSnapshot; seasonal: ShopSnapshot } | null;
}
export interface HabiticaCompanionClient {
  user(options: { fresh: boolean }): Promise<CompanionUser>;
  buy(key: string): Promise<unknown>;
  cast(key: string): Promise<unknown>;
  equip(key: string): Promise<unknown>;
  invalidateUser(): void;
  invalidateShops(): void;
}
/** Read-only catalog projection and fresh account checks for companion actions. */
export class HabiticaCompanionGateway implements CompanionGateway {
  constructor(
    private readonly client: HabiticaCompanionClient,
    private readonly prepare: (kind: CompanionAction['kind']) => Promise<CatalogSnapshot>,
  ) {}
  async loadCatalog(kind: CompanionAction['kind']): Promise<ActionCatalog> {
    const { content, shops } = await this.prepare(kind);
    return {
      skillFor(user, key) {
        const skill = content?.spells?.[user.stats?.class || '']?.[key];
        return skill && typeof skill.lvl === 'number' && typeof skill.mana === 'number'
          ? { ...skill, lvl: skill.lvl, mana: skill.mana }
          : undefined;
      },
      productFor(user, key) {
        if (!shops) return undefined;
        return shopItems(shops.market, shops.gear, shops.seasonal, content, user).find(
          (item) => item.key === key,
        );
      },
      gearFor(user, key) {
        if (!content?.gear?.flat?.[key]) return undefined;
        return {
          key,
          equipped: Object.values(user.items?.gear?.equipped || {}).includes(key),
        };
      },
    };
  }
  readPlayer(): Promise<CompanionUser> {
    return this.client.user({ fresh: true });
  }
  execute(action: CompanionAction): Promise<unknown> {
    if (action.kind === 'cast') return this.client.cast(action.key);
    if (action.kind === 'equip') return this.client.equip(action.key);
    return this.client.buy(action.key);
  }
  invalidateUser(): void {
    this.client.invalidateUser();
  }
  invalidateShops(): void {
    this.client.invalidateShops();
  }
}
