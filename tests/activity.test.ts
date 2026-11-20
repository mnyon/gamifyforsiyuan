import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ActivityProgress,
  characterCount,
  textEdit,
  parseBlockUpdated,
  editingApproach,
} from '../src/features/progress/domain/ActivityProgress.ts';
import { newProgress } from '../src/features/progress/domain/TodoProgress.ts';

const now = new Date(2026, 10, 19, 12).getTime();
const id = '20261101000000-aaaaaaa';
const old = now - 100 * 86400000;
const record = (engine: ActivityProgress, inserted: number, deleted = 0, at = now) =>
  engine.record({ id, inserted, deleted, previousUpdated: old }, at);

test('visual approach advances within each reward segment and holds until delivery', () => {
  const state = newProgress(),
    engine = new ActivityProgress(state);
  assert.equal(editingApproach(state, now), 0);
  record(engine, 30);
  assert.equal(editingApproach(state, now), 0.5);
  record(engine, 30);
  assert.equal(editingApproach(state, now), 1);
  for (const reward of state.rewards) reward.status = 'sent';
  assert.equal(editingApproach(state, now), 0);
  record(engine, 50);
  assert.equal(editingApproach(state, now), 0.5);
  const restored = JSON.parse(JSON.stringify(state)),
    snapshot = JSON.stringify(restored);
  assert.equal(editingApproach(restored, now), 0.5);
  assert.equal(editingApproach(restored, now + 86400000), 0);
  assert.equal(JSON.stringify(restored), snapshot);
});

test('editing rewards start early and continue beyond the daily baseline without a cap', () => {
  const state = newProgress(),
    engine = new ActivityProgress(state);
  record(engine, 59);
  assert.equal(state.rewards.filter((r) => r.kind === 'editing').length, 0);
  record(engine, 1);
  assert.equal(state.rewards.filter((r) => r.kind === 'editing').length, 1);
  record(engine, 340);
  assert.equal(state.rewards.filter((r) => r.kind === 'editing').length, 4);
  record(engine, 1200);
  assert.equal(state.rewards.filter((r) => r.kind === 'editing').length, 14);
  assert.equal(state.activity!.days['2026-11-19'].editingTarget, 400);
});
test('insertions and deletions have equal weight; a restored day cannot reward old progress again', () => {
  const state = newProgress(),
    engine = new ActivityProgress(state);
  record(engine, 30, 30);
  assert.equal(state.activity!.days['2026-11-19'].editingRewards, 1);
  const restored = new ActivityProgress(JSON.parse(JSON.stringify(state)));
  record(restored, 1);
  assert.equal(restored.state.activity!.days['2026-11-19'].editingRewards, 1);
});
test('small maintenance grows to one frozen block weight and one daily maintenance reward', () => {
  const state = newProgress(),
    engine = new ActivityProgress(state);
  const first = record(engine, 1);
  assert.ok(first.maintenance > 0);
  const next = record(engine, 19);
  assert.ok(next.maintenance > first.maintenance);
  const full = state.activity!.days['2026-11-19'].maintenance;
  const restored = new ActivityProgress(JSON.parse(JSON.stringify(state)));
  record(restored, 100);
  assert.equal(restored.state.activity!.days['2026-11-19'].maintenance, full);
  assert.equal(restored.state.rewards.filter((r) => r.kind === 'maintenance').length, 1);
});
test('recent, new and unknown blocks still earn editing credit but have no old-block contribution', () => {
  const state = newProgress(),
    engine = new ActivityProgress(state);
  for (const [i, timestamp] of [null, now, now - 6 * 86400000].entries()) {
    engine.record(
      { id: `2026110100000${i}-aaaaaaa`, inserted: 20, previousUpdated: timestamp },
      now,
    );
  }
  assert.equal(state.activity!.days['2026-11-19'].maintenance, 0);
  assert.equal(state.activity!.days['2026-11-19'].editingRewards, 1);
});
test('settles completed days once, includes unused days and never moves today target during work', () => {
  const state = newProgress(),
    engine = new ActivityProgress(state);
  record(engine, 800);
  assert.equal(engine.day(now)!.editingTarget, 400);
  const later = now + 3 * 86400000;
  const expected = (400 * 0.95 + 800 * 0.05) * 0.95 ** 2;
  assert.ok(Math.abs(engine.day(later)!.editingTarget - expected) < 1e-8);
  const baseline = state.activity!.editingBaseline;
  new ActivityProgress(state).day(later);
  assert.equal(state.activity!.editingBaseline, baseline);
  assert.equal(engine.day(now), null);
  assert.equal(engine.day(now + 400 * 86400000)!.editingTarget, 100);
});
test('no missed-day rewards or debt; existing TODO progress is preserved', () => {
  const state = newProgress();
  state.credits.push({ id: 'todo', day: '2026-11-19' });
  const engine = new ActivityProgress(state);
  record(engine, 10);
  const rewards = state.rewards.length;
  engine.day(now + 30 * 86400000);
  assert.equal(state.rewards.length, rewards);
  assert.equal(state.credits.length, 1);
  assert.equal(state.activity!.days['2026-12-19'].inserted, 0);
});
test('unicode, whitespace, replacements and invalid edits', () => {
  assert.equal(characterCount('你😀 a\n\u200b'), 3);
  assert.deepEqual(textEdit('你好世界', '你好朋友'), { inserted: 2, deleted: 2 });
  assert.deepEqual(textEdit('a😀b', 'ab'), { inserted: 0, deleted: 1 });
  assert.equal(parseBlockUpdated('20261101123456'), new Date(2026, 10, 1, 12, 34, 56).getTime());
  assert.equal(parseBlockUpdated('bad'), null);
  const state = newProgress(),
    engine = new ActivityProgress(state);
  for (const inserted of [-1, NaN, Infinity, 0.5]) record(engine, inserted);
  assert.equal(state.rewards.length, 0);
  assert.deepEqual(state.activity!.days, {});
});
