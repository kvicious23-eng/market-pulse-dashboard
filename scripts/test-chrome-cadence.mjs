import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const c={};vm.runInNewContext(readTestFile('chrome-extension/scan-policy.js','utf8')+';this.policy=chromeCadencePolicy;',c);
for(const [day,arm] of [['02',null],['03','B'],['04','B'],['05','B'],['06','B'],['07','B'],['08','B'],['09','B'],['10',null]]) {
 for(const hour of day<'06'?['08','16']:day==='06'?['08','15']:['07','15']) {
  const slot=`2026-11-${day}T${hour}:00+09:00`;
  const p=c.policy(slot,'chrome');assert.equal(p.arm,arm);assert.equal(p.experimentId,arm?'chrome-cadence-week-20261103':null);assert.equal(p.delayMs,arm==='B'?40000:20000);
  for(const args of [[slot,'whale'],[slot,'edge'],[slot,'chrome',{}],[slot,'chrome',null,null,[]]])assert.equal(c.policy(...args).experimentId,null);
 }
}
for(const slot of [null,'2026-11-04T12:00+09:00','2026-11-04T20:00+09:00','2026-11-04T08:00Z','2026-11-04T08:00+00:00','2026-11-04T08:01+09:00','2026-11-31T08:00+09:00'])assert.equal(c.policy(slot,'chrome').delayMs,20000);
console.log('Fixed KST seven-day boundaries, manual/recovery/transient/browser exclusion passed.');

// Exercise the actual common-primary admission and its dispatch into cadence selection.
const source=readTestFile('chrome-extension/background.js','utf8'),slot='2026-11-04T16:00+09:00',now=Date.parse(slot)+5000,state={products:[{skuId:'001',mtm:'SAVED'}]},received=[];
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
let handler;const ctx={Date:Clock,navigator:{userAgent:'Chrome/157'},isEdgeBrowser:false,WORKER_INSTANCE_ID:'d'.repeat(32),activeScanPromise:null,primaryPendingOperations:new Set(),activeScanSlot:null,activeScanRequestId:null,currentScheduledScanSlot:()=>slot,recentScanSlot:()=>true,validateProductCatalog:()=>[],requestScan:(s,r,id,targets)=>{received.push({targets,policy:ctx.chromeCadencePolicy(s,'chrome',r,id,targets)});return true;},chrome:{runtime:{getURL:p=>'extension://'+p,getManifest:()=>({version:'1.9.71'}),onMessage:{addListener:f=>handler=f}},storage:{local:{get:async()=>({...state}),set:async v=>Object.assign(state,v)}}}};
vm.runInNewContext(readTestFile('chrome-extension/scan-policy.js','utf8')+source.slice(source.indexOf('function isPrimarySender(')),ctx);
const targets=[{brand:'Test',mtm:'WORK',productId:'1',itemId:'2',vendorItemId:'3'}],message={type:'RUN_PRIMARY_SCAN',products:targets,scanSlot:slot,requestId:'a'.repeat(32),requestedAt:new Date(Date.parse(slot)+1000).toISOString(),primaryProtocolId:ctx.windowsPrimaryProtocol(slot),policyId:ctx.scanPolicyForSlot(slot).id};
const response=await new Promise(resolve=>handler(message,{url:'extension://common-primary.html'},resolve));assert.equal(response.ok,true);assert.equal(received.length,1);assert.equal(received[0].targets,null,'Pinned common targets must not be marked as manual transient work');assert.equal(received[0].policy.delayMs,40000);assert.equal(state.primaryRequest.targets[0].mtm,'WORK');assert.equal(state.products[0].skuId,'001');assert.equal(state.products[0].mtm,'SAVED');console.log('Actual common-primary handler preserves management catalogue, selects pinned request targets and applies the Chrome 40-second arm.');
