import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const slot='2026-10-28T16:00+09:00',now=Date.parse(slot)+31*60000;
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const handlers={},writes=[],scans=[];
const products=[{brand:'Test',mtm:'FAILED',productId:'1',itemId:'2',vendorItemId:'3',enabled:true,url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'}];
const context={Date:Clock,URL,Set,Map,isEdgeBrowser:true,activeScanPromise:null,primaryPendingOperations:new Set(),
  currentScheduledScanSlot:()=>slot,requestScan:(...a)=>{scans.push(a);return true;},
  chrome:{runtime:{getURL:p=>'chrome-extension://scanner/'+p,getManifest:()=>({version:'1.9.52'}),onMessage:{addListener:f=>handlers.message=f}},storage:{local:{set:async v=>writes.push(v)}}}};
vm.runInNewContext(readTestFile('chrome-extension/scan-policy.js','utf8'),context);
const validate=source.slice(source.indexOf('function validateProductCatalog('),source.indexOf('\nconst wait ='));
vm.runInNewContext(validate+'\n'+source.slice(source.indexOf('let fallbackCatalogPending=false;')),context);
const request={type:'RUN_FALLBACK',products,scanSlot:slot,recovery:{reason:'model-errors',scope:'models',runId:'a'.repeat(32),baseRunId:'b'.repeat(32),baseHash:'c'.repeat(64),chromeRunId:'b'.repeat(32),primaryBrowser:'chrome',policyId:'whale-noon-evening-v1',triggeredAt:new Clock().toISOString(),chromeStartedAt:slot,deadlineAt:new Date(Date.parse(slot)+120*60000).toISOString(),targets:products}};
function send(message,sender={url:'chrome-extension://scanner/fallback.html?scope=models'}){let response;handlers.message(message,sender,x=>response=x);return response;}
assert.equal(send(request).ok,true);assert.equal(scans.length,1);assert.equal(scans[0][3],products);assert.equal(writes.length,0,'Subset work must not replace the Edge saved full catalogue');
assert.equal(send({...request,recovery:{...request.recovery,baseHash:'bad'}}).ok,false);
assert.equal(send(request,{url:'chrome-extension://scanner/popup.html'}).ok,false);
context.primaryPendingOperations.add({stage:'unsettled-entry'});assert.equal(send(request).reason,'already-running');context.primaryPendingOperations.clear();
assert.equal(send({...request,recovery:{...request.recovery,deadlineAt:new Date(now-1).toISOString()}}).ok,false);
assert.equal(send({...request,recovery:{...request.recovery,targets:[]}}).ok,false);
assert.equal(scans.length,1,'Invalid/expired/busy requests must not collect');
assert.equal(send({...request,type:'CHECK_FALLBACK_TRANSPORT'}).ok,true);assert.equal(scans.length,1,'Verify must not collect');
const f=readTestFile('chrome-extension/fallback.js','utf8');assert.match(f,/runtime\/model-edge-/);assert.match(f,/model-edge-transport-check-/);
console.log('Selective Edge transient catalogue, strict local sender/source binding, budget/pending guard and read-only transport tests passed.');
