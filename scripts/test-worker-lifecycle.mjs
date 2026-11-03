import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const block=source.slice(source.indexOf("  if(message?.type==='FREEZE_INTERRUPTED_SCAN')"),source.indexOf("  if (message?.type==='GET_SCAN_STATUS')"));
const slot='2026-11-03T08:00+09:00',runId='a'.repeat(32),at=Date.parse(slot)+120000;
const w={browser:'chrome',scanSlot:slot,runId,startedAt:slot,deadlineAt:new Date(Date.parse(slot)+7200000).toISOString()};
const base={activeRunWitness:w,scanProgress:{startedAt:slot,updatedAt:new Date(at-30000).toISOString(),completed:2,total:17,stage:'completed'},scheduledScanBudget:{scanSlot:slot,deadlineAt:w.deadlineAt}};
async function probe(change={},busy=false,sender='extension://worker-probe.html') {
 const state=structuredClone({...base,...change});let response;
 const c={activeScanPromise:busy?{}:null,fallbackCatalogPending:false,primaryPendingOperations:new Set(),
  currentScheduledScanSlot:()=>slot,Date:class extends Date{static now(){return at;}},
  chrome:{runtime:{getURL:p=>'extension://'+p,getManifest:()=>({version:'1.9.59'})},storage:{local:{get:async()=>state,set:async v=>Object.assign(state,v)}}}};
 vm.runInNewContext('this.handle=(message,_sender,sendResponse)=>{'+block+'};',c);
 c.handle({type:'FREEZE_INTERRUPTED_SCAN',scanSlot:slot,runId},{url:sender},r=>response=r);
 for(let i=0;i<6;i++)await Promise.resolve();
 return {response,state};
}
let r=await probe();assert.equal(r.response.status,'interrupted');assert.equal(r.state.lastRunSlot,slot);assert.equal(r.response.primaryFrozen,true);
for(const change of [{activeRunWitness:null},{scanProgress:{...base.scanProgress,startedAt:'wrong'}},{lastResult:{runId}},{scheduledScanBudget:{}},{activeRunWitness:{...w,deadlineAt:new Date(at-1).toISOString()}}])assert.equal((await probe(change)).response.status,'unconfirmed');
assert.equal((await probe({},true)).response.status,'running');assert.equal((await probe({},false,'extension://other.html')).response.status,'rejected');
const start=source.indexOf('  const cadenceWait=async()=>{'),end=source.indexOf('\n  const note403=',start);
let idle=0,total=0,pulses=0;
const c={cadence:{delayMs:40000},cadenceMetrics:{waits:[]},Date,checkRecoveryBudget:()=>{},
 wait:async ms=>{idle+=ms;total+=ms;if(idle>=30000)throw Error('simulated-worker-expiry');},
 withScanTimeout:async p=>p,chrome:{runtime:{getPlatformInfo:async()=>{idle=0;pulses++;return {};}}}};
vm.runInNewContext(source.slice(start,end)+';this.run=cadenceWait;',c);await c.run();
assert.equal(total,40000);assert.equal(pulses,2);assert.equal(c.cadenceMetrics.waits[0].configuredMs,40000);
console.log('40-second idle-lifecycle simulation and explicit inactive-worker freeze validation passed.');
