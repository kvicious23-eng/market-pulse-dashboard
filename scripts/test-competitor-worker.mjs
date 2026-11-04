import assert from 'node:assert/strict';import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/competitor-worker.js','utf8'),policy=readTestFile('chrome-extension/scan-policy.js','utf8'),models=readTestFile('chrome-extension/competitor-models.js','utf8');
const start=Date.parse('2026-11-04T08:35:00+09:00'),slot='2026-11-04T08:00+09:00';
const targets=[1,2].map(i=>({brand:'Competitor',mtm:'CP-'+i,productId:String(i),itemId:String(i+10),vendorItemId:String(i+20),url:`https://www.coupang.com/vp/products/${i}?itemId=${i+10}&vendorItemId=${i+20}`,competitorKey:`${i}-${i+10}-${i+20}`}));
async function run(browser,{blocked=false,budget=false,failed=false}={}){
 let clock=start,opens=0,clicks=0;const removed=[],files=[],writes=[],state={products:['untouched'],lastResult:{primary:true},lastRunSlot:slot};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const q={version:1,scope:'competitors',attempt:browser==='edge'?'edge':'primary',requestId:'b'.repeat(32),sourceRunId:'a'.repeat(32),initialCommit:'c'.repeat(40),sourceStartedAt:'2026-11-04T08:00:01+09:00',deadlineAt:new Date(budget?start+70000:Date.parse('2026-11-04T10:00:00+09:00')).toISOString(),scanSlot:slot,browser,targets:structuredClone(targets)};
 const c={URL,Date:Clock,WORKER_INSTANCE_ID:'d'.repeat(32),navigator:{userAgent:browser==='edge'?'Edg/150':browser==='whale'?'Whale/5':'Chrome/150'},
  activeScanPromise:null,primaryPendingOperations:new Set(),fallbackCatalogPending:false,currentScheduledScanSlot:()=>slot,
  withScanTimeout:async p=>p,waitForComplete:async()=>{},waitForScanDownload:async()=>{},wait:async ms=>{clock+=ms;},
  openScanTab:async()=>({id:++opens}),scanCoupangTab:async()=>blocked?{ok:false,reason:'access-check'}:{ok:true,price:10000},
  createCheckoutTrace:()=>({data:{}}),collectCheckoutDiscountsForTarget:async(t,w,tr,tab)=>{clicks++;assert.ok(tab.id);if(failed)throw Error('synthetic-entry-timeout');return {checkoutDiscountStatus:'captured'};},
  isConfirmedAccessDenied:r=>r.reason==='access-check',accessDiagnosticTabs:new Map(),
  chrome:{runtime:{getURL:p=>'extension://'+p,getManifest:()=>({version:'1.9.66'}),getPlatformInfo:async()=>{}},storage:{local:{get:async()=>state,set:async v=>{writes.push(v);Object.assign(state,v);}}},downloads:{download:async options=>{files.push({filename:options.filename,value:JSON.parse(decodeURIComponent(options.url.split(',')[1]))});return files.length;}},tabs:{remove:async id=>removed.push(id)}},
  fetch:async()=>({ok:true,json:async()=>q})};
 vm.runInNewContext(models+'\n'+policy+'\n'+source+'\nthis.run=runCompetitorCollection;this.load=loadCompetitorRequest;',c);
 assert.equal((await c.load(q.requestId)).requestId,q.requestId);
 await c.run(q);
 assert.deepEqual(state.products,['untouched']);assert.deepEqual(state.lastResult,{primary:true});assert.equal(state.lastRunSlot,slot);
 assert.ok(writes.every(v=>Object.keys(v).every(k=>k==='competitorPhaseState')),'No primary progress, catalogue or result writes');
 assert.ok(files.every(f=>f.filename.startsWith('MarketPulse/competitor-'+q.requestId+'-')));
 assert.equal(files.filter(f=>f.filename.endsWith('-result.json')).length,1);
 return {result:files.at(-1).value,opens,clicks,removed,c,q};
}
for(const browser of ['chrome','whale','edge']){
 let r=await run(browser);assert.equal(r.opens,2);assert.equal(r.clicks,2);assert.equal(r.result.completed,2);assert.equal(r.result.terminal,true);assert.equal(r.result.stoppedReason,null);assert.deepEqual(r.removed,[1,2]);
 r=await run(browser,{budget:true});assert.equal(r.opens,0);assert.equal(r.result.stoppedReason,'budget');assert.equal(r.result.results.length,0);
 r=await run(browser,{failed:true});assert.equal(r.opens,2);assert.equal(r.clicks,2);assert.equal(r.result.results.filter(x=>!x.ok).length,2);
 if(browser!=='edge'){r=await run(browser,{blocked:true});assert.equal(r.opens,1);assert.equal(r.clicks,0);assert.equal(r.result.stoppedReason,'access-check');}
 r=await run(browser);r.q.targets[0].vendorItemId='wrong';await assert.rejects(r.c.load(r.q.requestId),/identity/);
}
console.log('Three-browser dedicated phase, primary file/catalogue/state isolation, one checkout per target, bounded budgets, direct access-stop and request identity passed.');
