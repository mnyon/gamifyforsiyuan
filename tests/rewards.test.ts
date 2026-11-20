import type {
  SettlementPorts,
  ReconciliationPorts,
} from '../src/features/progress/application/ports.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress } from '../src/features/progress/domain/TodoProgress.ts';
import { settleRewards } from '../src/features/progress/application/settleRewards.ts';
import { reconcileRewards } from '../src/features/progress/application/reconcileRewards.ts';
import { HabiticaRewardGateway } from '../src/features/progress/adapters/HabiticaRewardGateway.ts';

const now = new Date(2026, 10, 20, 12).getTime();
function fixture() {
  const state = newProgress();
  state.alias = 'test-habit';
  state.rewards.push({ id: 'one', status: 'queued', created: now, count: 1, sources: ['block'] });
  const events: string[] = [];
  const ports: SettlementPorts & ReconciliationPorts = {
    state,
    now: () => now,
    shouldStop: () => false,
    gateway: {
      readTask: async () => ({
        priority: 0.1,
        type: 'habit',
        up: true,
        down: false,
        counterUp: 3,
        history: [{ scoredUp: 4 }],
      }),
      readPlayer: async () => ({ stats: { gp: 10 } }),
      score: async () => {
        events.push('score');
        return { gp: 12 };
      },
    },
    save: async () => {
      events.push(state.rewards[0].status);
    },
    onSettled: () => events.push('feedback'),
    requestRetry: false,
    confirmRetry: () => false,
    onMessage: () => {},
    onRetryQueued: () => {},
  };
  return { state, ports, events, reward: state.rewards[0] };
}

test('settlement use case persists its receipt before mutation and never scores twice', async () => {
  const { ports, state, reward, events } = fixture();
  await settleRewards(ports);
  await settleRewards(ports);
  assert.deepEqual(events, ['sending', 'score', 'sent', 'feedback']);
  assert.equal(reward.before, 3);
  assert.equal(reward.historyBefore, 4);
  assert.equal(reward.gold, 2);
  assert.equal(state.total, 1);
});

test('failed pre-score persistence prevents mutation; failed post-score persistence cannot requeue it', async () => {
  const before = fixture();
  before.ports.save = async () => {
    throw Error('disk');
  };
  await assert.rejects(settleRewards(before.ports), /disk/);
  assert.deepEqual(before.events, []);
  assert.equal(before.state.total, 0);
  const after = fixture();
  after.ports.save = async () => {
    if (after.reward.status === 'sent') throw Error('disk');
  };
  await assert.rejects(settleRewards(after.ports), /disk/);
  assert.equal(after.reward.status, 'sent');
  assert.equal(after.state.total, 1);
  await settleRewards(after.ports);
  assert.deepEqual(after.events, ['score']);
});

test('ambiguous submission pauses the queue; confirmed rejection remains retryable', async () => {
  for (const uncertain of [true, false]) {
    const { ports, state, reward, events } = fixture();
    state.rewards.push({ ...reward, id: 'two' });
    ports.gateway.score = async () => {
      events.push('score');
      throw Object.assign(Error('network'), { uncertain });
    };
    await assert.rejects(settleRewards(ports), /network/);
    assert.equal(reward.status, uncertain ? 'uncertain' : 'queued');
    assert.equal(state.total, 0);
    assert.equal(state.rewards[1].status, 'queued');
    if (uncertain) {
      await settleRewards(ports);
      assert.equal(events.filter((e) => e === 'score').length, 1);
    }
  }
});

test('invalid dedicated habit and disposed workflow never send a score', async () => {
  const invalid = fixture();
  invalid.ports.gateway.readTask = async () => ({ priority: 1, type: 'habit', up: true });
  await assert.rejects(settleRewards(invalid.ports), /专用习惯/);
  assert.deepEqual(invalid.events, []);
  const disposed = fixture();
  disposed.ports.shouldStop = () => true;
  await settleRewards(disposed.ports);
  assert.deepEqual(disposed.events, []);
});

test('reconciliation uses historical evidence across midnight and confirms only once', async () => {
  const { ports, state, reward } = fixture();
  Object.assign(reward, {
    status: 'uncertain',
    attempted: now - 86400000,
    before: 100,
    historyBefore: 3,
  });
  await reconcileRewards(ports);
  await reconcileRewards(ports);
  assert.equal(reward.status, 'sent');
  assert.equal(state.total, 1);
});

test('absent historical receipts never imply success or authorize automatic retry', async () => {
  const { ports, state, reward } = fixture();
  Object.assign(reward, { status: 'sending', attempted: now - 120000 });
  let confirmations = 0;
  ports.confirmRetry = () => {
    confirmations++;
    return true;
  };
  await reconcileRewards(ports);
  assert.equal(reward.status, 'uncertain');
  assert.equal(state.total, 0);
  assert.equal(confirmations, 0);
  ports.requestRetry = true;
  await reconcileRewards(ports);
  assert.equal(reward.status, 'queued');
  assert.equal(confirmations, 1);
});

test('manual retry respects cooldown and a declined confirmation', async () => {
  const { ports, reward } = fixture();
  Object.assign(reward, {
    status: 'uncertain',
    attempted: now - 1000,
    before: 3,
    historyBefore: 4,
  });
  let confirmations = 0;
  ports.requestRetry = true;
  ports.confirmRetry = () => {
    confirmations++;
    return false;
  };
  await reconcileRewards(ports);
  assert.equal(confirmations, 0);
  assert.equal(reward.status, 'uncertain');
  reward.attempted = now - 60000;
  await reconcileRewards(ports);
  assert.equal(confirmations, 1);
  assert.equal(reward.status, 'uncertain');
});

test('Habitica reward adapter requests a fresh balance independently of display cache', async () => {
  let options;
  const gateway = new HabiticaRewardGateway({
    task: async (alias) => ({ type: alias }),
    user: async (value) => {
      options = value;
      return { stats: { gp: 7 } };
    },
    score: async () => ({ gp: 8 }),
  });
  assert.equal((await gateway.readPlayer()).stats!.gp, 7);
  assert.deepEqual(options, { fresh: true });
  assert.equal((await gateway.readTask('habit')).type, 'habit');
});
