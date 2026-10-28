import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const policy=readTestFile('chrome-extension/scan-policy.js','utf8');
const background=readTestFile('chrome-extension/background.js','utf8');
const p={};vm.runInNewContext(policy+';this.owner=scanPolicyForSlot;this.next=nextScheduledScanTime;this.deadline=primaryScanDeadline;this.witness=primaryWitnessFilename;this.base=primaryReceiptBase;',p);
for(const [slot,browser] of [
 ['2026-10-20T12:00+09:00','chrome'],['2026-10-21T12:00+09:00','whale'],
 ['2026-10-25T20:00+09:00','chrome'],['2026-10-26T08:00+09:00','chrome'],
 ['2026-10-26T12:00+09:00','whale'],['2026-10-26T16:00+09:00','chrome'],
 ['2026-10-26T20:00+09:00','whale'],['2026-10-27T08:00+09:00','chrome'],
 ['2026-10-31T20:00+09:00','whale'],['2026-11-01T12:00+09:00','whale']])assert.equal(p.owner(slot).browser,browser,slot);
for(const slot of ['2026-02-30T12:00+09:00','2026-10-26T00:00+09:00','2026-10-26T20:00Z','../bad'])assert.throws(()=>p.owner(slot));
const evening='2026-10-26T20:00+09:00',noon='2026-10-26T12:00+09:00',id='a'.repeat(32);
assert.equal(p.next(evening),Date.parse('2026-10-27T08:00+09:00'));
assert.equal(p.deadline(evening,evening),Date.parse('2026-10-26T22:00+09:00'));
assert.equal(p.deadline('2026-10-26T21:15+09:00',evening),Date.parse('2026-10-26T22:20+09:00'));
assert.notEqual(p.witness(noon,id),p.witness(evening,id));assert.notEqual(p.base({scanSlot:noon,requestId:id}),p.base({scanSlot:evening,requestId:id}));
let now=Date.parse(evening);class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
const calls=[],alarms=[],handlers={};
const ctx={Date:Clock,Intl,navigator:{userAgent:'Chrome/150'},waitForSupplierResume:async()=>{},requestScan:s=>calls.push(s),
 chrome:{runtime:{onInstalled:{addListener:f=>handlers.install=f},onStartup:{addListener:f=>handlers.startup=f}},storage:{local:{get:async()=>({}),set:async()=>{}}},alarms:{clear:async()=>{},create:async(n,c)=>alarms.push({n,...c}),onAlarm:{addListener:f=>handlers.alarm=f}}}};
vm.runInNewContext(policy+';'+background.slice(background.indexOf('const SCHEDULED_SCAN_TIMES ='),background.indexOf('\n\nfunction enterCheckoutDiagnostic'))+';'+background.slice(background.indexOf('chrome.runtime.onInstalled.addListener('),background.indexOf('chrome.action.onClicked.addListener(')),ctx);
await handlers.startup();assert.equal(calls.length,0,'Chrome startup must not steal Whale evening');
assert.deepEqual(alarms.map(x=>x.n),['daily-scan-0800','daily-scan-1600']);
assert.equal(alarms[0].when,Date.parse('2026-10-27T08:00+09:00'),'08 KST date must survive UTC boundary');
await handlers.alarm({name:'daily-scan-2000',scheduledTime:now});assert.equal(calls.length,0,'A stale installed 20 alarm cannot start Chrome');
now=Date.parse('2026-10-26T16:00+09:00');await handlers.startup();assert.equal(calls.at(-1),'2026-10-26T16:00+09:00');
const state={},starts=[];let listener;
const worker={Date:Clock,Intl,navigator:{userAgent:'Whale/5'},activeScanPromise:null,primaryPendingOperations:new Set(),primaryPendingOperations:new Set(),activeScanSlot:null,activeScanRequestId:null,primaryStopRequestId:null,
 validateProductCatalog:()=>[],requestScan:(...a)=>{starts.push(a);return true;},chrome:{runtime:{getURL:x=>'chrome-extension://test/'+x,getManifest:()=>({version:'1.9.50'}),onMessage:{addListener:f=>listener=f}},storage:{local:{get:async()=>({...state}),set:async x=>Object.assign(state,x)}}}};
vm.runInNewContext(policy+';'+background.slice(background.indexOf('const SCHEDULED_SCAN_TIMES ='),background.indexOf('\n\nfunction enterCheckoutDiagnostic'))+';'+background.slice(background.indexOf('function isPrimarySender(')),worker);
const sender={url:'chrome-extension://test/primary.html'};
const message={type:'RUN_PRIMARY_SCAN',scanSlot:evening,requestId:id,policyId:p.owner(evening).id,requestedAt:evening,products:[]};
const send=m=>new Promise(r=>listener({...message,...m},sender,r));
now=Date.parse(evening);assert.equal((await send({policyId:'whale-noon-v1'})).reason,'invalid-primary-request');
assert.equal((await send({})).ok,true);assert.equal(starts.length,1);assert.equal(state.primaryRequest.deadlineAt,'2026-10-26T13:00:00.000Z');
await new Promise(r=>setImmediate(r));assert.equal((await send({retry:true,requestedAt:'2026-10-26T21:00+09:00'})).ok,true);assert.equal(state.primaryRequest.firstRequestedAt,evening);assert.equal(state.primaryRequest.deadlineAt,'2026-10-26T13:00:00.000Z');
await new Promise(r=>setImmediate(r));assert.equal((await send({scanSlot:noon,policyId:p.owner(noon).id})).reason,'outside-start-window');
console.log('Shared policy, historical/activation/weekend/KST boundaries, nighttime deadline, separated names, actual Chrome startup/stale alarm and Whale evening request/retry guards passed.');
// The original Whale deadline follows the full Edge handoff into its worker.
let edgeListener;const edgeStarts=[];
const edgeWorker={Date:Clock,Intl,navigator:{userAgent:'Edg/150'},activeScanPromise:null,primaryPendingOperations:new Set(),validateProductCatalog:()=>[],requestScan:(...a)=>{edgeStarts.push(a);return true;},
 chrome:{runtime:{getURL:x=>'chrome-extension://test/'+x,getManifest:()=>({version:'1.9.50'}),onMessage:{addListener:f=>edgeListener=f}},storage:{local:{set:async()=>{}}}}};
vm.runInNewContext(policy+';'+background.slice(background.indexOf('const SCHEDULED_SCAN_TIMES ='),background.indexOf('\n\nfunction enterCheckoutDiagnostic'))+';'+background.slice(background.indexOf('function isPrimarySender(')),edgeWorker);
const edgeRecovery={runId:'b'.repeat(32),reason:'access-check',primaryBrowser:'whale',primaryRequestId:id,policyId:p.owner(evening).id,triggeredAt:evening,deadlineAt:'2026-10-26T22:00+09:00'};
const edgeSend=change=>new Promise(r=>edgeListener({type:'RUN_FALLBACK',scanSlot:evening,products:[{mtm:'A'}],recovery:{...edgeRecovery,...change}},{},r));
assert.equal((await edgeSend({policyId:'old'})).reason,'invalid-whale-recovery-budget');
assert.equal((await edgeSend({deadlineAt:null})).reason,'invalid-whale-recovery-budget');
assert.equal((await edgeSend({deadlineAt:evening})).reason,'invalid-whale-recovery-budget');
assert.equal((await edgeSend({})).ok,true);assert.equal(edgeStarts.length,1);assert.equal(edgeStarts[0][1].deadlineAt,edgeRecovery.deadlineAt);
console.log('Actual Edge worker rejects wrong Whale routing and missing/expired inherited deadlines; accepts one full handoff with original budget.');
// Admission work is busy even before scanAll has obtained its promise.
await new Promise(r=>setImmediate(r));
vm.runInNewContext('fallbackCatalogPending=true;',worker);
assert.equal((await send({type:'GET_SCAN_STATUS'})).running,true,'Maintenance must not reload while a collection request is being admitted');
vm.runInNewContext('fallbackCatalogPending=false;',worker);
assert.equal((await send({type:'GET_SCAN_STATUS'})).running,false);
console.log('Real worker status protects the catalog-admission phase from maintenance reload.');

assert.equal(p.deadline('2026-10-26T13:15+09:00',noon),Date.parse('2026-10-26T14:20+09:00'));
assert.equal(p.deadline('2026-10-26T17:15+09:00','2026-10-26T16:00+09:00'),Date.parse('2026-10-26T18:20+09:00'));
console.log('Late daytime collection also leaves ten minutes before its fixed upload cutoff.');
