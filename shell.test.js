import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { newProgress } from './engine.js';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['build.mjs']);
function plugin() {
 const memory = new Map();
 const context = { localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key,value)=>memory.set(key,value) }, module: {exports:{}}, require: () => ({ Plugin: class { constructor() { this.kernel = { rpc: {} }; } } }), console, crypto: globalThis.crypto, AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval };
 vm.runInNewContext(fs.readFileSync('dist/gamify-for-siyuan/index.js','utf8'),context);
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

test('mode switches reject while real API work is running',async()=>{
 const p=plugin();p.active=true;p.refreshing=true;
 await assert.rejects(p.setTestMode(true),/正在处理/);assert.notEqual(p.testMode,true);
 p.refreshing=false;p.connecting=true;
 await assert.rejects(p.setTestMode(true),/正在处理/);
});

test('switching test mode preserves and restores real progress independently', async()=>{
 const p=plugin();p.active=true;p.testMode=false;p.credentials={};p.storeKey='mode-round-trip';
 p.localTasks=new Map();p.observedClicks=new Map();p.scan=async()=>{};
 const real=newProgress();real.target=12;real.credits=[{id:'real-item',day:'2026-11-18'}];
 p.engine=p.makeEngine(structuredClone(real));
 let realWrites=0;p.progressStorage={read:async()=>structuredClone(real),write:async()=>{realWrites++}};
 delete p.persist;
 await p.setTestMode(true);assert.equal(p.engine.state.target,3);
 p.engine.localChange('test-item',true);await p.persist();
 await p.setTestMode(false);
 assert.equal(JSON.stringify(p.engine.state),JSON.stringify(real));assert.equal(realWrites,0);
 await p.setTestMode(true);assert.ok(p.engine.state.pending['test-item']);
 assert.equal(p.testRows[0].id,'test-item');
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
