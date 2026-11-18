import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['build.mjs']);
function plugin() {
 const context = { module: {exports:{}}, require: () => ({ Plugin: class {} }), console, crypto: globalThis.crypto, AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval };
 vm.runInNewContext(fs.readFileSync('dist/gamify-for-siyuan/index.js','utf8'),context);
 const p=new context.module.exports(); p.engine={state:{alias:'demo',credits:[],pending:{},rewards:[{id:'one',status:'queued'}],total:0}};
 p.persist=async()=>{}; p.render=()=>{};p.view={feedback:()=>{}};p.user={stats:{hp:32,gp:1}};
 return p;
}
test('reward is durably marked sending before the score request',async()=>{
 const p=plugin(); const events=[];p.persist=async()=>events.push(p.engine.state.rewards[0].status);
 p.client={task:async()=>({priority:.1,type:'habit',up:true,down:false,counterUp:0}),score:async()=>{events.push('request');return {gp:2,hp:32}}};
 await p.flushRewards();assert.deepEqual(events,['sending','request','sent']);assert.equal(p.engine.state.total,1);assert.equal(p.user.stats.gp,2);
 await p.flushRewards();assert.equal(events.length,3);
});
test('ambiguous score is never automatically retried',async()=>{
 const p=plugin();let calls=0;p.client={task:async()=>({priority:.1,type:'habit',up:true,down:false,counterUp:0}),score:async()=>{calls++;throw Object.assign(new Error('timeout'),{uncertain:true})}};
 await p.flushRewards();p.retryAfter=0;await p.flushRewards();assert.equal(calls,1);assert.equal(p.engine.state.rewards[0].status,'uncertain');
 await p.resolveRewards();assert.equal(p.engine.state.rewards[0].status,'uncertain');assert.equal(p.engine.state.total,0);
 p.client.task=async()=>({counterUp:1});await p.resolveRewards();assert.equal(p.engine.state.total,1);assert.equal(p.engine.state.rewards[0].status,'sent');
 await p.resolveRewards();assert.equal(p.engine.state.total,1);
});
test('storage failure blocks scoring before network mutation',async()=>{
 const p=plugin();let calls=0;p.persist=async()=>{throw new Error('disk')};p.client={task:async()=>({priority:.1,type:'habit',up:true,down:false}),score:async()=>{calls++}};
 await p.flushRewards();assert.equal(calls,0);
});
