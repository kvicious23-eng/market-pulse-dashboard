import {readTestFile} from './test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=readTestFile('chrome-extension/background.js','utf8');
const scan=source.slice(source.indexOf('async function scanAll('),source.indexOf('\nconst SCHEDULED_SCAN_TIMES'));
const products=[{brand:'Acer',mtm:'A',productId:'1',itemId:'2',vendorItemId:'3',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3',skuId:'private'},
 {brand:'Lenovo',mtm:'B',productId:'4',itemId:'5',vendorItemId:'6',url:'https://www.coupang.com/vp/products/4?itemId=5&vendorItemId=6'}];
async function run(edge=false,recovery=null,failWitness=false,slot='2026-10-07T20:00+09:00',blocked=false,{firstStartedAt=null,elapsedMs=1000,confirmed=false,whale=false,retryDenied=false,failStop=false}={}) {
 const files=[],events=[],state=firstStartedAt?{scheduledScanBudget:{scanSlot:slot,firstStartedAt}}:{};let scanCount=0,stopWrites=0;
 if(whale)state.primaryRequest={scanSlot:slot,requestId:'c'.repeat(32),deadlineAt:new Date(Date.parse(slot)+120*60000).toISOString()};
 class Clock extends Date{constructor(...a){super(...(a.length?a:[Date.parse(slot||'2026-10-07T20:00+09:00')+elapsedMs]));}static now(){return Date.parse(slot||'2026-10-07T20:00+09:00')+elapsedMs;}}
 const context={Date:Clock,URL,Object,Set,crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},navigator:{userAgent:edge?'Edg/1':whale?'Whale/1':'Chrome/1'},isEdgeBrowser:edge,primaryStopRequestId:null,
  createCheckoutTrace:()=>({data:{version:1,events:[]}}),saveCheckoutDiagnosticArchive:async()=>'not-needed',accessDiagnosticTabs:new Map(),saveAccessDiagnosticArchive:async()=>'not-needed',saveCompletedScan:async payload=>{const filename=payload.recovery?`MarketPulse/edge-recovery-${payload.runId}.json`:'MarketPulse/latest-coupang-scan.json';const id=await context.chrome.downloads.download({url:'data:application/json,'+encodeURIComponent(JSON.stringify(payload)),filename});await context.waitForScanDownload(id,filename);},withScanTimeout:async p=>p,wait:async()=>{},getTargets:async()=>products,validateProductCatalog:()=>[],
  waitForScanDownload:async id=>{if(failWitness&&id===1)throw Error('interrupted');events.push('complete:'+id);},
  openScanTab:async()=>{events.push('open');return {id:1};},waitForComplete:async()=>{},scanCoupangTab:async()=>{const index=scanCount++;const denied=blocked&&(index===0||retryDenied&&index>=products.length);return {ok:!denied,...(denied?{reason:'access-check',accessCheckDetail:'access-denied-message'}:{}),accessDiagnostic:{observedAt:new Clock().toISOString(),responses:[{route:'product',event:'complete',status:denied&&confirmed&&(!retryDenied||index>=products.length)?403:200}],page:{marker:denied?'access denied':''}}};},collectCheckoutDiscountsForTarget:async()=>({checkoutDiscountStatus:'captured'}),localDay:()=> '2026-10-07',
  chrome:{runtime:{getManifest:()=>({version:'1.9.55'})},storage:{local:{get:async()=>({...state}),set:async v=>Object.assign(state,v)}},tabs:{query:async()=>[],remove:async()=>{}},
   downloads:{download:async o=>{if(o.filename.includes('access-stop')&&failStop&&(failStop===true||stopWrites++===0))throw Error('stop-save-failed');files.push({...o,data:JSON.parse(decodeURIComponent(o.url.split(',')[1]))});events.push('download:'+files.length);return files.length;}}}};
 vm.runInNewContext(readTestFile('chrome-extension/scan-policy.js','utf8')+';'+source.slice(source.indexOf('function isConfirmedAccessDenied('),source.indexOf('async function saveAccessDiagnosticArchive('))+';'+source.slice(source.indexOf('function scanSaveTargets('),source.indexOf('async function saveCompletedScan('))+';'+scan+';this.run=scanAll;',context);
 if(failWitness) await assert.rejects(context.run(slot,recovery),/interrupted/); else if(failStop===true)await assert.rejects(context.run(slot,recovery,whale?'c'.repeat(32):null),/stop-save-failed/); else await context.run(slot,recovery,whale?'c'.repeat(32):null);
 return {files,events,state};
}
let f=await run();assert.equal(f.files.length,2);assert.equal(f.files[0].filename,'MarketPulse/scan-start.json');
assert.ok(f.events.indexOf('complete:1')<f.events.indexOf('open'),'No price work precedes durable start witness');
assert.equal(f.files[0].data.targetCount,2);assert.equal(f.files[0].data.targets.some(p=>p.skuId),false);
assert.equal(f.files[0].data.results,undefined,'Start witness is not partial pricing');
assert.equal(f.files[1].data.runId,f.files[0].data.runId);assert.equal(f.files[1].data.complete,true);
f=await run(false,null,true);assert.equal(f.events.includes('open'),false);assert.equal(f.state.running,false);
f=await run(false,null,false,null);assert.equal(f.files.length,1,'Manual scans have no scheduled exit witness');
const recovery={runId:'b'.repeat(32),reason:'chrome-process-exit',chromeRunId:'a'.repeat(32),triggeredAt:new Date().toISOString()};
f=await run(true,recovery);assert.equal(f.files.length,1);assert.equal(f.files[0].filename,'MarketPulse/edge-recovery-'+recovery.runId+'.json');
assert.equal(f.files[0].data.results.length,2,'Edge recollects all targets');assert.equal(f.files[0].data.recovery.reason,'chrome-process-exit');
assert.equal(f.files[0].data.scanSlot,'2026-10-07T20:00+09:00');
f=await run(false,null,false,null,true);
const recovered=f.files[0].data.results[0];assert.equal(recovered.ok,true);assert.equal(recovered.reason,undefined);assert.equal(recovered.retryStatus,'recovered');assert.deepEqual(recovered.accessDiagnostics.map(x=>x.phase),['initial','retry']);assert.equal(recovered.accessDiagnostics[0].reason,'access-check');assert.equal(recovered.accessDiagnostics[1].reason,'ok');
const settings=readTestFile('scripts/set-local-schedule.ps1','utf8');assert.match(settings,/run-scheduled-scan\.ps1/);assert.match(settings,/-ExecutionTimeLimit \(New-TimeSpan -Minutes 120\)/);
console.log('Start witness ordering, no partial prices/SKUID, interrupted witness, manual isolation, full Edge recollection and unique recovery file passed.');
await assert.rejects(run(true,{runId:'b'.repeat(32),reason:'access-check',deadlineAt:'2000-01-01T00:00:00Z'}),/scan-save-recovery-budget-exhausted/);
console.log('Actual Edge collector stops before product work when the inherited recovery budget has expired.');

await assert.rejects(run(false,null,false,'2026-10-26T16:00+09:00',false,{firstStartedAt:'2026-10-26T16:00+09:00',elapsedMs:121*60000}),/scan-save-recovery-budget-exhausted/);
const late=await run(false,null,false,'2026-10-26T16:00+09:00',false,{elapsedMs:75*60000});
assert.equal(Date.parse(late.state.scheduledScanBudget.deadlineAt),Date.parse('2026-10-26T18:20+09:00'));
console.log('Ordinary Chrome restart preserves the first-start budget; delayed collection is capped before upload.');

// Run the actual collector: verified 403 stops BOTH primaries before the next
// product, checkout, competitor work or retry. Never create a publication file.
for(const whale of [false,true]) {
 const slot=whale?'2026-10-30T20:00+09:00':'2026-10-30T16:00+09:00';
 const stopped=await run(false,null,false,slot,true,{confirmed:true,whale});
 assert.equal(stopped.events.filter(x=>x==='open').length,1);
 assert.equal(stopped.files.length,2); // start witness + separate terminal proof
 const proof=stopped.files[1].data;
 assert.equal(proof.complete,false);assert.equal(proof.terminal,true);
 assert.equal(proof.targets.length,2);assert.equal(proof.attemptedCount,1);
 assert.equal(proof.results,undefined);assert.equal(proof.targets.some(x=>x.skuId),false);
 assert.match(stopped.files[1].filename,/access-stop-[a-f0-9]{32}\.json$/);
 assert.equal(stopped.state.lastScanSave,undefined);assert.equal(stopped.state.lastResult,undefined);
 assert.equal(stopped.state.running,false);assert.equal(stopped.state.lastRunSlot,slot);
 if(whale){assert.equal(stopped.state.primaryRequest.handoff,true);assert.equal(stopped.state.primaryRequest.accessStopRunId,proof.runId);}
 const failed=await run(false,null,false,slot,true,{confirmed:true,whale,failStop:true});
 assert.equal(failed.events.filter(x=>x==='open').length,1);assert.equal(failed.state.running,false);
 assert.equal(failed.state.lastAccessStop.terminal,true);assert.equal(failed.state.lastResult,undefined);
}
const edgeDenied=await run(true,recovery,false,'2026-10-30T16:00+09:00',true,{confirmed:true});
assert.equal(edgeDenied.files[0].data.complete,true,'Edge retains bounded full-result error publication; no recursive handoff');
const manualDenied=await run(false,null,false,null,true,{confirmed:true});
assert.equal(manualDenied.files[0].data.complete,true,'Unscheduled manual scan has no automatic Windows handoff');
console.log('Confirmed 403 stops Chrome/Whale, freezes retry, retains full targets without partial prices, isolates manual/Edge and handles failed proof writes.');

const retryStop=await run(false,null,false,'2026-10-30T16:00+09:00',true,{confirmed:true,retryDenied:true});
assert.equal(retryStop.events.filter(x=>x==='open').length,3);
assert.equal(retryStop.files[1].data.attempt.phase,'retry');assert.equal(retryStop.files[1].data.complete,false);
assert.equal(retryStop.state.lastResult,undefined);

for(const whale of [false,true]) {
 const recoveredProof=await run(false,null,false,whale?'2026-10-30T20:00+09:00':'2026-10-30T16:00+09:00',true,{confirmed:true,whale,failStop:'once'});
 assert.match(recoveredProof.files[1].filename,/access-stop-[a-f0-9]{32}-saved\.json$/);
 assert.equal(recoveredProof.events.filter(x=>x==='open').length,1);
 assert.equal(recoveredProof.state.lastResult,undefined);
}
console.log('A transient stop-proof write failure uses one unique fallback without re-collecting or publishing partial prices.');
