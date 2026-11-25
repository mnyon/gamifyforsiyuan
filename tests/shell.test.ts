import { invalidFixture } from './support.js';
import type TestPlugin from '../dev/plugin-simulation/TestPlugin.js';
import { HabiticaError } from '../src/adapters/habitica/HabiticaError.js';
import type { HabiticaClient } from '../src/adapters/habitica/HabiticaClient.js';
import type { GamifyView } from '../src/presentation/GamifyView.js';
import type { SiYuanProgressRepository } from '../src/features/progress/adapters/SiYuanProgressRepository.js';
import type { ProgressState } from '../src/features/progress/domain/types.js';
// These VM fixtures supply only methods exercised by each integration scenario.
const clientStub = (value: Partial<HabiticaClient>): HabiticaClient => invalidFixture(value);
const viewStub = (value: Partial<GamifyView>): GamifyView => invalidFixture(value);
const progressStub = (value: Partial<SiYuanProgressRepository>): SiYuanProgressRepository =>
  invalidFixture(value);
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { newProgress } from '../src/features/progress/domain/TodoProgress.ts';
import { execFileSync } from 'node:child_process';
const outputDirectories = ['dist/gamify-for-siyuan', 'dist/test/gamify-for-siyuan'];
for (const directory of outputDirectories) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(directory + '/obsolete-release-file.txt', 'stale');
}
execFileSync(process.execPath, [
  '--import',
  'tsx',
  'tools/build.ts',
  '--test-mode',
  '--skip-package',
]);
execFileSync(process.execPath, ['--import', 'tsx', 'tools/build.ts', '--skip-package']);
test('build removes stale release output while preserving development sources', () => {
  for (const directory of outputDirectories) {
    assert.equal(fs.existsSync(directory + '/obsolete-release-file.txt'), false);
    assert.ok(fs.existsSync(directory + '/index.js'));
    assert.equal(
      fs.readFileSync(directory + '/docs/Document.md', 'utf8'),
      fs.readFileSync('docs/Document.md', 'utf8'),
    );
  }
  assert.ok(fs.existsSync('dev/plugin-simulation/TestPlugin.ts'));
});
function plugin(testBuild = true, extra: Record<string, unknown> = {}) {
  const memory = new Map<string, string>();
  const context = {
    HTMLElement: class {
      static [Symbol.hasInstance](value: unknown) {
        return !!value && typeof value === 'object';
      }
    },
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
    module: { exports: {} },
    require: () => ({
      Plugin: class {
        kernel = { rpc: {} };
      },
    }),
    console,
    crypto: globalThis.crypto,
    AbortSignal,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  Object.assign(context, extra);
  vm.runInNewContext(
    fs.readFileSync(
      testBuild ? 'dist/test/gamify-for-siyuan/index.js' : 'dist/gamify-for-siyuan/index.js',
      'utf8',
    ),
    context,
  );
  const PluginClass = invalidFixture<new () => TestPlugin>(context.module.exports);
  const p = new PluginClass();
  p.engine = invalidFixture({
    state: {
      ...newProgress(),
      alias: 'demo',
      credits: [],
      pending: {},
      rewards: [{ id: 'one', status: 'queued', created: Date.now(), count: 1, sources: [] }],
      total: 0,
    },
  });
  p.persist = async () => {};
  p.render = () => {};
  p.view = viewStub({ feedback: () => {}, rewardFeedback: () => {} });
  p.user = { stats: { hp: 32, gp: 1 } };
  return p;
}

test('test mode never calls Habitica, even with a previously connected client', async () => {
  const p = plugin();
  p.testMode = true;
  let network = 0,
    feedback = 0,
    scans = 0;
  p.client = new Proxy(invalidFixture<HabiticaClient>({}), {
    get: () => async () => {
      network++;
      throw new Error('unexpected network');
    },
  });
  p.view.rewardFeedback = (gold) => {
    feedback++;
    assert.equal(gold, 1);
  };
  p.scan = async () => {
    scans++;
  };
  await p.flushRewards();
  await p.resolveRewards(true);
  await p.refresh();
  await assert.rejects(p.connect({}), /测试模式/);
  await p.testAction('reward');
  assert.equal(network, 0);
  assert.equal(feedback, 2);
  assert.equal(scans, 1);
  assert.equal(p.engine.state.total, 1);
  assert.equal(p.engine.state.rewards[0].status, 'sent');
});

test('test persistence writes only isolated local storage', async () => {
  const p = plugin();
  p.testMode = true;
  p.storeKey = 'isolated';
  Reflect.deleteProperty(p, 'persist');
  let writes = 0;
  p.progressStorage = progressStub({
    write: async () => {
      writes++;
    },
  });
  await p.persist();
  assert.equal(writes, 0);
  assert.equal((p.readTestState() as ProgressState).rewards[0].id, 'one');
  p.testMode = false;
  await p.persist();
  assert.equal(writes, 1);
});

test('production build excludes test controls and simulated action methods', () => {
  const p = plugin(false);
  assert.equal(p.testAction, undefined);
  assert.equal(Reflect.get(p, 'setTestMode'), undefined);
  const code = fs.readFileSync('dist/gamify-for-siyuan/index.js', 'utf8');
  assert.doesNotMatch(code, /TEST_BUILD/);
  assert.doesNotMatch(code, /模拟完成 TODO|预览金币特效/);
  assert.equal(typeof plugin(true).testAction, 'function');
});

test('test build restores only test progress without changing real progress', async () => {
  const p = plugin();
  p.storeKey = 'build-isolation';
  const real = newProgress();
  real.target = 12;
  real.credits = [{ id: 'real-item', day: '2026-11-18' }];
  real.used['2026-11-18'] = { 'real-item': 'unspent' };
  p.testMode = true;
  p.engine = p.makeEngine(null);
  assert.equal(p.engine.state.target, 3);
  let realWrites = 0;
  p.progressStorage = progressStub({
    write: async () => {
      realWrites++;
    },
  });
  Reflect.deleteProperty(p, 'persist');
  p.engine.localChange('test-item', true);
  await p.persist();
  p.engine = p.makeEngine(p.readTestState());
  assert.ok(p.engine.state.pending['test-item']);
  assert.equal(p.testRows[0].id, 'test-item');
  p.testMode = false;
  p.engine = p.makeEngine(real);
  assert.equal(p.engine.state.target, 12);
  assert.equal(p.engine.state.credits[0].id, 'real-item');
  assert.equal(realWrites, 0);
});
test('reward is durably marked sending before the score request', async () => {
  const p = plugin();
  const events: string[] = [];
  p.persist = async () => {
    events.push(p.engine.state.rewards[0].status);
  };
  p.client = clientStub({
    user: async () => ({ stats: { gp: 1 } }),
    task: async () => ({ priority: 0.1, type: 'habit', up: true, down: false, counterUp: 0 }),
    score: async () => {
      events.push('request');
      return { gp: 2, hp: 32 };
    },
  });
  await p.flushRewards();
  assert.deepEqual(events, ['sending', 'request', 'sent']);
  assert.equal(p.engine.state.total, 1);
  assert.equal(p.user!.stats!.gp, 2);
  await p.flushRewards();
  assert.equal(events.length, 3);
});
test('ambiguous score is never automatically retried', async () => {
  const p = plugin();
  let calls = 0;
  p.client = clientStub({
    user: async () => ({ stats: { gp: 1 } }),
    task: async () => ({ priority: 0.1, type: 'habit', up: true, down: false, counterUp: 0 }),
    score: async () => {
      calls++;
      throw Object.assign(new Error('timeout'), { uncertain: true });
    },
  });
  await p.flushRewards();
  p.retryAfter = 0;
  await p.flushRewards();
  assert.equal(calls, 1);
  assert.equal(p.engine.state.rewards[0].status, 'uncertain');
  await p.resolveRewards();
  assert.equal(p.engine.state.rewards[0].status, 'uncertain');
  assert.equal(p.engine.state.total, 0);
  p.client.task = async () => ({ counterUp: 1 });
  await p.resolveRewards();
  assert.equal(p.engine.state.total, 1);
  assert.equal(p.engine.state.rewards[0].status, 'sent');
  await p.resolveRewards();
  assert.equal(p.engine.state.total, 1);
});
test('storage failure blocks scoring before network mutation', async () => {
  const p = plugin();
  let calls = 0;
  p.persist = async () => {
    throw new Error('disk');
  };
  p.client = clientStub({
    user: async () => ({ stats: { gp: 1 } }),
    task: async () => ({ priority: 0.1, type: 'habit', up: true, down: false }),
    score: async () => {
      calls++;
      return {};
    },
  });
  await p.flushRewards();
  assert.equal(calls, 0);
});
test('reward feedback uses fresh gold balance and originating TODO id', async () => {
  const p = plugin();
  let shown;
  p.engine.state.rewards[0].sources = ['todo-a', 'todo-b'];
  p.view.rewardFeedback = (gold, context) => {
    shown = { gold, context };
  };
  p.client = clientStub({
    user: async () => ({ stats: { gp: 40.25 } }),
    task: async () => ({ priority: 0.1, type: 'habit', up: true, down: false }),
    score: async () => ({ gp: 41.75, hp: 32 }),
  });
  await p.flushRewards();
  assert.equal(shown!.gold, 1.5);
  assert.equal(shown!.context.blockId, 'todo-b');
  assert.equal(p.engine.state.rewards[0].gold, 1.5);
});
test('missing reward balance never fabricates a gold amount', async () => {
  const p = plugin();
  let shown: string | number | null | undefined = 'unset';
  p.view.rewardFeedback = (gold) => {
    shown = gold;
  };
  p.client = clientStub({
    user: async () => ({ stats: {} }),
    task: async () => ({ priority: 0.1, type: 'habit', up: true, down: false }),
    score: async () => ({ hp: 32 }),
  });
  await p.flushRewards();
  assert.equal(shown, null);
  assert.equal(p.engine.state.total, 1);
});
test('a failed visual effect cannot requeue a successful reward', async () => {
  const p = plugin();
  let calls = 0;
  p.view.rewardFeedback = () => {
    throw new Error('visual effect failed');
  };
  p.client = clientStub({
    user: async () => ({ stats: { gp: 1 } }),
    task: async () => ({ priority: 0.1, type: 'habit', up: true, down: false }),
    score: async () => {
      calls++;
      return { gp: 2 };
    },
  });
  await p.flushRewards();
  p.retryAfter = 0;
  await p.flushRewards();
  assert.equal(calls, 1);
  assert.equal(p.engine.state.rewards[0].status, 'sent');
  assert.equal(p.engine.state.total, 1);
});
test('SiYuan kernel property cannot shadow the plugin HTTP method', () => {
  const p = plugin();
  assert.equal(typeof Reflect.get(p, 'kernel'), 'object');
  assert.equal(typeof p.requestSiYuan, 'function');
});
test('save failures retain the kernel explanation and pause scoring', async () => {
  const p = plugin();
  Reflect.deleteProperty(p, 'persist');
  p.progressStorage = progressStub({
    write: async () => {
      throw new Error('disk full');
    },
  });
  await assert.rejects(p.persist(), /disk full/);
  assert.equal(p.storageFailed, true);
});

test('overlapping progress writes preserve snapshot order', async () => {
  const p = plugin();
  Reflect.deleteProperty(p, 'persist');
  p.testMode = false;
  const writes: number[] = [];
  let release!: () => void;
  p.progressStorage = progressStub({
    write: async (state) => {
      writes.push(state.total);
      if (writes.length === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
    },
  });
  p.engine.state.total = 1;
  const first = p.persist();
  await new Promise<void>((resolve) => setImmediate(resolve));
  p.engine.state.total = 2;
  const second = p.persist();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [1]);
  release!();
  await Promise.all([first, second]);
  assert.deepEqual(writes, [1, 2]);
});

test('new activity reward kinds use the existing durable Habitica queue', async () => {
  const p = plugin();
  p.engine.state.rewards = [
    { id: 'edit', kind: 'editing', status: 'queued', created: 0, count: 1, sources: [] },
    { id: 'old', kind: 'maintenance', status: 'queued', created: 0, count: 1, sources: [] },
  ];
  let scores = 0;
  p.client = clientStub({
    user: async () => ({ stats: { gp: scores } }),
    task: async () => ({ priority: 0.1, type: 'habit', up: true, down: false, counterUp: scores }),
    score: async () => ({ gp: ++scores }),
  });
  await p.flushRewards();
  assert.equal(scores, 2);
  assert.equal(p.engine.state.total, 2);
  await p.flushRewards();
  assert.equal(scores, 2);
});

test('workspace connection is opt-in, reuses synced credentials, and never resaves unchanged secrets', async () => {
  let file: unknown = null,
    reads = 0,
    writes = 0;
  const p = plugin(false, {
    FormData,
    Blob,
    fetch: async (url: string, options: { body: FormData }) => {
      if (url.endsWith('getFile')) {
        reads++;
        return file ? { ok: true, status: 200, json: async () => file } : { status: 202 };
      }
      writes++;
      file = JSON.parse(await (options.body.get('file') as File).text());
      return { ok: true, json: async () => ({ code: 0 }) };
    },
  });
  p.name = 'gamify-for-siyuan';
  p.storeKey = 'shared';
  p.testMode = false;
  p.credentials = {};
  p.view.credentials = () => {};
  const value = {
    userId: '11111111-1111-4111-8111-111111111111',
    token: '22222222-2222-4222-8222-222222222222',
  };
  await p.saveConnection(value);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  await p.saveConnection({ ...value, syncCredentials: true });
  assert.equal(writes, 1);
  p.credentials = {};
  assert.equal(await p.restoreSharedConnection(), true);
  assert.equal(p.credentials.userId, value.userId);
  await p.saveConnection(p.credentials);
  assert.equal(writes, 1);
  await p.saveConnection(value);
  assert.equal(writes, 2);
  assert.deepEqual(file, { version: 1, enabled: false });
  p.credentials = { ...value };
  const before = reads;
  await p.restoreSharedConnection();
  assert.equal(reads, before);
  p.testMode = true;
  await p.saveConnection({ ...value, syncCredentials: true });
  await p.restoreSharedConnection();
  assert.equal(writes, 2);
});

test('adventure task skill is rejected before mutation for every class', async () => {
  for (const klass of ['rogue', 'warrior', 'wizard', 'healer']) {
    const p = plugin(false);
    p.active = true;
    p.storeKey = 'guard';
    p.credentials = { userId: 'account' };
    p.engine.state.rewards = [];
    p.content = {
      spells: {
        [klass]: {
          targeted: { key: 'targeted', text: 'Target', target: 'task', mana: 10, lvl: 11 },
        },
      },
    };
    p.loadAdventure = async () => {};
    let calls = 0;
    p.client = clientStub({
      user: async () => ({ stats: { class: klass, lvl: 90, hp: 50, mp: 100 } }),
      cast: async () => {
        calls++;
        return {};
      },
    });
    await assert.rejects(p.adventureAction('cast', 'targeted'), /需指定任务的技能，暂时不支持释放/);
    assert.equal(calls, 0);
  }
});
test('adventure mutations serialize, persist ambiguity, and cannot be replayed after a timeout', async () => {
  const p = plugin(false);
  p.active = true;
  p.storeKey = 'action';
  p.credentials = { userId: 'account' };
  p.engine.state.rewards = [];
  p.content = {
    spells: {
      rogue: { stealth: { key: 'stealth', text: 'Stealth', target: 'self', mana: 45, lvl: 14 } },
    },
  };
  p.loadAdventure = async () => {};
  let calls = 0,
    release!: () => void;
  p.client = clientStub({
    user: async () => ({ stats: { class: 'rogue', lvl: 90, hp: 50, mp: 100 } }),
    invalidateUser: () => {},
    cast: async () => {
      calls++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      throw Object.assign(new Error('timeout'), { uncertain: true });
    },
  });
  const first = p.adventureAction('cast', 'stealth');
  await new Promise<void>((resolve) => setImmediate(resolve));
  await assert.rejects(p.adventureAction('cast', 'stealth'), /正在同步/);
  release!();
  await assert.rejects(first, /不会自动重发/);
  assert.equal(calls, 1);
  assert.ok(p.adventureUncertain);
  await assert.rejects(p.adventureAction('cast', 'stealth'), /尚未确认/);
  assert.equal(calls, 1);
});

test('successful armoire purchase returns the server result, refreshes inventory and is submitted once', async () => {
  const p = plugin(false);
  p.active = true;
  p.storeKey = 'purchase';
  p.credentials = { userId: 'account' };
  p.engine.state.rewards = [];
  p.content = { gear: { flat: {} }, armoire: { value: 100, text: '宝箱' } };
  p.shops = { market: {}, gear: {}, seasonal: {} };
  p.loadAdventure = async () => {};
  let mutations = 0,
    reads = 0,
    invalidations = 0;
  const result = { armoire: { type: 'experience', value: 31 } };
  p.client = clientStub({
    user: async () => {
      reads++;
      return { stats: { gp: 200, hp: 32 }, flags: { armoireEnabled: true }, items: {} };
    },
    buy: async (key: string) => {
      assert.equal(key, 'armoire');
      mutations++;
      return result;
    },
    invalidateUser: () => invalidations++,
    invalidateShops: () => invalidations++,
  });
  const returned = await p.adventureAction('buy', 'armoire');
  assert.equal(returned, result);
  assert.equal(mutations, 1);
  assert.equal(reads, 2);
  assert.equal(invalidations, 2);
  assert.equal(p.adventureUncertain, '');
  assert.equal(p.adventureBusy, false);
  assert.equal(p.shops, null);
});

test('ambiguous purchase persists a marker and rejects further actions without a second mutation', async () => {
  const p = plugin(false);
  p.active = true;
  p.storeKey = 'ambiguous';
  p.credentials = { userId: 'account' };
  p.engine.state.rewards = [];
  p.content = { gear: { flat: {} }, armoire: { value: 100, text: '宝箱' } };
  p.shops = { market: {}, gear: {}, seasonal: {} };
  p.loadAdventure = async () => {};
  let mutations = 0;
  p.client = clientStub({
    user: async () => ({ stats: { gp: 200, hp: 32 }, flags: { armoireEnabled: true }, items: {} }),
    buy: async () => {
      mutations++;
      throw Object.assign(new Error('timeout'), { uncertain: true });
    },
    invalidateUser: () => {},
  });
  await assert.rejects(p.adventureAction('buy', 'armoire'), /不会自动重发/);
  assert.ok(p.adventureUncertain);
  assert.equal(p.adventureBusy, false);
  await assert.rejects(p.adventureAction('buy', 'armoire'), /尚未确认/);
  assert.equal(mutations, 1);
});

test('mutating adventure requests never overlap a reward transaction or another action', async () => {
  const p = plugin(false);
  p.active = true;
  p.client = clientStub({});
  p.sending = true;
  await assert.rejects(p.adventureAction('cast', 'stealth'), /正在同步/);
  p.sending = false;
  p.adventureBusy = true;
  await assert.rejects(p.adventureAction('buy', 'armoire'), /正在同步/);
});

test('external progress update cancels queued plugin writes without restarting the writer', async () => {
  const p = plugin(false);
  Reflect.deleteProperty(p, 'persist');
  p.testMode = false;
  p.engine.state = newProgress();
  let release!: () => void;
  const writes: number[] = [];
  p.progressStorage = progressStub({
    write: async (snapshot) => {
      writes.push(snapshot.total);
      await new Promise<void>((resolve) => (release = resolve));
    },
  });
  p.engine.state.total = 1;
  const first = p.persist();
  p.engine.state.total = 2;
  const second = p.persist();
  const results = Promise.allSettled([first, second]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  p.onDataChanged();
  release!();
  const [a, b] = await results;
  assert.equal(a.status, 'fulfilled');
  assert.equal(b.status, 'rejected');
  assert.deepEqual(writes, [1]);
  assert.equal(p.storageFailed, true);
  await assert.rejects(p.persist(), /已暂停奖励/);
  assert.deepEqual(writes, [1]);
});

test('corrupt persisted progress stops writer initialization before observations or writes', async () => {
  const calls: string[] = [];
  const p = plugin(false, {
    fetch: async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ version: 1, target: 12, rewards: 'corrupt' }),
      };
    },
  });
  p.name = 'gamify-for-siyuan';
  p.testMode = false;
  p.credentials = { userId: 'local', token: 'local' };
  await assert.rejects(p.initializeWriter(), /格式不正确/);
  assert.deepEqual(calls, ['/api/file/getFile', '/api/file/getFile']);
  assert.equal(p.editing, undefined);
  assert.equal(p.taskObserver, undefined);
});

test('failed shared connection save preserves plugin credentials and does not commit local values', async () => {
  let writes = 0;
  const p = plugin(false, {
    FormData,
    Blob,
    fetch: async (url: string) =>
      url.endsWith('getFile')
        ? { status: 202 }
        : { ok: true, json: async () => ({ code: -1, msg: 'disk full' }) },
    localStorage: { getItem: () => null, setItem: () => writes++ },
  });
  p.name = 'gamify-for-siyuan';
  p.storeKey = 'failed-shared';
  p.testMode = false;
  const current = { sound: false };
  p.credentials = current;
  await assert.rejects(
    p.saveConnection({
      userId: '11111111-1111-4111-8111-111111111111',
      token: '22222222-2222-4222-8222-222222222222',
      syncCredentials: true,
    }),
    /disk full/,
  );
  assert.equal(p.credentials, current);
  assert.equal(writes, 0);
});

test('plugin checkbox observation resolves the explicit progress preview import', async () => {
  let observed!: (records: Array<{ target: object; oldValue: string }>) => void,
    feedback:
      | (import('../src/presentation/types.js').FeedbackContext & {
          progress?: number;
          target?: number;
        })
      | undefined;
  const p = plugin(false, {
    fetch: async () => ({ status: 202 }),
    document: {
      body: {},
      addEventListener() {},
      removeEventListener() {},
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    MutationObserver: class {
      constructor(callback: typeof observed) {
        observed = callback;
      }
      observe() {}
      disconnect() {}
    },
    setInterval: () => 0,
    clearInterval() {},
  });
  p.name = 'gamify-for-siyuan';
  p.testMode = false;
  p.credentials = {};
  p.restoreSharedConnection = async () => false;
  p.scan = async () => {};
  p.scheduleScan = () => {};
  p.eventBus = invalidFixture({ on() {} });
  p.view.completeTodo = (value) => (feedback = value);
  await p.initializeWriter();
  const block = {
    dataset: { nodeId: '20261101000000-aaaaaaa' },
    matches: () => true,
    getAttribute: () => 'X',
  };
  observed!([{ target: block, oldValue: ' ' }]);
  assert.equal(feedback!.blockId, block.dataset.nodeId);
  assert.equal(feedback!.progress, 1);
  assert.equal(feedback!.target, 1);
  assert.equal(p.localDirty, true);
  p.editing!.stop();
});

test('successful purchase with failed local cleanup stays blocked instead of replaying', async () => {
  let marker: string | null = null,
    mutations = 0;
  const p = plugin(false, {
    localStorage: {
      getItem: () => marker,
      setItem: (_key: string, value: string) => (marker = value),
      removeItem: () => {
        throw Error('quota');
      },
    },
  });
  p.active = true;
  p.storeKey = 'cleanup';
  p.credentials = { userId: 'account' };
  p.content = {};
  p.shops = { market: {}, gear: {}, seasonal: {} };
  p.loadAdventure = async () => {};
  p.client = clientStub({
    user: async () => ({ stats: { hp: 32, gp: 200 }, flags: { armoireEnabled: true } }),
    buy: async () => {
      mutations++;
      return { armoire: { type: 'experience', value: 31 } };
    },
    invalidateUser() {},
    invalidateShops() {},
  });
  await assert.rejects(p.adventureAction('buy', 'armoire'), /操作已成功/);
  assert.ok(marker);
  assert.equal(p.adventureUncertain, 'pending');
  await assert.rejects(p.adventureAction('buy', 'armoire'), /尚未确认/);
  assert.equal(mutations, 1);
});

test('plugin manual reconciliation preserves confirmation and mutation exclusion', async () => {
  let confirmations = 0,
    marker: string | null = 'legacy',
    reads = 0,
    mutations = 0;
  const p = plugin(false, {
    confirm: () => {
      confirmations++;
      return true;
    },
    localStorage: { getItem: () => marker, setItem() {}, removeItem: () => (marker = null) },
  });
  p.active = true;
  p.storeKey = 'reconcile';
  p.credentials = { userId: 'account' };
  p.adventureUncertain = 'pending';
  p.client = clientStub({
    user: async () => {
      reads++;
      return { stats: { hp: 32 } };
    },
    buy: async () => {
      mutations++;
      return {};
    },
    cast: async () => {
      mutations++;
      return {};
    },
    invalidateUser() {},
    invalidateShops() {},
  });
  p.sending = true;
  await p.reconcileAdventure();
  assert.equal(confirmations, 0);
  p.sending = false;
  await p.reconcileAdventure();
  assert.equal(confirmations, 1);
  assert.equal(reads, 1);
  assert.equal(mutations, 0);
  assert.equal(marker, null);
  assert.equal(p.adventureUncertain, '');
  assert.equal(p.adventureBusy, false);
});

test('the drain timer reconnects pending rewards and stops after bad credentials', async () => {
  const p = plugin(false);
  assert.equal(p.testMode, false);
  p.active = true;
  p.credentials = { userId: 'local', token: 'local' };

  let connects = 0;
  p.connect = async () => {
    connects++;
  };
  await p.drainQueue();
  assert.equal(connects, 1);

  p.connect = async () => {
    throw new HabiticaError('Habitica 暂时不可用', true);
  };
  p.queueRetryAt = 0;
  await p.drainQueue();
  assert.equal(p.queueAttempts, 1);
  assert.ok(p.queueRetryAt > Date.now());
  await p.drainQueue();
  assert.equal(p.queueAttempts, 1);

  p.connect = async () => {
    throw new HabiticaError('User ID 或 API Token 不正确');
  };
  p.queueRetryAt = 0;
  await p.drainQueue();
  assert.equal(p.autoRetryBlocked, true);
  await p.drainQueue();
  assert.equal(p.autoRetryBlocked, true);
});

test('the drain timer sends through an existing client instead of reconnecting', async () => {
  const p = plugin(false);
  p.testMode = false;
  p.active = true;
  p.client = clientStub({});
  let resolved = 0,
    flushed = 0;
  p.resolveRewards = async () => {
    resolved++;
  };
  p.flushRewards = async () => {
    flushed++;
  };
  p.connect = async () => {
    throw new Error('should not reconnect');
  };
  await p.drainQueue();
  assert.equal(resolved, 1);
  assert.equal(flushed, 1);
});
