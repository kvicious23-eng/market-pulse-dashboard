import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const fixed=Date.parse('2026-10-21T12:01:00+09:00');
class Clock extends Date {constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}}
const created=[],cleared=[],state={},starts=[];
const slot='2026-10-21T12:00+09:00',requestId='a'.repeat(32);
let handler;
const ctx={Date:Clock,Intl,navigator:{userAgent:'Chrome/150 Whale/5'},isEdgeBrowser:false,activeScanPromise:null,primaryPendingOperations:new Set(),activeScanSlot:null,activeScanRequestId:null,primaryStopRequestId:null,
 validateProductCatalog:p=>p?.[0]?.invalid?['invalid']:[],requestScan:(...args)=>{starts.push(args);return true;},
 chrome:{runtime:{getManifest:()=>({version:'1.9.46'}),getURL:p=>'chrome-extension://scanner/'+p,onMessage:{addListener:f=>handler=f}},
 storage:{local:{get:async()=>({...state}),set:async v=>Object.assign(state,v)}},alarms:{clear:async n=>cleared.push(n),create:async(n,c)=>created.push(n)}}};
vm.runInNewContext(source.slice(source.indexOf('const SCHEDULED_SCAN_TIMES ='),source.indexOf('\n\nfunction enterCheckoutDiagnostic'))+';this.schedule=schedule;this.owns=chromeOwnsSlot;',ctx);
await ctx.schedule();assert.deepEqual(created,['daily-scan-0800','daily-scan-1600','daily-scan-2000']);assert.ok(cleared.includes('daily-scan-1200'));
assert.equal(ctx.owns(slot),false);assert.equal(ctx.owns('2026-10-20T12:00+09:00'),true);assert.equal(ctx.owns('2026-10-21T16:00+09:00'),true);
vm.runInNewContext(source.slice(source.indexOf('function isPrimarySender(')),ctx);
const sender={url:'chrome-extension://scanner/primary.html?slot='+slot};
async function send(overrides={},from=sender){const response=await new Promise(resolve=>handler({type:'RUN_PRIMARY_SCAN',products:[{mtm:'A'}],scanSlot:slot,requestId,...overrides},from,resolve));await new Promise(r=>setTimeout(r,0));return response;}
assert.equal((await send({}, {url:'chrome-extension://scanner/popup.html'})).ok,false);
assert.equal((await send({scanSlot:'2026-10-21T16:00+09:00'})).ok,false);
assert.equal((await send({requestId:'invalid'})).ok,false);
assert.equal((await send({products:[{invalid:true}]})).ok,false);
ctx.navigator.userAgent='Chrome/150';assert.equal((await send()).ok,false);ctx.navigator.userAgent='Whale/5';
ctx.activeScanPromise={};assert.equal((await send()).reason,'busy-unrelated');ctx.activeScanPromise=null;
assert.equal((await send({type:'CHECK_PRIMARY_TRANSPORT'})).ok,true);assert.equal(starts.length,0);
assert.equal((await send()).ok,true);await new Promise(r=>setTimeout(r,0));
assert.deepEqual(starts,[[slot,null,requestId]]);assert.equal(state.products.length,1);
assert.equal((await send()).reason,'interrupted-retry-required');await new Promise(r=>setTimeout(r,0));assert.equal(starts.length,1);
assert.equal((await send({retry:true})).reason,'retry-started');await new Promise(r=>setTimeout(r,0));assert.equal(starts.length,2);
assert.equal((await send({retry:true})).reason,'retry-exhausted');await new Promise(r=>setTimeout(r,0));assert.equal(starts.length,2);
let health=await send({type:'GET_PRIMARY_STATE'});assert.equal(health.running,false);assert.equal(health.retryCount,1);
assert.equal((await send({type:'PREPARE_PRIMARY_HANDOFF'})).handoff,true);
assert.equal((await send({retry:true})).reason,'edge-handoff-started');
state.primaryRequest.handoff=false;state.lastScanSave={scanSlot:slot,primaryRequestId:requestId,runId:'b'.repeat(32)};
assert.equal((await send()).reason,'already-complete');assert.equal(starts.length,2);
assert.equal((await send({requestId:'c'.repeat(32)})).reason,'request-id-mismatch');
assert.equal((await send({type:'CHECK_PRIMARY_TRANSPORT',products:[]})).targetCount,0);
// Production save is distinct from manual validation and preserves the request through save retries.
const files=[],saved={};let count=0;
const io={Date:Clock,Math,Number,Object,JSON,encodeURIComponent,withScanTimeout:async p=>p,waitForScanDownload:async()=>{},chrome:{storage:{local:{get:async k=>({[k]:saved[k]}),set:async v=>Object.assign(saved,v)}},downloads:{download:async o=>{files.push(o.filename);return ++count;}}}};
vm.runInNewContext('let queuedSaveRetry=null;'+source.slice(source.indexOf('function scanSaveTargets('),source.indexOf('function localDay('))+';this.save=saveCompletedScan;this.retry=()=>queuedSaveRetry;this.clearRetry=()=>{queuedSaveRetry=null;};',io);
const payload={browser:'whale',primaryRequestId:requestId,runId:'b'.repeat(32),scanSlot:slot,startedAt:'2026-10-21T12:00:01+09:00',completedAt:'2026-10-21T12:01:00+09:00',targetCount:1,results:[]};
await io.save(payload);assert.equal(files[0],`MarketPulse/whale-scan-${payload.runId}.json`);
io.waitForScanDownload=async()=>{throw Error('FILE_ACCESS_DENIED');};await assert.rejects(io.save(payload),/FILE_ACCESS_DENIED/);
assert.equal(saved.scanSaveRecovery.browser,'whale');assert.equal(saved.scanSaveRecovery.primaryRequestId,requestId);assert.equal(io.retry().primaryRequestId,requestId);
saved.scanSaveRecovery=null;saved.primaryRequest={requestId,retryCount:1,deadlineAt:'2026-10-21T14:00:00+09:00'};io.clearRetry();
await assert.rejects(io.save(payload),/FILE_ACCESS_DENIED/);assert.equal(saved.scanSaveRecovery.stage,'edge-ready');assert.equal(io.retry(),null);
assert.ok(files.some(n=>n.includes('scan-save-recovery-')));assert.ok(!files.some(n=>n.includes('latest-coupang-scan')));
console.log('Noon owner/date routing, retired Chrome noon alarm, internal transport, pinned request/catalog, duplicates/busy/invalid guards and Whale save-retry identity passed.');

// Exercise the real internal page: a local request file, bounded acknowledgements,
// no collection in verify mode, and no collection from stale/mismatched files.
const page=readTestFile('chrome-extension/primary.js','utf8');
async function pageRun({verify=false,mismatch=false,unavailable=false}={}){
 const calls=[],receipts=[];
 const request={version:1,browser:'whale',scanSlot:slot,requestId:mismatch?'c'.repeat(32):requestId,requestedAt:slot,targets:[{mtm:'A'}]};
 const browser={runtime:{getURL:p=>'chrome-extension://scanner/'+p,sendMessage:async m=>{calls.push(m);return m.type==='GET_PRIMARY_STATE'?{ok:true,completed:true}:{ok:true,version:'1.9.46'};}},
 downloads:{download:async o=>{receipts.push(JSON.parse(decodeURIComponent(o.url.split(',')[1])));return 1;},search:async()=>[{state:'complete',filename:'C:/Downloads/MarketPulse/'+(verify?'whale-primary-transport-check.json':'whale-primary-acceptance.json')}]},
 tabs:{getCurrent:async()=>({id:1}),remove:async()=>{}}};
 await vm.runInNewContext(readTestFile('chrome-extension/primary-supervisor.js','utf8')+';'+page,{URL,Date:Clock,JSON,Error,encodeURIComponent,location:{href:`chrome-extension://scanner/primary.html?slot=${encodeURIComponent(slot)}&requestId=${requestId}${verify?'&verify=1':''}`},
 fetch:async(u,o)=>{assert.equal(o.cache,'no-store');assert.equal(u,'chrome-extension://scanner/runtime/noon-request.json');return {ok:!unavailable,json:async()=>request};},chrome:browser,document:{getElementById:()=>({textContent:''})},setTimeout,clearTimeout});
 return {calls,receipts};
}
let transport=await pageRun();assert.equal(transport.calls[0].type,'RUN_PRIMARY_SCAN');assert.equal(transport.receipts[0].status,'accepted');
transport=await pageRun({verify:true});assert.equal(transport.calls[0].type,'CHECK_PRIMARY_TRANSPORT');assert.equal(transport.receipts[0].status,'transport-verified');
for(const args of [{mismatch:true},{unavailable:true}]){transport=await pageRun(args);assert.equal(transport.calls.length,0);assert.equal(transport.receipts[0].status,'rejected');}
console.log('Short-URL local-file transport, request identity, verify-only mode and saved rejection acknowledgements passed.');
