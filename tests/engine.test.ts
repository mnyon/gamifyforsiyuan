import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TodoProgress,
  newProgress,
  targetFor,
  taskDone,
  progressPreview,
} from '../src/features/progress/domain/TodoProgress.ts';

const row = (id: string, done: boolean) => ({ id, markdown: `* [${done ? 'X' : ' '}] task` });
const start = new Date(2026, 10, 18, 12).getTime();

test('13 completions show a full 12-item round and preserve the surplus', () => {
  const engine = new TodoProgress();
  engine.state.target = 12;
  const rows = Array.from({ length: 1200 }, (_, i) => row(String(i), false));
  engine.observe(rows, start);
  for (let i = 0; i < 13; i++) {
    engine.localChange(String(i), true, start + 1);
    rows[i] = row(String(i), true);
  }
  assert.deepEqual(progressPreview(engine.state), { progress: 12, target: 12, overflow: 1 });
  engine.observe(rows, start + 2);
  engine.observe(rows, start + 60001);
  assert.equal(engine.state.rewards.length, 1);
  assert.equal(engine.state.rewards[0].count, 12);
  assert.equal(engine.state.credits.length, 1);
  assert.equal(engine.state.target, 12);
  assert.deepEqual(progressPreview(engine.state), { progress: 1, target: 12, overflow: 0 });
});

test('test confirmation can run quickly without changing the production default', () => {
  const engine = new TodoProgress(newProgress(), () => 'test', 3000);
  engine.state.target = 3;
  engine.observe([row('a', false)], start);
  engine.localChange('a', true, start + 1);
  engine.observe([row('a', true)], start + 3000);
  assert.equal(engine.state.credits.length, 0);
  engine.observe([row('a', true)], start + 3001);
  assert.equal(engine.state.credits.length, 1);
  assert.equal(new TodoProgress().confirmationMs, 60000);
});
test('editor completion adds pending immediately and unchecking withdraws it', () => {
  const engine = new TodoProgress();
  engine.state.target = 12;
  assert.equal(engine.localChange('a', true, start), true);
  assert.equal(Object.keys(engine.state.pending).length, 1);
  assert.equal(engine.localChange('a', true, start + 1), false);
  engine.localChange('a', false, start + 2);
  assert.equal(Object.keys(engine.state.pending).length, 0);
  assert.equal(engine.state.rewards.length, 0);
});
test('editor completion confirms after 60 seconds without another click', () => {
  const engine = new TodoProgress();
  engine.state.target = 12;
  engine.observe([row('a', false)], start);
  engine.localChange('a', true, start + 1);
  engine.observe([row('a', true)], start + 2);
  assert.equal(engine.state.credits.length, 0);
  engine.observe([row('a', true)], start + 60001);
  assert.equal(engine.state.credits.length, 1);
  assert.equal(Object.keys(engine.state.pending).length, 0);
});
test('one percent rounds up with a floor of one', () => {
  for (const [count, target] of [
    [0, 1],
    [50, 1],
    [200, 2],
    [801, 9],
    [10000, 100],
  ])
    assert.equal(targetFor(count), target);
});
test('parses task markdown without mistaking nested checkboxes', () => {
  assert.equal(taskDone('* [X] done\n  * [ ] child'), true);
  assert.equal(taskDone('1. [ ] task'), false);
  assert.equal(taskDone('paragraph [X]'), null);
});
test('historical completions are never rewarded and new checks wait 60 seconds', () => {
  const engine = new TodoProgress(newProgress(), () => 'reward');
  engine.observe([row('a', true), row('b', false)], start);
  assert.equal(engine.state.credits.length, 0);
  engine.observe([row('a', true), row('b', true)], start + 1);
  engine.observe([row('a', true), row('b', true)], start + 60000);
  assert.equal(engine.state.rewards.length, 0);
  engine.observe([row('a', true), row('b', true)], start + 60001);
  assert.equal(engine.state.rewards.length, 1);
});
test('unchecking during confirmation cancels contribution', () => {
  const engine = new TodoProgress();
  engine.observe([row('a', false)], start);
  engine.observe([row('a', true)], start + 1);
  engine.observe([row('a', false)], start + 50000);
  engine.observe([row('a', false)], start + 70000);
  assert.equal(engine.state.rewards.length, 0);
  assert.deepEqual(engine.state.pending, {});
});
test('current target stays fixed across days and survives restart', () => {
  const state = newProgress();
  state.target = 8;
  state.credits = [{ id: 'a', day: '2026-11-17' }];
  const engine = new TodoProgress(JSON.parse(JSON.stringify(state)));
  engine.observe([row('a', true)], start);
  assert.equal(engine.state.target, 8);
  assert.equal(engine.state.credits.length, 1);
});
test('a rewarded block contributes at most once per local day but can return next day', () => {
  const engine = new TodoProgress(newProgress(), () => String(Math.random()));
  engine.observe([row('a', false)], start);
  engine.observe([row('a', true)], start + 1);
  engine.observe([row('a', true)], start + 60001);
  engine.observe([row('a', false)], start + 70000);
  engine.observe([row('a', true)], start + 80000);
  engine.observe([row('a', true)], start + 150000);
  assert.equal(engine.state.rewards.length, 1);
  const tomorrow = start + 86400000;
  engine.observe([row('a', false)], tomorrow);
  engine.observe([row('a', true)], tomorrow + 1);
  engine.observe([row('a', true)], tomorrow + 60001);
  assert.equal(engine.state.rewards.length, 2);
});
test('unchecking removes only unspent progress, never queued rewards', () => {
  const engine = new TodoProgress();
  engine.state.target = 2;
  engine.observe([row('a', false)], start);
  engine.observe([row('a', true)], start + 1);
  engine.observe([row('a', true)], start + 60001);
  assert.equal(engine.state.credits.length, 1);
  engine.observe([row('a', false)], start + 70000);
  assert.equal(engine.state.credits.length, 0);
});
test('newly discovered completed blocks do not count as transitions', () => {
  const engine = new TodoProgress();
  engine.observe([], start);
  engine.observe([row('a', true)], start + 1);
  engine.observe([row('a', true)], start + 70000);
  assert.equal(engine.state.rewards.length, 0);
});
test('cancelled unspent contributions can be restored but never duplicated', () => {
  const engine = new TodoProgress();
  engine.state.target = 8;
  engine.observe([row('a', false)], start);
  engine.observe([row('a', true)], start + 1);
  engine.observe([row('a', true)], start + 60001);
  assert.equal(engine.state.credits.length, 1);
  engine.observe([row('a', false)], start + 70000);
  assert.equal(engine.state.credits.length, 0);
  engine.observe([row('a', true)], start + 80000);
  engine.observe([row('a', true)], start + 140000);
  assert.equal(engine.state.credits.length, 1);
  engine.observe([row('a', true)], start + 200000);
  assert.equal(engine.state.credits.length, 1);
});
test('next round uses a fixed daily snapshot even when backlog shrinks', () => {
  const engine = new TodoProgress(newProgress(), () => 'reward');
  const rows = Array.from({ length: 101 }, (_, i) => row(String(i), false));
  engine.observe(rows, start);
  assert.equal(engine.state.target, 2);
  rows[0] = row('0', true);
  rows[1] = row('1', true);
  engine.observe(rows, start + 1);
  engine.observe(rows, start + 60001);
  assert.equal(engine.state.rewards.length, 1);
  assert.equal(engine.state.target, 2);
});
test('pending confirmations survive restart and cancel if unchecked while closed', () => {
  const engine = new TodoProgress();
  engine.observe([row('a', false)], start);
  engine.observe([row('a', true)], start + 1);
  const restored = new TodoProgress(JSON.parse(JSON.stringify(engine.state)));
  restored.observe([row('a', false)], start + 70000);
  assert.equal(restored.state.rewards.length, 0);
  assert.deepEqual(restored.state.pending, {});
});
