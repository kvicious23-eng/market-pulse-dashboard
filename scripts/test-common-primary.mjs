import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8'),policy=readTestFile('chrome-extension/scan-policy.js','utf8');
const product={brand:'Example',mtm:'A',enabled:true,srp:100,productId:'1',itemId:'2',vendorItemId:'3',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'};
for(const [browser,hour,stopped=false]of [['chrome','08'],['chrome','16'],['whale','12'],['whale','20'],['chrome','08',true],['whale','12',true]]){
 const slot='2026-11-04T'+hour+':00+09:00',requestId='a'.repeat(32),fixed=Date.parse(slot)+1000;
 class Clock extends Date{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}}
 const state={},starts=[];let handler;
 const c={Date:Clock,Intl,URL,WORKER_INSTANCE_ID:'c'.repeat(32),navigator:{userAgent:browser==='whale'?'Whale/5':'Chrome/150'},isEdgeBrowser:false,
  primaryPendingOperations:new Set(),activeScanPromise:null,activeScanSlot:null,activeScanRequestId:null,primaryStopRequestId:null,
  validateProductCatalog:p=>p.some(x=>x.invalid)?['invalid']:[],currentScheduledScanSlot:()=>slot,recentScanSlot:()=>true,
  requestScan:(...args)=>{starts.push(args);return true;},
  chrome:{runtime:{getManifest:()=>({version:'1.9.63'}),getURL:p=>'extension://'+p,onMessage:{addListener:f=>handler=f}},storage:{local:{get:async()=>({...state}),set:async v=>Object.assign(state,v)}}}};
 vm.runInNewContext(policy+';'+source.slice(source.indexOf('function isPrimarySender(')),c);
 const msg={products:[product],scanSlot:slot,requestId,policyId:'whale-noon-evening-v1',primaryProtocolId:'windows-primary-v2',requestedAt:slot};
 async function send(type,extra={},page='common-primary.html'){
  const out=await new Promise(r=>handler({type,...msg,...extra},{url:'extension://'+page},r));
  await new Promise(r=>setTimeout(r,0));return out;
 }
 assert.equal((await send('CHECK_PRIMARY_TRANSPORT')).ok,true);assert.equal(starts.length,0);
 assert.equal((await send('RUN_PRIMARY_SCAN',{},'primary.html')).ok,false);
 assert.equal((await send('RUN_PRIMARY_SCAN',{primaryProtocolId:'wrong'})).ok,false);
 assert.equal((await send('RUN_PRIMARY_SCAN',{products:[{invalid:true}]})).ok,false);
 assert.equal((await send('RUN_PRIMARY_SCAN')).ok,true);assert.equal(starts.length,1);
 assert.equal(state.primaryRequest.browser,browser);assert.equal(state.primaryRequest.primaryProtocolId,'windows-primary-v2');
 assert.equal((await send('RUN_PRIMARY_SCAN')).reason,'interrupted-retry-required');
 assert.equal((await send('RUN_PRIMARY_SCAN',{products:[{...product,mtm:'Changed'}],retry:true})).reason,'request-catalog-mismatch');
 assert.equal((await send('RUN_PRIMARY_SCAN',{requestId:'f'.repeat(32)})).reason,'request-id-mismatch');
 c.activeScanPromise={};c.activeScanSlot=slot;c.activeScanRequestId=requestId;
 assert.equal((await send('GET_PRIMARY_STATE')).requestRunning,true);
 assert.equal((await send('PREPARE_PRIMARY_HANDOFF')).ok,false);c.activeScanPromise=null;
 state.activeRunWitness={runId:'d'.repeat(32),primaryRequestId:requestId,workerInstanceId:c.WORKER_INSTANCE_ID};
 assert.equal((await send('PREPARE_PRIMARY_HANDOFF')).ok,false,'Same inactive worker is not proof of restart');
 assert.equal((await send('RUN_PRIMARY_SCAN',{retry:true})).reason,'retry-exhausted');assert.equal(starts.length,1);
 state.activeRunWitness.workerInstanceId='b'.repeat(32);
 if(stopped){state.activeRunWitness.workerInstanceId=c.WORKER_INSTANCE_ID;c.primaryStopRequestId=requestId;}
 const health=await send('GET_PRIMARY_STATE');assert.equal(health.workerRestarted,!stopped);assert.equal(health.stopAcknowledged,stopped);assert.equal(health.runId,'d'.repeat(32));assert.equal(health.targetCount,1);
 const frozen=await send('PREPARE_PRIMARY_HANDOFF');assert.equal(frozen.handoff,true);assert.equal(frozen.status,'edge-ready');assert.equal(state.lastRunSlot,slot);
 assert.equal((await send('RUN_PRIMARY_SCAN',{retry:true})).reason,'edge-handoff-started');
 const plan={};vm.runInNewContext(policy+';this.get=windowsPrimaryProtocol;this.cadence=chromeCadencePolicy;',plan);
 assert.equal(plan.get('2026-11-03T12:00+09:00'),null);assert.equal(plan.get('2026-11-03T16:00+09:00'),'windows-primary-v2');assert.equal(plan.get('2026-11-03T20:00+09:00'),'windows-primary-v2');assert.equal(plan.get(slot),'windows-primary-v2');
 assert.equal(plan.cadence(slot,browser,null,requestId).delayMs,browser==='chrome'?40000:20000);
}
const page=readTestFile('chrome-extension/common-primary.js','utf8');
for(const mode of ['verify','start','probe']){
 const slot='2026-11-04T08:00+09:00',requestId='a'.repeat(32),nonce='e'.repeat(32),calls=[],files=[],closed=[];
 const q={version:1,browser:'chrome',primaryProtocolId:'windows-primary-v2',policyId:'whale-noon-evening-v1',scanSlot:slot,requestId,requestedAt:slot,targets:[product]};
 const c={URLSearchParams,navigator:{userAgent:'Chrome/150'},location:{search:'?slot='+encodeURIComponent(slot)+'&requestId='+requestId+'&nonce='+nonce+'&mode='+mode},setTimeout,clearTimeout,Date,
  fetch:async()=>({ok:true,json:async()=>q}),chrome:{runtime:{getURL:p=>'extension://'+p,getManifest:()=>({version:'1.9.63'}),sendMessage:async m=>{calls.push(m);return {ok:true,version:'1.9.63'};}},
  downloads:{download:async o=>{files.push(o);return files.length;},search:async()=>[{state:'complete',filename:'C:/Downloads/'+files.at(-1).filename}]},
  tabs:{getCurrent:async()=>({id:1}),remove:async id=>closed.push(id)}}};
 await vm.runInNewContext(policy+';'+page,c);
 assert.equal(calls.length,1,'One-shot page cannot create a periodic receipt loop');assert.equal(files.length,1);assert.deepEqual(closed,[1]);
 const receipt=JSON.parse(decodeURIComponent(files[0].url.split(',')[1]));assert.equal(receipt.version,1);assert.equal(receipt.workerVersion,'1.9.63');assert.equal(receipt.verifyOnly,mode==='verify');
 assert.equal(calls[0].type,{verify:'CHECK_PRIMARY_TRANSPORT',start:'RUN_PRIMARY_SCAN',probe:'GET_PRIMARY_STATE'}[mode]);
}
console.log('Common Chrome/Whale admission, ownership, immutable catalog, retry/freeze policy, cadence and one-shot sparse receipt page passed.');
