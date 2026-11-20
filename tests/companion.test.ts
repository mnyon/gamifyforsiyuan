import { stubFetch, invalidFixture } from './support.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  skillBlockReason,
  resourceLimits,
  inventoryItems,
  shopItems,
  purchaseBlockReason,
  armoireReward,
} from '../src/features/companion/application/projections.ts';
import { HabiticaClient } from '../src/adapters/habitica/HabiticaClient.ts';
type TestUser = {
  stats: {
    lvl: number;
    hp: number;
    gp: number;
    mp: number;
    int: number;
    class: string;
    buffs: Record<string, number>;
  };
  preferences: Record<string, unknown>;
  items: {
    gear: {
      equipped: Record<string, string>;
      owned: Record<string, boolean>;
      costume?: Record<string, string>;
    };
    food?: Record<string, number>;
  };
  flags: { armoireEnabled: boolean };
};
const user = (): TestUser => ({
  stats: { lvl: 90, hp: 32, gp: 150, mp: 124, int: 2, class: 'rogue', buffs: {} },
  preferences: {},
  items: { gear: { equipped: {}, owned: {} } },
  flags: { armoireEnabled: true },
});
const ok = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });
test('targeted skills cannot be cast for any class; self and party buffs check level and mana', () => {
  for (const klass of ['warrior', 'wizard', 'healer', 'rogue']) {
    const u = user();
    u.stats.class = klass;
    for (const target of ['task', 'user', undefined])
      assert.ok(skillBlockReason({ target, mana: 10, lvl: 11 }, u));
    for (const target of ['self', 'party'])
      assert.equal(skillBlockReason({ target, mana: 10, lvl: 11 }, u), '');
    u.stats.mp = 0;
    assert.equal(skillBlockReason({ target: 'party', mana: 25, lvl: 11 }, u), '法力不足');
    u.stats.lvl = 1;
    assert.match(skillBlockReason({ target: 'self', mana: 1, lvl: 11 }, u), /11/);
  }
});
test('resource caps use actual equipment, class bonus and buffs, rather than the costume', () => {
  const u = user();
  u.items.gear.equipped = { head: 'head' };
  u.items.gear.costume = { head: 'costume' };
  u.stats.buffs.int = 3;
  const limits = resourceLimits(u, {
    gear: { flat: { head: { int: 4, klass: 'rogue' }, costume: { int: 90 } } },
  });
  assert.deepEqual(limits, { hp: 50, xp: 3060, mp: 146 });
});
test('inventory reads ownership, quantities and equipped state and rejects unsafe asset names', () => {
  const u = user();
  u.items.gear.owned = { armor_rogue_4: true, head_rogue_4: false, '../bad': true };
  u.items.gear.equipped.armor = 'armor_rogue_4';
  u.items.food = { Meat: 4, Milk: 0 };
  const items = inventoryItems(u, {
    gear: { flat: { armor_rogue_4: { text: '护甲' } } },
    food: { Meat: { text: '肉', notes: '<b>喂养</b>' } },
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].equipped, true);
  assert.equal(items[1].quantity, 4);
  assert.equal(items[1].notes, '喂养');
});
test('shop uses server prices and lock state; gems, unavailable armoire, and owned gear cannot be bought', () => {
  const u = user();
  const item = {
    key: 'weapon_rogue_5',
    text: '刀',
    value: 90,
    currency: 'gold',
    purchaseType: 'gear',
  };
  const products = shopItems(
    { featured: { items: [item] } },
    { categories: [{ items: [{ ...item, locked: true }] }] },
    {},
    { gear: { flat: {} } },
    u,
  );
  assert.equal(products[0].price, 90);
  assert.equal(purchaseBlockReason(products[0], u), '尚未解锁');
  assert.match(purchaseBlockReason({ ...products[0], locked: false, currency: 'gems' }, u), /官方/);
  u.flags.armoireEnabled = false;
  assert.equal(purchaseBlockReason(shopItems({}, {}, {}, {}, u).at(-1)!, u), '尚未解锁');
  assert.equal(purchaseBlockReason({ ...products[0], owned: true }, u), '已拥有');
});
test('armoire reveals only the server reward, including food and experience', () => {
  assert.equal(armoireReward({}, {}), null);
  assert.equal(
    armoireReward({ armoire: { type: 'food', dropKey: 'Meat', dropText: '肉' } }, {})!.image,
    'Pet_Food_Meat',
  );
  assert.equal(armoireReward({ armoire: { type: 'experience', value: 27 } }, {})!.name, '经验 +27');
  assert.equal(armoireReward({ armoire: { type: 'gear', dropKey: '../invalid' } }, {}), null);
});
test('account reads coalesce and cache while fresh reward checks bypass the TTL', async () => {
  let now = 0,
    count = 0;
  const client = new HabiticaClient(
    {},
    stubFetch(async () => {
      count++;
      await new Promise<void>((resolve) => setImmediate(resolve));
      return ok({ stats: { gp: count } });
    }),
    () => now,
    null,
  );
  await Promise.all([client.user(), client.user(), client.user()]);
  assert.equal(count, 1);
  now = 10000;
  await client.user({ refresh: true });
  assert.equal(count, 1);
  now = 16000;
  await client.user({ refresh: true });
  assert.equal(count, 2);
  await client.user({ fresh: true });
  assert.equal(count, 3);
  now = 76001;
  await client.user();
  assert.equal(count, 4);
});
test('content cache is persisted without credentials and shared across client instances; shop cache invalidates on purchase', async () => {
  const memory = new Map<string, string>(),
    store = {
      getItem: (k: string) => memory.get(k) || null,
      setItem: (k: string, v: string) => memory.set(k, v),
    };
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return ok({ spells: { rogue: {} }, gear: {} });
  };
  const first = new HabiticaClient(
    { token: 'private-token' },
    stubFetch(fetcher),
    () => 1000,
    store,
  );
  await first.content('zh');
  const second = new HabiticaClient({}, stubFetch(fetcher), () => 2000, store);
  await second.content('zh');
  assert.equal(calls, 1);
  assert.ok(![...memory.values()].join('').includes('private-token'));
  await Promise.all([first.shop('market'), first.shop('market')]);
  assert.equal(calls, 2);
  await first.shop('market');
  assert.equal(calls, 2);
  first.invalidateShops();
  await first.shop('market');
  assert.equal(calls, 3);
});
test('rate limits respect Retry-After without an automatic retry or repeated network traffic', async () => {
  let now = 0,
    count = 0;
  const client = new HabiticaClient(
    {},
    stubFetch(async () => {
      count++;
      return { ok: false, status: 429, headers: { get: () => '120' }, json: async () => ({}) };
    }),
    () => now,
    null,
  );
  await assert.rejects(client.user());
  now = 60000;
  await assert.rejects(client.user());
  assert.equal(count, 1);
  now = 120001;
  await assert.rejects(client.user());
  assert.equal(count, 2);
});
test('buy and cast failures are uncertain and never automatically retried', async () => {
  let calls = 0;
  const client = new HabiticaClient(
    {},
    stubFetch(async () => {
      calls++;
      throw new Error('network');
    }),
    () => 0,
    null,
  );
  await assert.rejects(
    client.buy('armoire'),
    (e) => e instanceof Error && 'uncertain' in e && !!e.uncertain,
  );
  assert.equal(calls, 1);
  await assert.rejects(client.cast('stealth'));
  assert.equal(calls, 1);
});
