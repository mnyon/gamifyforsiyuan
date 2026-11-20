import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskRows, updatedRows } from '../src/adapters/siyuan/queryRows.js';

test('TODO and editor metadata validate external rows before observation', () => {
  assert.deepEqual(taskRows([{ id: 'one', markdown: '* [X] task', extension: 'unused' }]), [
    { id: 'one', markdown: '* [X] task' },
  ]);
  assert.deepEqual(
    updatedRows([
      { id: 'one', updated: null },
      { id: 'two', updated: '20261120000000' },
    ]),
    [
      { id: 'one', updated: null },
      { id: 'two', updated: '20261120000000' },
    ],
  );
  for (const value of [
    null,
    {},
    [null],
    [{ id: 12, markdown: '* [ ]' }],
    [{ id: 'one', markdown: {} }],
  ])
    assert.throws(() => taskRows(value));
  for (const value of [[{ id: 'one', updated: {} }], [{ id: 'one' }], [{ updated: 123 }]])
    assert.throws(() => updatedRows(value));
});
