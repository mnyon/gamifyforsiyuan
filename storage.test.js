import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressStorage, ConnectionStorage } from './storage.js';

test('writes JSON using Blob and checks the kernel result, without SDK File construction', async () => {
  let captured;
  const storage = new ProgressStorage('gamify-for-siyuan', async (url, options) => {
    captured = { url, options }; return { ok: true, json: async () => ({ code: 0 }) };
  });
  await storage.write({ version: 1, target: 12 });
  assert.equal(captured.url, '/api/file/putFile');
  assert.equal(captured.options.body.get('path'), '/data/storage/petal/gamify-for-siyuan/progress.json');
  assert.deepEqual(JSON.parse(await captured.options.body.get('file').text()), { version: 1, target: 12 });
});
test('kernel error responses are never treated as successful saves', async () => {
  const storage = new ProgressStorage('gamify-for-siyuan', async () => ({ ok: true, json: async () => ({ code: -1, msg: 'disk full' }) }));
  await assert.rejects(storage.write({ version: 1 }), /disk full/);
});
test('missing file initializes, but failed/corrupt reads preserve existing state', async () => {
  const missing = new ProgressStorage('gamify-for-siyuan', async () => ({ status: 202 }));
  assert.equal(await missing.read(), null);
  const failed = new ProgressStorage('gamify-for-siyuan', async () => ({ status: 403, ok: false }));
  await assert.rejects(failed.read(), /未初始化新进度/);
  const corrupt = new ProgressStorage('gamify-for-siyuan', async () => ({ status: 200, ok: true, json: async () => ({ code: -1, msg: 'read failed' }) }));
  await assert.rejects(corrupt.read(), /read failed/);
});
test('saved progress is restored from the same file path', async () => {
  const state = { version: 1, target: 12, credits: [{ id: 'one' }] };
  const storage = new ProgressStorage('gamify-for-siyuan', async (_url, options) => {
    assert.equal(JSON.parse(options.body).path, '/data/storage/petal/gamify-for-siyuan/progress.json');
    return { status: 200, ok: true, json: async () => state };
  });
  assert.deepEqual(await storage.read(), state);
});

test('shared connection round trips separately from reward progress and clears the token on opt-out', async()=>{
  let saved=null;
  const store=new ConnectionStorage('gamify-for-siyuan',async(url,options)=>{
    if(url.endsWith('putFile')) {
      assert.equal(options.body.get('path'),'/data/storage/petal/gamify-for-siyuan/connection.json');
      saved=JSON.parse(await options.body.get('file').text());return {ok:true,json:async()=>({code:0})};
    }
    assert.equal(JSON.parse(options.body).path,'/data/storage/petal/gamify-for-siyuan/connection.json');
    return saved?{ok:true,status:200,json:async()=>saved}:{status:202};
  });
  assert.equal(await store.read(),null);
  const value={userId:'11111111-1111-4111-8111-111111111111',token:'22222222-2222-4222-8222-222222222222'};
  await store.save(value);assert.deepEqual(await store.read(),{...value,syncCredentials:true});
  await store.clear();assert.deepEqual(saved,{version:1,enabled:false});assert.equal(await store.read(),null);
});

test('corrupt shared connection and failed opt-out are reported',async()=>{
  const store=new ConnectionStorage('gamify-for-siyuan',async()=>({ok:true,status:200,json:async()=>({version:1,enabled:true,userId:'bad',token:'bad'})}));
  await assert.rejects(store.read(),/同步连接信息格式不正确/);
  store.fetcher=async()=>({ok:true,json:async()=>({code:-1,msg:'disk full'})});
  await assert.rejects(store.clear(),/disk full/);
});
