import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/primary-supervisor.js','utf8');
const ctx={Date};vm.runInNewContext(readTestFile('chrome-extension/scan-policy.js','utf8')+';'+source,ctx);
const base=Date.parse('2026-10-22T12:00:00+09:00');
const request={version:1,browser:'whale',scanSlot:'2026-10-22T12:00+09:00',requestId:'a'.repeat(32),requestedAt:new Date(base).toISOString(),targets:[{mtm:'A'}],launchAttempts:1};
async function scenario(states,{verify=false,now=base+60000,step=15000,stopOk=true}={}) {
 let index=0;const calls=[],events=[];
 await ctx.runPrimarySupervisor({now:()=>now,wait:async()=>{now+=step;},emit:async e=>events.push(e),send:async m=>{
  calls.push(m);
  if(m.type==='GET_PRIMARY_STATE')return {workerVersion:'1.9.49',...states[Math.min(index++,states.length-1)]};
  if(m.type==='PREPARE_PRIMARY_HANDOFF')return {ok:true,handoff:true,running:false,retryCount:1};
  if(m.type==='STOP_PRIMARY_SCAN')return {ok:stopOk};
  return {ok:true,version:'1.9.49'};
 }},request,{verify});return {calls,events};
}
const active={ok:true,running:true,requestRunning:true,requestExists:true,progress:{updatedAt:new Date(base+60000).toISOString()}};
const idle={ok:true,running:false,requestExists:true,retryCount:0};
let r=await scenario([active,{ok:true,completed:true}]);assert.equal(r.events.at(-1).status,'complete');assert.equal(r.calls.filter(x=>x.type==='RUN_PRIMARY_SCAN').length,1);
r=await scenario([idle,{...idle,retryCount:1}]);assert.equal(r.events.at(-1).status,'edge-ready');assert.deepEqual(r.calls.filter(x=>x.type==='RUN_PRIMARY_SCAN').map(x=>x.retry),[false,true]);
r=await scenario([active,idle,{ok:true,completed:true}],{now:base+7*60000});assert.ok(r.calls.some(x=>x.type==='STOP_PRIMARY_SCAN'));assert.equal(r.events.at(-1).status,'complete');
r=await scenario([active],{now:base+7*60000,step:60000});assert.equal(r.events.at(-1).status,'stalled-unconfirmed');assert.equal(r.calls.filter(x=>x.type==='RUN_PRIMARY_SCAN').length,1);assert.ok(!r.calls.some(x=>x.type==='PREPARE_PRIMARY_HANDOFF'));
r=await scenario([{ok:false,reason:'unknown'}]);assert.equal(r.events.at(-1).status,'state-unavailable');assert.ok(!r.calls.some(x=>x.type==='PREPARE_PRIMARY_HANDOFF'));
r=await scenario([],{verify:true});assert.deepEqual(r.calls.map(x=>x.type),['CHECK_PRIMARY_TRANSPORT']);assert.equal(r.events[0].status,'transport-verified');
r=await scenario([],{now:base+121*60000});assert.equal(r.calls.length,0);assert.equal(r.events[0].status,'deadline-exhausted');
r=await scenario([{ok:true,running:true,requestRunning:false}],{step:30*60000});assert.ok(!r.calls.some(x=>x.type==='STOP_PRIMARY_SCAN'||x.type==='PREPARE_PRIMARY_HANDOFF'));assert.equal(r.events.at(-1).status,'deadline-exhausted');
console.log('Primary supervision: completion, one retry, cooperative stop, explicit inactive handoff, unconfirmed stop isolation, read failure, verify-only and deadline/unrelated-scan guards passed.');
// The actual Edge transport page has the same pinned local-file boundary.
const fallback=readTestFile('chrome-extension/fallback.js','utf8');
async function edgePage({verify=true,mismatch=false}={}) {
 const calls=[],receipts=[];const runId='b'.repeat(32);
 const request={version:1,browser:'edge',scanSlot:requestSlot(),runId:mismatch?'c'.repeat(32):runId,products:[{mtm:'A'}],recovery:{runId}};
 function requestSlot(){return '2026-10-22T12:00+09:00';}
 await vm.runInNewContext(fallback,{URL,Date,Error,JSON,encodeURIComponent,setTimeout,clearTimeout,location:{href:`chrome-extension://test/fallback.html?slot=${encodeURIComponent(requestSlot())}&runId=${runId}${verify?'&verify=1':''}`},document:{getElementById:()=>({textContent:''})},fetch:async()=>({ok:true,json:async()=>request}),chrome:{runtime:{getURL:p=>'chrome-extension://test/'+p,sendMessage:async m=>{calls.push(m);return {ok:true,version:'1.9.49'};}},downloads:{download:async o=>{receipts.push(JSON.parse(decodeURIComponent(o.url.split(',')[1])));return 1;},search:async()=>[{state:'complete',filename:'C:/Downloads/MarketPulse/edge-fallback-transport-check.json'}]},tabs:{getCurrent:async()=>({id:1}),remove:async()=>{}}}});
 return {calls,receipts};
}
let edge=await edgePage();assert.deepEqual(edge.calls.map(x=>x.type),['CHECK_FALLBACK_TRANSPORT']);assert.equal(edge.receipts[0].status,'transport-verified');
edge=await edgePage({verify:false});assert.deepEqual(edge.calls.map(x=>x.type),['RUN_FALLBACK']);
edge=await edgePage({mismatch:true});assert.equal(edge.calls.length,0);
console.log('Edge short-file transport, verify-only isolation and mismatched-run rejection passed.');
