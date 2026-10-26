import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const timer=source.slice(source.indexOf('async function withScanTimeout('),source.indexOf('async function withTabEditRetry('));
const dispatch=source.slice(source.indexOf('let activeScanPromise=null;'),source.indexOf('const SUPPLIER_EXTENSION_ID'));
const helpers=source.slice(source.indexOf('function isPrimarySender('),source.indexOf('let fallbackCatalogPending=false;'));
let resolveRoot,resolveTail,calls=0;
const slot='2026-10-22T12:00+09:00',requestId='a'.repeat(32),state={primaryRequest:{scanSlot:slot,requestId,retryCount:0}};
const ctx={Promise,Set,Date,Error,setTimeout,clearTimeout,fallbackCatalogPending:false,currentScheduledScanSlot:()=>slot,recentScanSlot:()=>true,
 scanAll:()=>{calls++;return new Promise(resolve=>resolveRoot=resolve);},chrome:{storage:{local:{get:async()=>state}},runtime:{getManifest:()=>({version:'1.9.50'})}}};
vm.runInNewContext(readTestFile('chrome-extension/scan-policy.js','utf8'),ctx);
vm.runInNewContext(timer+dispatch+helpers+';this.start=requestScan;this.timeout=withScanTimeout;this.health=primaryRecoveryState;this.pending=()=>primaryPendingOperations.size;this.queue=()=>{queuedSaveRetry={slot:currentScheduledScanSlot(),primaryRequestId:"'+requestId+'",deadlineAt:"2099-01-01T00:00:00Z"};};',ctx);
assert.equal(ctx.start(slot,null,requestId),true);
const tail=new Promise(resolve=>resolveTail=resolve);
await assert.rejects(ctx.timeout(tail,1,'late-checkout'),/scan-timeout:late-checkout/);
resolveRoot();await new Promise(resolve=>setImmediate(resolve));
assert.equal(ctx.pending(),1,'The original operation remains in flight after the wrapper times out');
let health=await ctx.health({scanSlot:slot,requestId});assert.equal(health.running,true);assert.equal(health.requestRunning,true);
assert.equal(ctx.start(slot,null,requestId),false,'No new collector while the old operation is unsettled');
ctx.queue();resolveTail();await new Promise(resolve=>setImmediate(resolve));
assert.equal(ctx.pending(),0);assert.equal(calls,2,'The queued retry starts only when the old operation truly settles');
resolveRoot();await new Promise(resolve=>setImmediate(resolve));health=await ctx.health({scanSlot:slot,requestId});assert.equal(health.running,false);
// An ordinary Chrome scan does not inherit Whale request tracking.
assert.equal(ctx.start(slot),true);assert.equal(await ctx.timeout(Promise.resolve('ok'),50,'chrome'),'ok');assert.equal(ctx.pending(),0);resolveRoot();await new Promise(resolve=>setImmediate(resolve));
console.log('Timed-out work remains busy until settled, blocks handoff/new collectors, resumes one queued retry once, and leaves ordinary Chrome isolated.');

assert.equal(ctx.start(slot),true);
let resolveOrdinary;const ordinary=new Promise(r=>resolveOrdinary=r);
await assert.rejects(ctx.timeout(ordinary,1,'ordinary-late'),/scan-timeout/);
resolveRoot();await new Promise(r=>setImmediate(r));
assert.equal(ctx.pending(),1);assert.equal((await ctx.health({scanSlot:slot,requestId})).requestRunning,false);
assert.equal(ctx.start(slot),false,'Chrome tail work must block the next collector too');
resolveOrdinary();await new Promise(r=>setImmediate(r));assert.equal(ctx.pending(),0);
console.log('Ordinary scheduled/manual and full Edge runs use the same tail-operation busy barrier without claiming a Whale request.');
