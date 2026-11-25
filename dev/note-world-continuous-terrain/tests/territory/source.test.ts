import type {
  SourceName,
  SourceBody,
} from '../../src/features/territory/adapters/SiYuanMetadataSource.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SiYuanMetadataSource } from '../../src/features/territory/adapters/SiYuanMetadataSource.ts';
const a = '20240101000000-abcdefg',
  b = '20240101000001-abcdefg',
  book = '20240101000002-abcdefg';
test('native session status and empty notebooks make no kernel query or credential request', async () => {
  const calls: Array<[string, object]> = [],
    source = new SiYuanMetadataSource(true, async (...args) => {
      calls.push(args);
      throw Error('unexpected');
    });
  assert.deepEqual(await source.api('status'), { connected: true });
  assert.deepEqual(await source.api('pages', { after: '', limit: 128 }), []);
  assert.deepEqual(calls, []);
});
test('native notebook catalog excludes closed books and query preserves scoped cursor limits', async () => {
  const calls: Array<[string, object]> = [],
    source = new SiYuanMetadataSource(true, async (path, body) => {
      calls.push([path, body]);
      if (path.includes('lsNotebooks'))
        return {
          code: 0,
          data: {
            notebooks: [
              { id: book, name: 'Open' },
              { id: a, name: 'Closed', closed: true },
              { id: 'invalid', name: 'Bad' },
            ],
          },
        };
      return { code: 0, data: [{ id: a, box: book, title: 'A', updated: '20261120123456' }] };
    });
  assert.deepEqual(await source.api('books'), { books: [{ id: book, name: 'Open' }] });
  await source.api('pages', { after: b, limit: 999 });
  const stmt = (calls[1][1] as { stmt: string }).stmt;
  assert.match(stmt, new RegExp("box IN \\('" + book + "'\\)"));
  assert.match(stmt, new RegExp("id>'" + b + "'"));
  assert.match(stmt, /ORDER BY id LIMIT 512$/);
  assert.doesNotMatch(stmt, /Closed|Authorization/);
});
test('invalid identifiers and oversized content batches never reach SQL', async () => {
  let calls = 0;
  const source = new SiYuanMetadataSource(true, async () => {
    calls++;
    return { code: 0, data: [] };
  });
  source.setBooks([{ id: book, name: 'B' }]);
  for (const [name, body] of [
    ['pages', { after: "' OR 1=1", limit: 128 }],
    ['sizes', { ids: Array(513).fill(a) }],
    ['sizes', { ids: [] }],
    ['edges', { after: { source: a, target: 'bad' }, limit: 128 }],
  ] as Array<[SourceName, SourceBody]>)
    await assert.rejects(
      (source.api as (name: SourceName, body: SourceBody) => Promise<unknown>)(name, body),
    );
  assert.equal(calls, 0);
});
test('reference cursor is lexicographic over real source and target and numeric weights normalize', async () => {
  let stmt!: string;
  const source = new SiYuanMetadataSource(true, async (path, body) => {
    stmt = (body as { stmt: string }).stmt;
    return { code: 0, data: [{ source: a, target: b, weight: '3' }] };
  });
  source.setBooks([{ id: book, name: 'B' }]);
  assert.deepEqual(await source.api('edges', { after: { source: a, target: b }, limit: 128 }), [
    { source: a, target: b, weight: 3 },
  ]);
  assert.match(stmt, /r.root_id>.*OR \(r.root_id=.*AND t.root_id>/);
  assert.match(stmt, /GROUP BY r.root_id,t.root_id ORDER BY r.root_id,t.root_id LIMIT 128$/);
});
test('invalid external rows fail before entering world and errors do not echo response secrets', async () => {
  for (const payload of [
    [{ id: a, box: book, title: 'A', updated: {} }],
    [{ id: a, box: book, title: 4, updated: null }],
    null,
  ]) {
    const source = new SiYuanMetadataSource(false, async () => payload);
    await assert.rejects(source.api('pages', { after: '', limit: 128 }), /无效/);
  }
  const source = new SiYuanMetadataSource(false, async () => ({ error: 'private-key' }));
  await assert.rejects(
    source.api('status'),
    (error) => error instanceof Error && !error.message.includes('private-key'),
  );
});
test('standalone transport sends credentials only to connect and keeps no credential field', async () => {
  const calls: Array<[string, object]> = [],
    source = new SiYuanMetadataSource(false, async (path, body) => {
      calls.push([path, body]);
      return path.endsWith('connect') ? { books: [] } : { connected: true };
    });
  await source.api('connect', { key: 'test-credential' });
  await source.api('status');
  assert.deepEqual(calls, [
    ['/api/connect', { key: 'test-credential' }],
    ['/api/status', {}],
  ]);
  assert.doesNotMatch(JSON.stringify(source), /test-credential/);
});
test('kernel failures and corrupt statistics stop collection instead of publishing bad metadata', async () => {
  const source = new SiYuanMetadataSource(true, async () => ({ code: -1, msg: 'secret' }));
  await assert.rejects(
    source.api('books'),
    (error) => error instanceof Error && !error.message.includes('secret'),
  );
  const other = new SiYuanMetadataSource(false, async () => [{ id: a, chars: 'NaN' }]);
  await assert.rejects(other.api('sizes', { ids: [a] }), /无效/);
});
