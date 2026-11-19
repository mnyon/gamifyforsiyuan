import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { newProgress } from './engine.js';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['build.mjs', '--test-mode', '--skip-package']);
execFileSync(process.execPath, ['build.mjs', '--skip-package']);
function plugin(testBuild = true, extra = {}) {
 const memory = new Map();
 const context = { localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key,value)=>memory.set(key,value) }, module: {exports:{}}, require: () => ({ Plugin: class { constructor() { this.kernel = { rpc: {} }; } } }), console, crypto: globalThis.crypto, AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval };
 Object.assign(context,extra);
 vm.runInNewContext(fs.readFileSync(testBuild ? 'dist/test/gamify-for-siyuan/index.js' : 'dist/gamify-for-siyuan/index.js','utf8'),context);
 const p=new context.module.exports(); p.engine={state:{alias:'demo',credits:[],pending:{},rewards:[{id:'one',status:'queued'}],total:0}};
 p.persist=async()=>{}; p.render=()=>{};p.view={feedback:()=>{},rewardFeedback:()=>{}};p.user={stats:{hp:32,gp:1}};
 return p;
}

test('test mode never calls Habitica, even with a previously connected client', async()=>{
 const p=plugin();p.testMode=true;let network=0,feedback=0,scans=0;
 p.client=new Proxy({}, {get:()=>async()=>{network++;throw new Error('unexpected network')}});
 p.view.rewardFeedback=gold=>{feedback++;assert.equal(gold,1)};
 p.scan=async()=>{scans++};
 await p.flushRewards();await p.resolveRewards(true);await p.refresh();
 await assert.rejects(p.connect({}),/测试模式/);
 await p.testAction('reward');
 assert.equal(network,0);assert.equal(feedback,2);assert.equal(scans,1);
 assert.equal(p.engine.state.total,1);assert.equal(p.engine.state.rewards[0].status,'sent');
});

test('test persistence writes only isolated local storage', async()=>{
 const p=plugin();p.testMode=true;p.storeKey='isolated';delete p.persist;
 let writes=0;p.progressStorage={write:async()=>{writes++}};
 await p.persist();assert.equal(writes,0);
 assert.equal(p.readTestState().rewards[0].id,'one');
 p.testMode=false;await p.persist();assert.equal(writes,1);
});

test('production build excludes test controls and simulated action methods',()=>{
 const p=plugin(false);assert.equal(p.testAction,undefined);assert.equal(p.setTestMode,undefined);
 const code=fs.readFileSync('dist/gamify-for-siyuan/index.js','utf8');
 assert.match(code,/const TEST_BUILD = false/);assert.doesNotMatch(code,/模拟完成 TODO|预览金币特效/);
 assert.match(fs.readFileSync('dist/test/gamify-for-siyuan/index.js','utf8'),/const TEST_BUILD = true/);
});

test('test build restores only test progress without changing real progress', async()=>{
 const p=plugin();p.storeKey='build-isolation';
 const real=newProgress();real.target=12;real.credits=[{id:'real-item',day:'2026-11-18'}];
 p.testMode=true;p.engine=p.makeEngine(null);assert.equal(p.engine.state.target,3);
 let realWrites=0;p.progressStorage={write:async()=>{realWrites++}};delete p.persist;
 p.engine.localChange('test-item',true);await p.persist();
 p.engine=p.makeEngine(p.readTestState());assert.ok(p.engine.state.pending['test-item']);
 assert.equal(p.testRows[0].id,'test-item');
 p.testMode=false;p.engine=p.makeEngine(real);
 assert.equal(p.engine.state.target,12);assert.equal(p.engine.state.credits[0].id,'real-item');assert.equal(realWrites,0);
});
test('reward is durably marked sending before the score request',async()=>{
 const p=plugin(); const events=[];p.persist=async()=>events.push(p.engine.state.rewards[0].status);
 p.client={user:async()=>({stats:{gp:1}}),task:async()=>({priority:.1,type:'habit',up:true,down:false,counterUp:0}),score:async()=>{events.push('request');return {gp:2,hp:32}}};
 await p.flushRewards();assert.deepEqual(events,['sending','request','sent']);assert.equal(p.engine.state.total,1);assert.equal(p.user.stats.gp,2);
 await p.flushRewards();assert.equal(events.length,3);
});
test('ambiguous score is never automatically retried',async()=>{
 const p=plugin();let calls=0;p.client={user:async()=>({stats:{gp:1}}),task:async()=>({priority:.1,type:'habit',up:true,down:false,counterUp:0}),score:async()=>{calls++;throw Object.assign(new Error('timeout'),{uncertain:true})}};
 await p.flushRewards();p.retryAfter=0;await p.flushRewards();assert.equal(calls,1);assert.equal(p.engine.state.rewards[0].status,'uncertain');
 await p.resolveRewards();assert.equal(p.engine.state.rewards[0].status,'uncertain');assert.equal(p.engine.state.total,0);
 p.client.task=async()=>({counterUp:1});await p.resolveRewards();assert.equal(p.engine.state.total,1);assert.equal(p.engine.state.rewards[0].status,'sent');
 await p.resolveRewards();assert.equal(p.engine.state.total,1);
});
test('storage failure blocks scoring before network mutation',async()=>{
 const p=plugin();let calls=0;p.persist=async()=>{throw new Error('disk')};p.client={user:async()=>({stats:{gp:1}}),task:async()=>({priority:.1,type:'habit',up:true,down:false}),score:async()=>{calls++}};
 await p.flushRewards();assert.equal(calls,0);
});
test('reward feedback uses fresh gold balance and originating TODO id', async()=>{
 const p=plugin();let shown;
 p.engine.state.rewards[0].sources=['todo-a','todo-b'];
 p.view.rewardFeedback=(gold,context)=>{shown={gold,context}};
 p.client={user:async()=>({stats:{gp:40.25}}),task:async()=>({priority:.1,type:'habit',up:true,down:false}),score:async()=>({gp:41.75,hp:32})};
 await p.flushRewards();assert.equal(shown.gold,1.5);assert.equal(shown.context.blockId,'todo-b');assert.equal(p.engine.state.rewards[0].gold,1.5);
});
test('missing reward balance never fabricates a gold amount',async()=>{
 const p=plugin();let shown='unset';p.view.rewardFeedback=gold=>{shown=gold};
 p.client={user:async()=>({stats:{}}),task:async()=>({priority:.1,type:'habit',up:true,down:false}),score:async()=>({hp:32})};
 await p.flushRewards();assert.equal(shown,null);assert.equal(p.engine.state.total,1);
});
test('a failed visual effect cannot requeue a successful reward',async()=>{
 const p=plugin();let calls=0;p.view.rewardFeedback=()=>{throw new Error('visual effect failed')};
 p.client={user:async()=>({stats:{gp:1}}),task:async()=>({priority:.1,type:'habit',up:true,down:false}),score:async()=>{calls++;return {gp:2}}};
 await p.flushRewards();p.retryAfter=0;await p.flushRewards();
 assert.equal(calls,1);assert.equal(p.engine.state.rewards[0].status,'sent');assert.equal(p.engine.state.total,1);
});
test('SiYuan kernel property cannot shadow the plugin HTTP method', () => {
 const p=plugin();assert.equal(typeof p.kernel,'object');assert.equal(typeof p.requestSiYuan,'function');
});
test('save failures retain the kernel explanation and pause scoring', async()=>{
 const p=plugin();delete p.persist;
 p.progressStorage={write:async()=>{throw new Error('disk full')}};
 await assert.rejects(p.persist(),/disk full/);assert.equal(p.storageFailed,true);
});

test('overlapping progress writes preserve snapshot order', async()=>{
 const p=plugin();delete p.persist;p.testMode=false;
 const writes=[];let release;
 p.progressStorage={write:async state=>{writes.push(state.total);if(writes.length===1)await new Promise(resolve=>{release=resolve})}};
 p.engine.state.total=1;const first=p.persist();
 await new Promise(resolve=>setImmediate(resolve));
 p.engine.state.total=2;const second=p.persist();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(writes,[1]);release();await Promise.all([first,second]);
 assert.deepEqual(writes,[1,2]);
});

test('new activity reward kinds use the existing durable Habitica queue',async()=>{
 const p=plugin();p.engine.state.rewards=[{id:'edit',kind:'editing',status:'queued'},{id:'old',kind:'maintenance',status:'queued'}];
 let scores=0;
 p.client={user:async()=>({stats:{gp:scores}}),task:async()=>({priority:.1,type:'habit',up:true,down:false,counterUp:scores}),score:async()=>({gp:++scores})};
 await p.flushRewards();assert.equal(scores,2);assert.equal(p.engine.state.total,2);
 await p.flushRewards();assert.equal(scores,2);
});

test('workspace connection is opt-in, reuses synced credentials, and never resaves unchanged secrets',async()=>{
 let file=null,reads=0,writes=0;
 const p=plugin(false,{FormData,Blob,fetch:async(url,options)=>{
   if(url.endsWith('getFile')){reads++;return file?{ok:true,status:200,json:async()=>file}:{status:202};}
   writes++;file=JSON.parse(await options.body.get('file').text());return {ok:true,json:async()=>({code:0})};
 }});
 p.name='gamify-for-siyuan';p.storeKey='shared';p.testMode=false;p.credentials={};p.view.credentials=()=>{};
 const value={userId:'11111111-1111-4111-8111-111111111111',token:'22222222-2222-4222-8222-222222222222'};
 await p.saveConnection(value);assert.equal(reads,0);assert.equal(writes,0);
 await p.saveConnection({...value,syncCredentials:true});assert.equal(writes,1);
 p.credentials={};assert.equal(await p.restoreSharedConnection(),true);assert.equal(p.credentials.userId,value.userId);
 await p.saveConnection(p.credentials);assert.equal(writes,1);
 await p.saveConnection(value);assert.equal(writes,2);assert.deepEqual(file,{version:1,enabled:false});
 p.credentials={...value};const before=reads;await p.restoreSharedConnection();assert.equal(reads,before);
 p.testMode=true;await p.saveConnection({...value,syncCredentials:true});await p.restoreSharedConnection();assert.equal(writes,2);
});
