import type {
  ExecuteActionPorts,
  ActionCatalog,
} from '../src/features/companion/application/ports.js';
import type { CompanionUser, ActionStatus } from '../src/features/companion/domain/types.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAction } from '../src/features/companion/application/executeAction.ts';
import { acknowledgeAction } from '../src/features/companion/application/acknowledgeAction.ts';
import { companionAction } from '../src/features/companion/domain/types.ts';
import { LocalActionJournal } from '../src/features/companion/adapters/LocalActionJournal.ts';
import { HabiticaCompanionGateway } from '../src/features/companion/adapters/HabiticaCompanionGateway.ts';

function fixture() {
  const events: string[] = [],
    statuses: ActionStatus[] = [],
    users: CompanionUser[] = [];
  let pending = false;
  const user = {
    stats: { class: 'rogue', lvl: 90, hp: 32, mp: 100, gp: 200 },
    flags: { armoireEnabled: true },
    items: {},
  };
  const result = { armoire: { type: 'experience', value: 31 } };
  const catalog: ActionCatalog = {
    skillFor: () => ({ key: 'stealth', target: 'self', lvl: 14, mana: 45 }),
    productFor: () => ({ key: 'armoire', price: 100, currency: 'gold', kind: 'armoire' }),
    gearFor: () => ({ key: 'weapon_rogue_4', equipped: false }),
  };
  const ports: ExecuteActionPorts = {
    now: () => 123,
    isCurrent: () => true,
    gateway: {
      loadCatalog: async () => {
        events.push('catalog');
        return catalog;
      },
      readPlayer: async () => {
        events.push('user');
        return user;
      },
      execute: async (action) => {
        events.push(action.kind);
        return result;
      },
      invalidateUser: () => events.push('invalidate-user'),
      invalidateShops: () => events.push('invalidate-shops'),
    },
    journal: {
      hasPending: () => pending,
      begin: () => {
        events.push('persist');
        pending = true;
      },
      clear: () => {
        events.push('clear');
        pending = false;
      },
    },
    onUser: (value) => users.push(value),
    onStatus: (status) => statuses.push(status),
    onShopsInvalidated: () => events.push('clear-shops'),
  };
  return {
    ports,
    events,
    statuses,
    users,
    catalog,
    user,
    result,
    get pending() {
      return pending;
    },
  };
}

test('purchase persists before mutation and returns exactly the server result', async () => {
  const f = fixture();
  const outcome = await executeAction({ kind: 'buy', key: 'armoire' }, f.ports);
  assert.equal(outcome.result, f.result);
  assert.equal(outcome.message, '');
  assert.equal(f.pending, false);
  assert.deepEqual(f.events, [
    'catalog',
    'user',
    'persist',
    'buy',
    'invalidate-user',
    'invalidate-shops',
    'clear-shops',
    'clear',
    'user',
  ]);
  assert.deepEqual(f.statuses, ['pending', '']);
});

test('skill casting uses the same durable workflow without invalidating shop data', async () => {
  const f = fixture();
  await executeAction({ kind: 'cast', key: 'stealth' }, f.ports);
  assert.deepEqual(f.events, [
    'catalog',
    'user',
    'persist',
    'cast',
    'invalidate-user',
    'clear',
    'user',
  ]);
});

test('equipping uses the durable workflow without invalidating shop data', async () => {
  const f = fixture();
  f.user.items = { gear: { owned: { weapon_rogue_4: true }, equipped: {} } };
  const outcome = await executeAction({ kind: 'equip', key: 'weapon_rogue_4' }, f.ports);
  assert.equal(outcome.result, f.result);
  assert.equal(f.pending, false);
  assert.deepEqual(f.events, [
    'catalog',
    'user',
    'persist',
    'equip',
    'invalidate-user',
    'clear',
    'user',
  ]);
  assert.deepEqual(f.statuses, ['pending', '']);
});

test('equipping unowned or unknown gear never persists or submits', async () => {
  const unknown = fixture();
  unknown.catalog.gearFor = () => undefined;
  await assert.rejects(
    executeAction({ kind: 'equip', key: 'weapon_rogue_4' }, unknown.ports),
    /装备目录已变化/,
  );
  assert.deepEqual(unknown.events, ['catalog', 'user']);
  const unowned = fixture();
  unowned.user.items = { gear: { owned: {}, equipped: {} } };
  await assert.rejects(
    executeAction({ kind: 'equip', key: 'weapon_rogue_4' }, unowned.ports),
    /尚未持有这件装备/,
  );
  assert.deepEqual(unowned.events, ['catalog', 'user']);
  assert.equal(unowned.pending, false);
});

test('ambiguous equip keeps its marker and blocks later submissions like other mutations', async () => {
  const f = fixture();
  f.user.items = { gear: { owned: { weapon_rogue_4: true }, equipped: {} } };
  f.ports.gateway.execute = async () => {
    f.events.push('equip');
    throw Object.assign(Error('network'), { uncertain: true });
  };
  await assert.rejects(
    executeAction({ kind: 'equip', key: 'weapon_rogue_4' }, f.ports),
    /不会自动重发/,
  );
  assert.equal(f.pending, true);
  assert.deepEqual(f.statuses, ['pending', 'uncertain']);
  const before = [...f.events];
  await assert.rejects(
    executeAction({ kind: 'equip', key: 'weapon_rogue_4' }, f.ports),
    /尚未确认/,
  );
  assert.deepEqual(f.events, before);
});

test('insufficient funds, gems, locked items and targeted skills never persist or submit', async () => {
  const cases: Array<(f: ReturnType<typeof fixture>) => unknown> = [
    (f) => (f.user.stats.gp = 0),
    (f) => (f.catalog.productFor = () => ({ key: 'armoire', price: 1, currency: 'gems' })),
    (f) =>
      (f.catalog.productFor = () => ({ key: 'armoire', price: 1, currency: 'gold', locked: true })),
    (f) => (f.catalog.productFor = () => undefined),
  ];
  for (const configure of cases) {
    const f = fixture();
    configure(f);
    await assert.rejects(executeAction({ kind: 'buy', key: 'armoire' }, f.ports));
    assert.deepEqual(f.events, ['catalog', 'user']);
    assert.equal(f.pending, false);
  }
  const f = fixture();
  f.catalog.skillFor = () => ({ key: 'pickPocket', target: 'task', mana: 1, lvl: 1 });
  await assert.rejects(
    executeAction({ kind: 'cast', key: 'pickPocket' }, f.ports),
    /需指定任务的技能，暂时不支持释放/,
  );
  assert.deepEqual(f.events, ['catalog', 'user']);
});

test('failed operation marker persistence blocks all remote mutations', async () => {
  const f = fixture();
  f.ports.journal.begin = () => {
    throw Error('quota');
  };
  await assert.rejects(executeAction({ kind: 'buy', key: 'armoire' }, f.ports), /quota/);
  assert.deepEqual(f.events, ['catalog', 'user']);
  assert.deepEqual(f.statuses, []);
});

test('ambiguous submission keeps its marker and blocks all later submissions', async () => {
  const f = fixture();
  f.ports.gateway.execute = async () => {
    f.events.push('buy');
    throw Object.assign(Error('network'), { uncertain: true });
  };
  await assert.rejects(executeAction({ kind: 'buy', key: 'armoire' }, f.ports), /不会自动重发/);
  assert.equal(f.pending, true);
  assert.deepEqual(f.statuses, ['pending', 'uncertain']);
  const before = [...f.events];
  await assert.rejects(executeAction({ kind: 'buy', key: 'armoire' }, f.ports), /尚未确认/);
  assert.deepEqual(f.events, before);
});

test('definitive rejection clears marker while cleanup failure keeps the pause', async () => {
  for (const cleanupFails of [false, true]) {
    const f = fixture();
    f.ports.gateway.execute = async () => {
      throw Error('rejected');
    };
    if (cleanupFails)
      f.ports.journal.clear = () => {
        throw Error('disk');
      };
    await assert.rejects(
      executeAction({ kind: 'buy', key: 'armoire' }, f.ports),
      cleanupFails ? /disk/ : /rejected/,
    );
    assert.equal(f.pending, cleanupFails);
    assert.deepEqual(f.statuses, cleanupFails ? ['pending'] : ['pending', '']);
  }
});

test('remote success followed by local cleanup failure cannot replay a purchase', async () => {
  const f = fixture();
  f.ports.journal.clear = () => {
    throw Error('disk');
  };
  await assert.rejects(executeAction({ kind: 'buy', key: 'armoire' }, f.ports), /操作已成功/);
  assert.equal(f.pending, true);
  await assert.rejects(executeAction({ kind: 'buy', key: 'armoire' }, f.ports), /尚未确认/);
  assert.equal(f.events.filter((e) => e === 'buy').length, 1);
});

test('refresh failure after success still returns the actual result with a display message', async () => {
  const f = fixture();
  let reads = 0;
  f.ports.gateway.readPlayer = async () => {
    if (reads++) throw Error('offline');
    return f.user;
  };
  const outcome = await executeAction({ kind: 'buy', key: 'armoire' }, f.ports);
  assert.equal(outcome.result, f.result);
  assert.match(outcome.message, /操作已成功/);
  assert.equal(f.pending, false);
});

test('connection change before submission prevents writes; change after submission skips stale refresh', async () => {
  const before = fixture();
  before.ports.isCurrent = () => false;
  await assert.rejects(executeAction({ kind: 'buy', key: 'armoire' }, before.ports), /连接已改变/);
  assert.deepEqual(before.events, ['catalog', 'user']);
  assert.equal(before.users.length, 0);
  const after = fixture();
  let current = true;
  after.ports.isCurrent = () => current;
  after.ports.gateway.execute = async () => {
    current = false;
    return after.result;
  };
  const outcome = await executeAction({ kind: 'buy', key: 'armoire' }, after.ports);
  assert.equal(outcome.result, after.result);
  assert.equal(after.events.filter((e) => e === 'user').length, 1);
});

test('manual acknowledgement requires confirmation, never executes, and keeps pause on read failure', async () => {
  const f = fixture();
  f.ports.journal.begin({ kind: 'buy', key: 'armoire' }, 123);
  f.events.length = 0;
  assert.equal(await acknowledgeAction(false, f.ports), false);
  assert.deepEqual(f.events, []);
  f.ports.gateway.readPlayer = async () => {
    throw Error('offline');
  };
  await assert.rejects(acknowledgeAction(true, f.ports), /offline/);
  assert.equal(f.pending, true);
  f.ports.gateway.readPlayer = async () => f.user;
  assert.equal(await acknowledgeAction(true, f.ports), true);
  assert.equal(f.pending, false);
  assert.deepEqual(f.events, ['clear', 'invalidate-shops', 'clear-shops']);
});

test('manual acknowledgement cannot clear a marker after account change or local cleanup failure', async () => {
  for (const changed of [true, false]) {
    const f = fixture();
    f.ports.journal.begin({ kind: 'cast', key: 'stealth' }, 123);
    if (changed) f.ports.isCurrent = () => false;
    else
      f.ports.journal.clear = () => {
        throw Error('quota');
      };
    await assert.rejects(acknowledgeAction(true, f.ports));
    assert.equal(f.pending, true);
    assert.equal(f.users.length, 0);
    assert.deepEqual(f.statuses, []);
  }
});

test('journal preserves legacy key and record format and treats malformed markers as pending', () => {
  const memory = new Map<string, string>(),
    storage = {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    };
  const a = new LocalActionJournal('workspace', 'alice', storage),
    b = new LocalActionJournal('workspace', 'bob', storage);
  a.begin({ kind: 'buy', key: 'armoire' }, 123);
  assert.deepEqual(JSON.parse(memory.get('workspace:action:alice')!), {
    kind: 'buy',
    key: 'armoire',
    at: 123,
  });
  assert.equal(b.hasPending(), false);
  assert.equal(new LocalActionJournal('workspace', 'alice', storage).hasPending(), true);
  memory.set('workspace:action:alice', 'malformed');
  assert.equal(a.hasPending(), true);
  assert.equal(memory.get('workspace:action:alice'), 'malformed');
  a.clear();
  assert.equal(a.hasPending(), false);
});

test('invalid action identifiers fail before touching storage', () => {
  for (const [kind, key] of [
    ['buy', '../bad'],
    ['cast', 'spell/other'],
    ['equip', '../bad'],
    ['unknown', 'key'],
  ])
    assert.throws(() => companionAction(kind, key));
  assert.deepEqual(companionAction('equip', 'weapon_rogue_4'), {
    kind: 'equip',
    key: 'weapon_rogue_4',
  });
  let writes = 0;
  const journal = new LocalActionJournal('workspace', 'account', {
    getItem: () => null,
    setItem: () => writes++,
    removeItem() {},
  });
  assert.throws(() => journal.begin({ kind: 'buy', key: '../bad' }, 1));
  assert.throws(() => journal.begin({ kind: 'buy', key: 'armoire' }, NaN));
  assert.equal(writes, 0);
});

test('Habitica companion adapter selects official catalogs and forces fresh account reads', async () => {
  const calls: unknown[] = [];
  const user = { stats: { class: 'rogue', hp: 32, gp: 200 }, flags: { armoireEnabled: true } };
  const client = {
    user: async (options: { fresh: boolean }) => {
      calls.push(options);
      return user;
    },
    cast: async (key: string) => ({ cast: key }),
    buy: async (key: string) => ({ buy: key }),
    equip: async (key: string) => ({ equip: key }),
    invalidateUser() {},
    invalidateShops() {},
  };
  const gateway = new HabiticaCompanionGateway(client, async (kind) => ({
    content: {
      spells: { rogue: { stealth: { key: 'stealth', target: 'self', mana: 45, lvl: 14 } } },
      gear: { flat: { weapon_rogue_4: { key: 'weapon_rogue_4', text: '暗影短剑' } } },
    },
    shops: { market: {}, gear: {}, seasonal: {} },
  }));
  assert.equal(await gateway.readPlayer(), user);
  assert.deepEqual(calls, [{ fresh: true }]);
  const catalog = await gateway.loadCatalog('buy');
  assert.equal(catalog.productFor(user, 'armoire')!.price, 100);
  assert.equal(catalog.skillFor(user, 'stealth')!.target, 'self');
  assert.equal(catalog.productFor(user, 'missing'), undefined);
  assert.deepEqual(catalog.gearFor(user, 'weapon_rogue_4'), {
    key: 'weapon_rogue_4',
    equipped: false,
  });
  assert.equal(catalog.gearFor(user, 'missing'), undefined);
  assert.deepEqual(await gateway.execute({ kind: 'cast', key: 'stealth' }), { cast: 'stealth' });
  assert.deepEqual(await gateway.execute({ kind: 'buy', key: 'armoire' }), { buy: 'armoire' });
  assert.deepEqual(await gateway.execute({ kind: 'equip', key: 'weapon_rogue_4' }), {
    equip: 'weapon_rogue_4',
  });
});
