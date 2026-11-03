import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const routing=readTestFile('chrome-extension/scan-policy.js','utf8');
const block=source.slice(source.indexOf("  if(message?.type==='FREEZE_INTERRUPTED_SCAN')"),source.indexOf("  if (message?.type==='GET_SCAN_STATUS')"));
const slot='2026-11-03T08:00+09:00',runId='a'.repeat(32),nonce='b'.repeat(32),at=Date.parse(slot)+120000;
const w={workerInstanceId:'d'.repeat(32),browser:'chrome',targetCount:17,scanSlot:slot,runId,startedAt:slot,deadlineAt:new Date(Date.parse(slot)+7200000).toISOString(),cadence:{experimentId:'test',delayMs:40000}};
const base={activeRunWitness:w,scanProgress:{startedAt:slot,updatedAt:new Date(at-30000).toISOString(),completed:2,total:17,stage:'completed'},scheduledScanBudget:{scanSlot:slot,firstStartedAt:slot,deadlineAt:w.deadlineAt}};
async function probe(change={},busy=false,sender='extension://worker-probe.html',hold=false,messageNonce=nonce) {
 const state=structuredClone({...base,...change});let response,release;
 const gate=hold?new Promise(r=>release=r):Promise.resolve();
 const c={WORKER_INSTANCE_ID:'c'.repeat(32),activeScanPromise:busy?{}:null,fallbackCatalogPending:false,primaryPendingOperations:new Set(),activeScanSlot:slot,pendingScanSlot:null,
  currentScheduledScanSlot:()=>slot,Date:class extends Date{static now(){return at;}},
  chrome:{runtime:{getURL:p=>'extension://'+p,getManifest:()=>({version:'1.9.60'})},storage:{local:{get:async()=>state,set:async v=>{await gate;Object.assign(state,v);}}}}};
 const request=source.slice(source.indexOf('function requestScan('),source.indexOf('\nfunction finishScan('));
 vm.runInNewContext(routing+';'+request+';this.request=requestScan;this.handle=(message,_sender,sendResponse)=>{'+block+'};',c);
 c.handle({type:'FREEZE_INTERRUPTED_SCAN',scanSlot:slot,runId,nonce:messageNonce},{url:sender},r=>response=r);
 for(let i=0;i<8;i++)await Promise.resolve();
 if(hold){
  assert.equal(c.primaryPendingOperations.size,1);
  assert.equal(c.request(slot),false,'A request cannot overlap the persistent freeze');
  release();for(let i=0;i<8;i++)await Promise.resolve();
 }
 return {response,state,c};
}
let r=await probe();assert.equal(r.response.status,'interrupted');assert.equal(r.state.lastRunSlot,slot);assert.equal(r.response.primaryFrozen,true);
assert.equal(r.state.workerInterruptionHandoff.runId,runId);assert.equal(r.c.primaryPendingOperations.size,0);
await probe({},false,undefined,true);
for(const stage of ['starting','completed','download','coupang-retry']){
 r=await probe({scanProgress:{...base.scanProgress,stage,completed:stage==='starting'?0:17}});
 assert.equal(r.response.status,'interrupted',stage);
}
assert.equal((await probe({activeRunWitness:null})).response.status,'worker-restart-unconfirmed');
assert.equal((await probe({activeRunWitness:{...w,workerInstanceId:'c'.repeat(32)}})).response.status,'worker-restart-unconfirmed');
assert.equal((await probe({scanProgress:{...base.scanProgress,stage:'access-stopped'}})).response.status,'access-stop-owned');
assert.equal((await probe({scanSaveRecovery:{runId,scanSlot:slot}})).response.status,'save-recovery-owned');
for(const change of [{scanProgress:null},{scanProgress:{...base.scanProgress,startedAt:'wrong'}},
 {scanProgress:{...base.scanProgress,completed:18}},{scanProgress:{...base.scanProgress,completed:'2'}},
 {scanProgress:{...base.scanProgress,total:18}},{scanProgress:{...base.scanProgress,stage:'complete'}},
 {scanProgress:{...base.scanProgress,updatedAt:'not-time'}},{scanProgress:{...base.scanProgress,updatedAt:new Date(at+6000).toISOString()}},
 {lastResult:{runId}},{scheduledScanBudget:{}},{activeRunWitness:{...w,deadlineAt:'bad'}},
 {activeRunWitness:{...w,deadlineAt:new Date(at-1).toISOString()}},
 {activeRunWitness:{...w,deadlineAt:new Date(Date.parse(slot)+10800000).toISOString()},scheduledScanBudget:{...base.scheduledScanBudget,deadlineAt:new Date(Date.parse(slot)+10800000).toISOString()}}]){
 assert.equal((await probe(change)).response.status,'unconfirmed',JSON.stringify(change));
}
assert.equal((await probe({},true)).response.status,'running');
assert.equal((await probe({},false,'extension://other.html')).response.status,'rejected');
assert.equal((await probe({},false,undefined,false,'invalid')).response.status,'rejected');
const start=source.indexOf('  const cadenceWait=async()=>{'),end=source.indexOf('\n  const note403=',start);
async function cadence(delayMs,limit=Infinity,failPulse=false) {
 let idle=0,total=0,pulses=0;
 const c={cadence:{delayMs},cadenceMetrics:{waits:[]},recoveryDeadline:limit,Date:class extends Date{static now(){return total;}},
  checkRecoveryBudget:()=>{if(total>=limit)throw Error('budget');},
  wait:async ms=>{idle+=ms;total+=ms;if(idle>=30000)throw Error('simulated-worker-expiry');},
  withScanTimeout:async p=>p,chrome:{runtime:{getPlatformInfo:async()=>{if(failPulse)throw Error('pulse');idle=0;pulses++;return {};}}}};
 vm.runInNewContext(source.slice(start,end)+';this.run=cadenceWait;',c);
 let error;try{await c.run();}catch(e){error=e;}
 return {total,pulses,c,error};
}
r=await cadence(40000);assert.equal(r.total,40000);assert.equal(r.pulses,2);assert.equal(r.c.cadenceMetrics.waits[0].configuredMs,40000);
r=await cadence(20000);assert.equal(r.total,20000);assert.equal(r.pulses,0);
r=await cadence(40000,5000);assert.equal(r.total,5000);assert.match(String(r.error),/budget/);assert.equal(r.c.cadenceMetrics.waits.length,0);
r=await cadence(40000,Infinity,true);assert.match(String(r.error),/pulse/);assert.equal(r.total,20000);
console.log('Cadence lifecycle/deadline/pulse failure and freeze atomicity, stage/count/nonce/time/identity boundaries passed.');

async function probePage(mode) {
 const timers=new Map(),removed=[];let next=0,downloads=0;
 const c={URLSearchParams,location:{search:'?nonce='+nonce+'&runId='+runId+'&slot='+encodeURIComponent(slot)},
  setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),
  chrome:{runtime:{sendMessage:()=>mode==='timeout'?new Promise(()=>{}):Promise.resolve({status:'running'})},
   downloads:{download:async()=>{downloads++;return 1;},search:async()=>[{state:'complete',filename:mode==='path'?'C:/wrong.json':'C:/Downloads/MarketPulse/worker-probe-'+nonce+'.json'}]},
   tabs:{getCurrent:async()=>({id:7}),remove:async id=>removed.push(id)}}};
 const done=vm.runInNewContext(readTestFile('chrome-extension/worker-probe.js','utf8'),c);
 for(let i=0;i<8;i++)await Promise.resolve();
 if(mode==='timeout'){for(const fn of [...timers.values()])fn();}
 await done;
 assert.deepEqual(removed,[7]);assert.equal(timers.size,0);assert.equal(downloads,mode==='timeout'?0:1);
}
for(const mode of ['success','path','timeout'])await probePage(mode);
console.log('Probe timeout and wrong-path scenarios close their own tab and cannot fabricate interruption evidence.');
