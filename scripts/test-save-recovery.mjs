import {readTestFile} from './test-source.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source=readTestFile('chrome-extension/background.js','utf8');
const helpers=source.slice(source.indexOf('function scanSaveTargets('),source.indexOf('function localDay('));
const fixed=Date.parse('2026-10-14T20:15:00+09:00');
class Clock extends Date {static now(){return fixed;}}
const payload={browser:'chrome',extensionVersion:'1.9.39',scanSlot:'2026-10-14T20:00+09:00',runId:'a'.repeat(32),startedAt:'2026-10-14T20:00:01+09:00',completedAt:'2026-10-14T20:14:00+09:00',targetCount:1,complete:true,results:[{brand:'Acer',mtm:'A',productId:'1',itemId:'2',vendorItemId:'3',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3',skuId:'private-sku',ok:true}]};
function fixture(failures=0,initial={},error='FILE_ACCESS_DENIED') {
 const state={...initial},files=[],events=[];
 const context={Date:Clock,Number,Math,Object,JSON,encodeURIComponent,withScanTimeout:async p=>p,
  waitForScanDownload:async id=>{if(id<=failures)throw Error('scan-download-interrupted:'+error);events.push('complete:'+id);},
  chrome:{storage:{local:{get:async key=>({[key]:state[key]}),set:async v=>Object.assign(state,v)}},downloads:{download:async o=>{
   assert.ok(state.pendingScanResult,'Complete source is persisted before every write');files.push({filename:o.filename,payload:JSON.parse(decodeURIComponent(o.url.split(',')[1]))});events.push('write:'+files.length);return files.length;
  }}}};
 vm.runInNewContext('let queuedSaveRetry=null;'+helpers+';this.save=saveCompletedScan;this.queued=()=>queuedSaveRetry;this.deadline=scanSaveDeadline;',context);
 return {context,state,files,events};
}
let f=fixture();await f.context.save(structuredClone(payload));assert.equal(f.files.length,1);assert.equal(f.state.pendingScanResult,null);
f=fixture(1);await f.context.save(structuredClone(payload));assert.equal(f.files.length,2);assert.equal(f.files[1].filename,'MarketPulse/latest-coupang-scan-'+payload.runId+'.json');assert.equal(f.state.pendingScanResult,null);assert.equal(f.context.queued(),null);assert.equal(f.state.lastScanSave.method,'unique-file');
f=fixture(2);await assert.rejects(f.context.save(structuredClone(payload)),/FILE_ACCESS_DENIED/);assert.equal(f.state.pendingScanResult.runId,payload.runId);assert.equal(f.state.pendingScanResults.length,1);assert.equal(f.state.scanSaveRecovery.chromeRetries,1);assert.equal(f.state.scanSaveRecovery.stage,'chrome-retry-queued');assert.equal(f.context.queued().slot,payload.scanSlot);assert.equal(f.files.length,3);assert.equal(JSON.stringify(f.files[2].payload).includes('private-sku'),false);
const prior=structuredClone(f.state);const retry={...structuredClone(payload),runId:'b'.repeat(32),startedAt:'2026-10-14T20:15:00+09:00'};
f=fixture(2,prior);await assert.rejects(f.context.save(retry),/FILE_ACCESS_DENIED/);assert.equal(f.state.scanSaveRecovery.stage,'edge-ready');assert.equal(f.state.scanSaveRecovery.chromeRetries,1);assert.equal(f.context.queued(),null);assert.equal(f.state.pendingScanResults.length,2);assert.equal(f.state.pendingScanResults[0].runId,payload.runId);
f=fixture(2,{scanSaveRecovery:{scanSlot:payload.scanSlot,chromeRetries:1,firstStartedAt:'2026-10-14T17:00:00+09:00'}});await assert.rejects(f.context.save(structuredClone(payload)),/FILE_ACCESS_DENIED/);assert.equal(f.state.scanSaveRecovery.stage,'deadline-exhausted');assert.equal(f.context.queued(),null);
f=fixture(1,{},'NETWORK_FAILED');await assert.rejects(f.context.save(structuredClone(payload)),/NETWORK_FAILED/);assert.equal(f.files.length,1);assert.equal(f.state.scanSaveRecovery,undefined);
f=fixture(2);await assert.rejects(f.context.save({...structuredClone(payload),browser:'edge',recovery:{runId:payload.runId}}),/FILE_ACCESS_DENIED/);assert.equal(f.context.queued(),null);assert.equal(f.state.scanSaveRecovery,undefined);
assert.equal(f.context.deadline('2026-10-14T19:30:00+09:00','2026-10-14T16:00+09:00'),Date.parse('2026-10-14T20:00:00+09:00'));
// Exercise the real dispatch guard: only after the failed scan finishes can the queued retry start.
let calls=0;let resolve;const dispatch={Date:Clock,currentScheduledScanSlot:()=>payload.scanSlot,recentScanSlot:()=>true,scanAll:()=>{calls++;return new Promise(r=>resolve=r);}};
const block=source.slice(source.indexOf('let activeScanPromise=null;'),source.indexOf('const SUPPLIER_EXTENSION_ID'));
vm.runInNewContext(block+';this.start=requestScan;this.finish=finishScan;this.queue=()=>{queuedSaveRetry={slot:currentScheduledScanSlot(),deadlineAt:"2026-10-14T22:00:00+09:00"};};',dispatch);
assert.equal(dispatch.start(),true);assert.equal(dispatch.start(),false);dispatch.queue();resolve();await new Promise(r=>setImmediate(r));assert.equal(calls,2);assert.equal(dispatch.start(),false);resolve();await new Promise(r=>setImmediate(r));assert.equal(calls,2);
console.log('Complete source retention, unique save, one Chrome retry, Edge evidence, deadline and dispatch deduplication passed.');
