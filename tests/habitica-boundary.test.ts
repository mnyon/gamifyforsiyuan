import { stubFetch, invalidFixture } from './support.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HabiticaClient } from '../src/adapters/habitica/HabiticaClient.ts';
import { adventureUser, adventureContent, adventureShops } from './fixtures/adventure-fixture.ts';
const ok = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });
test('complete fictional account, content and shop responses retain their fields through the real client', async () => {
  const account = adventureUser(),
    catalog = structuredClone(adventureContent),
    shops = adventureShops();
  Object.assign(account, { extension: { kept: true } });
  Object.assign(catalog, { extension: { kept: true } });
  const client = new HabiticaClient(
    {},
    stubFetch(async (url) =>
      ok(url.endsWith('/user') ? account : url.includes('/content?') ? catalog : shops.gear),
    ),
    () => 0,
    null,
  );
  assert.deepEqual(await client.user(), account);
  assert.deepEqual(await client.content(), catalog);
  assert.deepEqual(await client.shop('market-gear'), shops.gear);
});
test('malformed shared account read is rejected for all callers without poisoning cache or later requests', async () => {
  let count = 0;
  const client = new HabiticaClient(
    {},
    stubFetch(async () => {
      count++;
      await new Promise<void>((resolve) => setImmediate(resolve));
      return ok(count === 1 ? { stats: { gp: 'broken' } } : { stats: { gp: 9 } });
    }),
    () => 0,
    null,
  );
  const results = await Promise.allSettled([client.user(), client.user(), client.user()]);
  assert.equal(count, 1);
  assert.ok(results.every((r) => r.status === 'rejected' && r.reason.uncertain === false));
  assert.equal(client.cache.has('/user'), false);
  assert.equal((await client.user()).stats!.gp, 9);
  assert.equal(count, 2);
});
for (const action of ['buy', 'cast', 'equip', 'score', 'ensureHabit'] as const)
  test(
    'malformed successful ' +
      action +
      ' result remains uncertain and is never retried automatically',
    async () => {
      let calls = 0;
      const client = new HabiticaClient(
        {},
        stubFetch(async (url, options) => {
          calls++;
          return ok(options.method === 'GET' ? [] : 'invalid');
        }),
        () => 0,
        null,
      );
      const key = action === 'cast' ? 'stealth' : 'alias';
      await assert.rejects(
        client[action](key),
        (e) => e instanceof Error && 'uncertain' in e && e.uncertain === true,
      );
      assert.equal(calls, action === 'ensureHabit' ? 2 : 1);
    },
  );
test('equip posts to the battle-set endpoint and validates the returned gear', async () => {
  const requests: Array<{ url: string; method?: string }> = [];
  const client = new HabiticaClient(
    {},
    stubFetch(async (url, options) => {
      requests.push({ url, method: options.method });
      return ok({ gear: { equipped: { weapon: 'weapon_rogue_4' }, costume: {} } });
    }),
    () => 0,
    null,
  );
  const result = await client.equip('weapon_rogue_4');
  assert.equal(requests[0].url, 'https://habitica.com/api/v3/user/equip/equipped/weapon_rogue_4');
  assert.equal(requests[0].method, 'POST');
  assert.ok(result.gear);
  await assert.rejects(client.equip('../bad'), /装备标识不正确/);
  const malformed = new HabiticaClient(
    {},
    stubFetch(async () => ok({ gear: { equipped: { weapon: 5 } } })),
    () => 0,
    null,
  );
  await assert.rejects(
    malformed.equip('weapon_rogue_4'),
    (e) => e instanceof Error && 'uncertain' in e && e.uncertain === true,
  );
});
test('corrupt persisted content is discarded and replaced only after validated network content', async () => {
  const values = new Map([
    [
      'gamify:content:v1:zh',
      JSON.stringify({
        at: 50,
        value: { spells: { rogue: { stealth: { lvl: 14, mana: 'bad' } } } },
      }),
    ],
  ]);
  let calls = 0;
  const storage = {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => values.set(k, v),
  };
  const client = new HabiticaClient(
    { token: 'private-token' },
    stubFetch(async () => {
      calls++;
      return ok({ spells: { rogue: {} }, gear: {}, extension: 'not persisted' });
    }),
    () => 100,
    storage,
  );
  await client.content();
  assert.equal(calls, 1);
  const saved = JSON.parse(values.get('gamify:content:v1:zh')!);
  assert.deepEqual(saved.value, { spells: { rogue: {} }, gear: {} });
  assert.doesNotMatch(values.get('gamify:content:v1:zh')!, /private-token|not persisted/);
});
test('server errors and unreadable success envelopes preserve mutation uncertainty; client refusal remains definite', async () => {
  for (const [status, uncertain] of [
    [401, false],
    [429, false],
    [503, true],
  ] as const) {
    const client = new HabiticaClient(
      {},
      stubFetch(async () => ({
        ok: false,
        status,
        json: async () => ({}),
        headers: { get: () => null },
      })),
      () => 0,
      null,
    );
    await assert.rejects(
      client.buy('potion'),
      (e) => e instanceof Error && 'uncertain' in e && e.uncertain === uncertain,
    );
  }
  for (const response of [
    null,
    [],
    { success: true, data: null },
    { success: false },
    { success: 'yes', data: {} },
  ]) {
    const client = new HabiticaClient(
      {},
      stubFetch(async () => ({ ok: true, json: async () => response })),
      () => 0,
      null,
    );
    await assert.rejects(
      client.score('alias'),
      (e) => e instanceof Error && 'uncertain' in e && e.uncertain === true,
    );
  }
});
test('invalid nested account quantities, catalog prices and receipt counters fail before projections or reconciliation', async () => {
  for (const data of [
    { stats: { gp: Infinity } },
    { items: { food: { Meat: 'four' } } },
    { preferences: { hair: { base: {} } } },
  ]) {
    const client = new HabiticaClient(
      {},
      stubFetch(async () => ok(data)),
      () => 0,
      null,
    );
    await assert.rejects(
      client.user(),
      (e) => e instanceof Error && 'uncertain' in e && !e.uncertain,
    );
  }
  const catalog = new HabiticaClient(
    {},
    stubFetch(async () => ok({ potion: { value: 'free' } })),
    () => 0,
    null,
  );
  await assert.rejects(
    catalog.content(),
    (e) => e instanceof Error && 'uncertain' in e && !e.uncertain,
  );
  const receipt = new HabiticaClient(
    {},
    stubFetch(async () => ok({ history: [{ scoredUp: 'many' }] })),
    () => 0,
    null,
  );
  await assert.rejects(
    receipt.task('alias'),
    (e) => e instanceof Error && 'uncertain' in e && !e.uncertain,
  );
});
test('Retry-After HTTP date is respected and excessive cooldown is capped at one day', async () => {
  for (const seconds of [120, 172800]) {
    let now = 0,
      calls = 0;
    const client = new HabiticaClient(
      {},
      stubFetch(async () => {
        calls++;
        return {
          ok: false,
          status: 429,
          headers: { get: () => new Date(seconds * 1000).toUTCString() },
          json: async () => ({}),
        };
      }),
      () => now,
      null,
    );
    await assert.rejects(client.user());
    assert.equal(client.blockedUntil, Math.min(seconds * 1000, 86400000));
    now = client.blockedUntil - 1;
    await assert.rejects(client.user());
    assert.equal(calls, 1);
    now++;
    await assert.rejects(client.user());
    assert.equal(calls, 2);
  }
});
