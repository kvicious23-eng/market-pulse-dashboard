import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const background=readTestFile('chrome-extension/background.js','utf8');
const diagnostic=readTestFile('chrome-extension/checkout-diagnostics.js','utf8');
const listeners={},files=[];
const context={URL,crypto:{randomUUID:()=> 'a'.repeat(32)},Date,Promise,Set,Map,
  withScanTimeout:async p=>p,waitForScanDownload:async()=>{},
  chrome:{runtime:{id:'scanner',onMessage:{addListener(fn){listeners.message=fn;}}},
    tabs:Object.fromEntries(['onCreated','onUpdated','onRemoved'].map(k=>[k,{addListener(fn){listeners[k]=fn;}}])),
    webRequest:Object.fromEntries(['onCompleted','onBeforeRedirect','onErrorOccurred'].map(k=>[k,{addListener(fn,filter){assert.equal(filter.types[0],'main_frame');assert.equal(filter.urls.length,3);listeners[k]=fn;}}])),
    downloads:{async download(options){files.push(options);return 1;}}
  }};
vm.runInNewContext(diagnostic+';Object.assign(this,{createCheckoutTrace,checkoutDiagnosticStep,captureCheckoutFailure,saveCheckoutDiagnosticArchive,checkoutDiagnosticRoute});',context);
const trace=context.createCheckoutTrace();trace.enroll({id:10,url:'https://www.coupang.com/vp/products/123?token=SECRET',status:'complete'});
assert.equal(trace.data.observerStatus,'registered');
listeners.onCreated({id:11,openerTabId:10,url:'https://order.coupang.com/order/PRIVATE_ORDER?address=SECRET'});
listeners.onCreated({id:99,openerTabId:999,url:'https://order.coupang.com/order/UNRELATED'});
listeners.onUpdated(11,{url:'anything'}, {id:11,url:'https://order.coupang.com/order/PRIVATE_ORDER?address=SECRET',status:'loading'});
listeners.onCompleted({tabId:11,frameId:0,type:'main_frame',url:'https://order.coupang.com/order/PRIVATE_ORDER?token=SECRET',statusCode:403});
listeners.onCompleted({tabId:99,frameId:0,type:'main_frame',url:'https://order.coupang.com/order/UNRELATED',statusCode:500});
let accepted=0;const send=(id,checkpoint='before-click',attemptId=trace.data.attemptId)=>listeners.message({type:'CHECKOUT_DIAGNOSTIC_CHECKPOINT',checkpoint,attemptId},{id,tab:{id:10}},()=>accepted++);
send('other');send('scanner','body:SECRET');send('scanner','before-click','b'.repeat(32));send('scanner');assert.equal(accepted,1);
let resolve;const pending=new Promise(r=>resolve=r);let calls=0;
context.withScanTimeout=async(p,ms,stage)=>{if(stage==='checkout-entry')throw Error('scan-timeout:'+stage);return p;};
await assert.rejects(context.checkoutDiagnosticStep(trace,'entry',()=>{calls++;return pending;},30000),/checkout-entry/);
assert.equal(calls,1);assert.equal(trace.data.pendingOperations,1);
context.chrome.tabs.query=async()=>[{id:10,url:'https://www.coupang.com/vp/products/123',status:'complete'},{id:11,openerTabId:10,url:'https://order.coupang.com/order/SECRET',status:'loading'},{id:99,url:'https://order.coupang.com/order/PRIVATE',status:'complete'}];
await context.captureCheckoutFailure(trace,10);
assert.equal(trace.data.events.filter(e=>e.kind==='failure-tab').length,2);
trace.finish();resolve();await Promise.resolve();await Promise.resolve();
assert.equal(trace.data.pendingOperations,0);assert.ok(trace.data.events.some(e=>e.kind==='api-resolved'&&e.stage==='entry'));
listeners.onCompleted({tabId:11,frameId:0,type:'main_frame',url:'https://order.coupang.com/order/x',statusCode:200});
assert.equal(trace.data.events.filter(e=>e.kind==='network').length,1);
const encoded=JSON.stringify(trace.data);for(const secret of ['SECRET','PRIVATE','UNRELATED','token=','address='])assert.ok(!encoded.includes(secret));
assert.ok(!trace.data.events.some(e=>e.tabId===99));assert.equal(context.checkoutDiagnosticRoute('https://evil.test/order/foo'),'other-origin');
// Empty enrollment must not accidentally collect all tabs with no openerTabId.
const empty=context.createCheckoutTrace();await context.captureCheckoutFailure(empty,undefined);assert.equal(empty.data.events.filter(e=>e.kind==='failure-tab').length,0);
for(let i=0;i<120;i++)empty.event('test');assert.equal(empty.data.events.length,96);assert.ok(empty.data.droppedEvents>0);
// Private archive includes strict identities + safe trace, never the source result/body.
const row={mtm:'TEST',productId:'1',itemId:'2',vendorItemId:'3',checkoutDiscountStatus:'missing',checkoutDiscountReason:'scan-timeout:checkout-entry',checkoutDiagnostic:trace.data,privateText:'SECRET'};
const payload={browser:'edge',extensionVersion:'1.9.51',runId:'b'.repeat(32),results:[row]};
assert.equal(await context.saveCheckoutDiagnosticArchive(payload),'saved');
const archive=JSON.parse(decodeURIComponent(files[0].url.split(',')[1]));assert.equal(archive.results.length,1);assert.equal(archive.results[0].privateText,undefined);assert.match(files[0].filename,/checkout-diagnostic-b+\.json$/);
row.checkoutDiscountReason='buy-now-button-not-found';assert.equal(await context.saveCheckoutDiagnosticArchive(payload),'not-needed');
row.checkoutDiscountReason='scan-timeout:checkout-entry';context.chrome.downloads.download=async()=>{throw Error('FILE_ACCESS_DENIED');};assert.equal(await context.saveCheckoutDiagnosticArchive(payload),'save-failed');
// Actual injected page function checkpoints exactly one click, and never a second
// click after the worker times out. It doesn't serialize page text in messages.
const a=background.indexOf('function enterCheckoutDiagnostic('),b=background.indexOf('\n\nfunction readCheckoutDiscounts',a);let clicks=0;const checkpoints=[];
const button={innerText:'바로구매',className:'buy',getBoundingClientRect:()=>({width:100,height:30}),getAttribute:()=>null,click(){clicks++;}};
const page={URL,location:{href:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'},document:{querySelectorAll(selector){return selector.startsWith('button')?[button]:[];}},getComputedStyle:()=>({display:'block',visibility:'visible'}),chrome:{runtime:{sendMessage:async msg=>checkpoints.push(msg)}}};
vm.runInNewContext(background.slice(a,b)+';this.enter=enterCheckoutDiagnostic;',page);
assert.equal(page.enter('1','2','3',true,'a'.repeat(32)).ok,true);assert.equal(clicks,1);assert.deepEqual(checkpoints.map(x=>x.checkpoint),['script-entered','identifiers-verified','button-ready','before-click','click-returned']);
assert.equal(page.enter('wrong','2','3',true,'a'.repeat(32)).ok,false);assert.equal(clicks,1);
console.log('Checkout diagnostics: pending timeout/late ack, private tab/network lifecycle, sender/token binding, bounded redaction, archive failure and one-click checkpoints passed.');
