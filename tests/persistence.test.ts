import { stubFetch, invalidFixture } from './support.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress, TodoProgress } from '../src/features/progress/domain/TodoProgress.ts';
import { ActivityProgress } from '../src/features/progress/domain/ActivityProgress.ts';
import { parseProgress } from '../src/features/progress/adapters/progressSchema.ts';
import { ProgressWriter } from '../src/features/progress/application/persistence.ts';
import { SiYuanProgressRepository as ProgressStorage } from '../src/features/progress/adapters/SiYuanProgressRepository.ts';
import { SiYuanConnectionRepository as ConnectionStorage } from '../src/features/connection/adapters/SiYuanConnectionRepository.ts';

const now = new Date(2026, 10, 20, 12).getTime();
function populated() {
  const state = newProgress();
  state.target = 1;
  const todo = new TodoProgress(state, () => 'todo-reward');
  todo.observe([{ id: 'todo', markdown: '* [ ] task' }], now);
  todo.localChange('todo', true, now);
  todo.observe([{ id: 'todo', markdown: '* [x] task' }], now + 60001);
  let sequence = 0;
  const activity = new ActivityProgress(state, () => 'edit-reward-' + sequence++);
  activity.record(
    { id: '20261101000000-aaaaaaa', inserted: 70, previousUpdated: now - 100 * 86400000 },
    now,
  );
  return state;
}

test('schema restores generated TODO and editing state without field loss or mutation', () => {
  const state = populated();
  Object.assign(state, { extension: { future: 'preserved' } });
  const before = JSON.stringify(state);
  const loaded = parseProgress(JSON.parse(before));
  assert.equal(JSON.stringify(loaded), before);
  assert.deepEqual(Reflect.get(loaded, 'extension'), Reflect.get(state, 'extension'));
  assert.equal(JSON.stringify(state), before);
  assert.doesNotThrow(() => new ActivityProgress(loaded).day(now + 86400000));
});

test('legacy v1 state without activity or receipt fields is retained exactly', () => {
  const state = newProgress();
  state.rewards = [{ id: 'old', status: 'uncertain', created: now, count: 1, sources: ['one'] }];
  state.used['2026-11-20'] = { legacy: true };
  assert.equal(parseProgress(state), state);
  assert.equal(state.rewards[0].attempted, undefined);
  assert.equal(state.activity, undefined);
});

test('malformed financial and activity fields are rejected instead of defaulted', () => {
  const cases: Array<
    (s: import('../src/features/progress/domain/types.js').ProgressState) => unknown
  > = [
    (s) => Reflect.set(s, 'version', 2),
    (s) => Reflect.deleteProperty(s, 'pending'),
    (s) => (s.target = 0),
    (s) => (s.total = -1),
    (s) => Reflect.set(s, 'credits', {}),
    (s) => Reflect.set(s, 'rewards', [{ id: 'bad', status: 'queued' }]),
    (s) => Reflect.set(s.rewards[0], 'status', 'unknown'),
    (s) => (s.rewards[0].before = -1),
    (s) => s.rewards.push({ ...s.rewards[0] }),
    (s) => (s.pending.bad = { since: now, day: '2026-02-30' }),
    (s) => Reflect.set(s.used, '2026-11-20', { bad: false }),
    (s) => s.credits.push({ id: 'one', day: '2026-01-01' }),
    (s) => Reflect.set(s.activity!, 'version', 2),
    (s) => (s.activity!.days['2026-11-20'].editingTarget = 0),
    (s) => (s.activity!.current = '2026-11-21'),
    (s) => Reflect.set(s.activity!.days['2026-11-20'], 'blocks', null),
  ];
  for (const mutate of cases) {
    const state = populated();
    mutate(state);
    const before = JSON.stringify(state);
    assert.throws(() => parseProgress(state), /已停止读取以保护已有记录/);
    assert.equal(JSON.stringify(state), before);
  }
});

test('invalid document never reaches a write, and null/array JSON cannot initialize progress', async () => {
  let writes = 0;
  const storage = new ProgressStorage(
    'gamify-for-siyuan',
    stubFetch(async () => {
      writes++;
      return { ok: true, status: 200, json: async () => ({ code: 0 }) };
    }),
  );
  await assert.rejects(storage.write(invalidFixture({ version: 1 })), /格式不正确/);
  assert.equal(writes, 0);
  for (const value of [null, [], { version: 2 }, { version: 1, target: 1 }]) {
    const store = new ProgressStorage(
      'gamify-for-siyuan',
      stubFetch(async () => ({ ok: true, status: 200, json: async () => value })),
    );
    await assert.rejects(store.read(), /不正确/);
  }
});

test('ordered writer snapshots at invocation and rejects all queued writes after failure', async () => {
  const state = newProgress();
  let release!: () => void;
  const writes: number[] = [];
  const writer = new ProgressWriter({
    write: async (snapshot) => {
      writes.push(snapshot.total);
      if (writes.length === 1) await new Promise<void>((resolve) => (release = resolve));
      throw Error('disk full');
    },
  });
  state.total = 1;
  const first = writer.save(state);
  state.total = 2;
  const second = writer.save(state);
  const failure = Promise.allSettled([first, second]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  state.total = 3;
  assert.deepEqual(writes, [1]);
  release();
  const results = await failure;
  for (const r of results) {
    assert.equal(r.status, 'rejected');
    assert.match(r.reason.message, /disk full/);
  }
  assert.equal(writer.failed, true);
  await assert.rejects(writer.save(state), /已暂停奖励/);
  assert.deepEqual(writes, [1]);
});

test('writer stop cancels queued writes after another-device update', async () => {
  const state = newProgress();
  let release!: () => void;
  const writes: number[] = [];
  const writer = new ProgressWriter({
    write: async (snapshot) => {
      writes.push(snapshot.total);
      await new Promise<void>((resolve) => (release = resolve));
    },
  });
  state.total = 1;
  const first = writer.save(state);
  state.total = 2;
  const second = writer.save(state);
  const results = Promise.allSettled([first, second]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  writer.stop(Error('其他设备进度更新'));
  release();
  const [a, b] = await results;
  assert.equal(a.status, 'fulfilled');
  assert.equal(b.status, 'rejected');
  assert.match(b.reason.message, /其他设备/);
  assert.deepEqual(writes, [1]);
});

test('shared connection disable tombstone and corrupt file remain separate from progress schema', async () => {
  for (const value of [
    { version: 1, enabled: false },
    { version: 1, enabled: false, token: 'legacy' },
  ]) {
    const store = new ConnectionStorage(
      'gamify-for-siyuan',
      stubFetch(async () => ({ ok: true, status: 200, json: async () => value })),
    );
    assert.equal(await store.read(), null);
  }
  for (const value of [
    { version: 2, enabled: false },
    null,
    [],
    { version: 1, enabled: true, userId: 'invalid' },
  ]) {
    const store = new ConnectionStorage(
      'gamify-for-siyuan',
      stubFetch(async () => ({ ok: true, status: 200, json: async () => value })),
    );
    await assert.rejects(store.read());
  }
});
