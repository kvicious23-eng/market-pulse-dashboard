import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('chrome-extension/background.js','utf8');
const scan=source.slice(source.indexOf('async function scanAll('),source.indexOf('\nconst SCHEDULED_SCAN_TIMES'));
const products=[{brand:'Acer',mtm:'A',productId:'1',itemId:'2',vendorItemId:'3',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3',skuId:'private'},
 {brand:'Lenovo',mtm:'B',productId:'4',itemId:'5',vendorItemId:'6',url:'https://www.coupang.com/vp/products/4?itemId=5&vendorItemId=6'}];
async function run(edge=false,recovery=null,failWitness=false,slot='2026-10-07T20:00+09:00') {
 const files=[],events=[],state={};
 const context={Date,URL,Object,Set,crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},navigator:{userAgent:edge?'Edg/1':'Chrome/1'},isEdgeBrowser:edge,
  withScanTimeout:async p=>p,wait:async()=>{},getTargets:async()=>products,validateProductCatalog:()=>[],
  waitForScanDownload:async id=>{if(failWitness&&id===1)throw Error('interrupted');events.push('complete:'+id);},
  openScanTab:async()=>{events.push('open');return {id:1};},waitForComplete:async()=>{},scanCoupangTab:async()=>({ok:true}),collectCheckoutDiscountsForTarget:async()=>({checkoutDiscountStatus:'captured'}),localDay:()=> '2026-10-07',
  chrome:{runtime:{getManifest:()=>({version:'1.9.35'})},storage:{local:{get:async()=>({}),set:async v=>Object.assign(state,v)}},tabs:{query:async()=>[],remove:async()=>{}},
   downloads:{download:async o=>{files.push({...o,data:JSON.parse(decodeURIComponent(o.url.split(',')[1]))});events.push('download:'+files.length);return files.length;}}}};
 vm.runInNewContext(scan+';this.run=scanAll;',context);
 if(failWitness) await assert.rejects(context.run(slot,recovery),/interrupted/); else await context.run(slot,recovery);
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
const settings=fs.readFileSync('scripts/set-local-schedule.ps1','utf8');assert.match(settings,/run-scheduled-scan\.ps1/);assert.match(settings,/-ExecutionTimeLimit \(New-TimeSpan -Minutes 120\)/);
console.log('Start witness ordering, no partial prices/SKUID, interrupted witness, manual isolation, full Edge recollection and unique recovery file passed.');
