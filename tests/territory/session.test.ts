import { MemoryAtlas as Memory, metadataApi, invalidFixture } from '../support.js';
import type {
  WorldSnapshot,
  MetadataApi,
  CollectionResult,
} from '../../src/features/territory/application/ports.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { CollectionSession } from '../../src/features/territory/application/CollectionSession.ts';
import { MAX_AGE } from '../../src/features/territory/application/ports.ts';

const snapshot = (at = 100): WorldSnapshot => ({
  version: 1,
  generator: 4,
  at,
  books: [],
  pages: [],
  edges: [],
  layout: { version: 4, regions: {}, books: {}, pages: {} },
});
function setup(api: MetadataApi = metadataApi(async () => ({ books: [] }))) {
  const cache = new Memory(),
    events: unknown[][] = [],
    jobs: Array<{ fn: () => void; delay: number; cancelled: boolean }> = [];
  let visible = true,
    locked = false;
  const env: import('../../src/features/territory/application/CollectionSession.js').CollectionEnvironment =
    {
      now: () => 101,
      visible: () => visible,
      schedule(fn, delay) {
        const job = { fn, delay, cancelled: false };
        jobs.push(job);
        return () => (job.cancelled = true);
      },
      async exclusively(work) {
        if (!locked) await work();
      },
    };
  const hooks: import('../../src/features/territory/application/CollectionSession.js').CollectionHooks =
    {
      setBooks: () => {},
      progress: (p) => events.push(['progress', p.phase]),
      ready: async () => {},
      collected: async (data) => {
        events.push(['collected', data]);
        return snapshot();
      },
      saved: (s) => events.push(['saved', s]),
      fresh: () => events.push(['fresh']),
      error: (e, unavailable) => events.push(['error', unavailable]),
    };
  const session = new CollectionSession(api, cache, env, hooks);
  async function fire() {
    const job = jobs.filter((j) => !j.cancelled).at(-1);
    assert.ok(job);
    job.cancelled = true;
    job.fn();
    for (let i = 0; i < 8; i++) await tick();
  }
  return {
    cache,
    session,
    hooks,
    events,
    jobs,
    fire,
    hide: () => (visible = false),
    lock: () => (locked = true),
  };
}
test('fresh complete cache waits one day without any metadata request', async () => {
  let calls = 0;
  const t = setup(
    metadataApi(async () => {
      calls++;
      throw Error('unused');
    }),
  );
  await t.cache.write('snapshot', snapshot());
  await t.session.start();
  assert.equal(t.jobs.at(-1)!.delay, 1500);
  await t.fire();
  assert.equal(calls, 0);
  assert.deepEqual(t.events, [['fresh']]);
  assert.equal(t.jobs.at(-1)!.delay, MAX_AGE - 1);
  t.session.stop();
});
test('hidden page and unavailable cross-tab lock postpone collection without reads', async () => {
  for (const mode of ['hide', 'lock'] as const) {
    let calls = 0;
    const t = setup(
      metadataApi(async () => {
        calls++;
        return { books: [] };
      }),
    );
    t[mode]();
    await t.session.start();
    await t.fire();
    assert.equal(calls, 0);
    assert.equal(t.jobs.at(-1)!.delay, mode === 'hide' ? 15000 : 3000);
  }
});
test('one request per batch and complete catalog commits before saved notification', async () => {
  const calls: string[] = [],
    t = setup(
      metadataApi(async (name) => {
        calls.push(name);
        return name === 'books' ? { books: [] } : [];
      }),
    );
  t.hooks.saved = () => {
    assert.ok(t.cache.values.get('snapshot'));
    assert.equal(t.cache.values.get('checkpoint'), null);
    t.events.push(['saved']);
  };
  await t.session.start();
  for (let i = 0; i < 4; i++) {
    const before: number = calls.length;
    await t.fire();
    assert.ok(calls.length - before <= 1);
  }
  assert.deepEqual(calls, ['books', 'pages', 'edges']);
  assert.deepEqual(
    t.events.filter((e) => e[0] === 'saved'),
    [['saved']],
  );
  assert.equal(t.jobs.at(-1)!.delay, MAX_AGE);
});
test('stop cancels pending batch and stale timer cannot resume it', async () => {
  let calls = 0;
  const t = setup(
    metadataApi(async () => {
      calls++;
      return { books: [] };
    }),
  );
  await t.session.start();
  const stale = t.jobs.at(-1);
  t.session.stop();
  assert.equal(stale!.cancelled, true);
  stale!.fn();
  await tick();
  assert.equal(calls, 0);
  assert.equal(t.session.busy, false);
});
test('close during catalog request never applies late result or schedules another batch', async () => {
  let finish;
  const t = setup(metadataApi(() => new Promise((resolve) => (finish = resolve))));
  await t.session.start();
  await t.fire();
  assert.equal(t.session.busy, true);
  t.session.stop();
  finish!({ books: [] });
  for (let i = 0; i < 8; i++) await tick();
  assert.equal(t.jobs.length, 1);
  assert.deepEqual(t.events, []);
  assert.equal(t.session.busy, false);
});
test('recoverable network failure backs off; cache write failure disables collection', async () => {
  const network = setup(
    metadataApi(async () => {
      throw Error('offline');
    }),
  );
  await network.session.start();
  await network.fire();
  assert.equal(network.jobs.at(-1)!.delay, 60000);
  assert.equal(network.session.available, true);
  assert.deepEqual(network.events, [['error', false]]);
  const disk = setup();
  disk.cache.write = async () => {
    throw Object.assign(Error('full'), { cacheError: true });
  };
  await disk.session.start();
  await disk.fire();
  assert.equal(disk.session.available, false);
  assert.deepEqual(disk.events, [['error', true]]);
  const count = disk.jobs.length;
  await disk.session.start();
  assert.equal(disk.jobs.length, count);
});
test('closing while restoring cache prevents initial scheduling', async () => {
  const t = setup();
  let finish;
  t.hooks.ready = () => new Promise((resolve) => (finish = resolve));
  const started = t.session.start();
  for (let i = 0; i < 8; i++) await tick();
  t.session.stop();
  finish!();
  await started;
  assert.equal(t.jobs.length, 0);
});
