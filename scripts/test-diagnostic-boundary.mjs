import assert from 'node:assert/strict';import vm from 'node:vm';import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const a=source.indexOf('async function diagnoseCheckoutDiscounts('),b=source.indexOf('\n\nlet activeScanPromise',a);
async function diagnostic({vendor='3',saveFailure=false}={}){
 let reads=0,collects=0,saves=0;
 const c={URL,getTargets:async()=>[{productId:'1',itemId:'2',vendorItemId:'3',enabled:true,mtm:'Test'}],collectCheckoutDiscountsForTarget:async()=>{collects++;return {checkoutDiscountStatus:'captured',checkoutCouponDiscount:10,wowInstantDiscount:20,wowCouponDiscount:0};},withScanTimeout:async p=>p,waitForScanDownload:async(id,name)=>{assert.equal(id,4);assert.equal(name,'MarketPulse/checkout-discount-diagnostic.json');if(saveFailure)throw Error('download-interrupted');},chrome:{tabs:{query:async()=>[{id:1,url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId='+vendor}]},runtime:{getManifest:()=>({version:'test'})},scripting:{executeScript:async()=>{reads++;throw Error('Unused price read must not cross the Chrome argument boundary');}},downloads:{download:async()=>{saves++;return 4;}}}};
 vm.runInNewContext(source.slice(a,b)+';this.run=diagnoseCheckoutDiscounts;',c);return {result:await c.run(),reads,collects,saves};
}
let d=await diagnostic();assert.equal(d.result.ok,true);assert.equal(d.reads,0);assert.equal(d.collects,1);assert.equal(d.saves,1);
d=await diagnostic({vendor:'9'});assert.equal(d.result.ok,false);assert.equal(d.collects,0);
d=await diagnostic({saveFailure:true});assert.equal(d.result.ok,false);
// Exercise the production message admission, including the synchronous lock.
const block=source.slice(source.indexOf("  if (message?.type==='DIAGNOSE_CHECKOUT_DISCOUNTS')"),source.lastIndexOf('\n});'));
let release,calls=0;const replies=[];const c={crypto:{randomUUID:()=> 'a'.repeat(32)},activeScanPromise:null,fallbackCatalogPending:false,primaryPendingOperations:new Set(),primaryOperationOwner:null,activeScanSlot:null,activeScanRequestId:null,diagnoseCheckoutDiscounts(){calls++;return new Promise(r=>{release=r;});},finishScan(){c.activeScanPromise=null;},};
vm.runInNewContext('this.dispatch=function(message,sendResponse){'+block+'};',c);
c.dispatch({type:'DIAGNOSE_CHECKOUT_DISCOUNTS'},r=>replies.push(r));c.dispatch({type:'DIAGNOSE_CHECKOUT_DISCOUNTS'},r=>replies.push(r));assert.equal(calls,1);assert.equal(replies[0].reason,'already-running');assert.match(c.primaryOperationOwner,/checkout-diagnostic/);
release({ok:true});await new Promise(r=>setImmediate(r));assert.equal(c.activeScanPromise,null);assert.equal(replies[1].ok,true);
c.primaryPendingOperations.add({});c.dispatch({type:'DIAGNOSE_CHECKOUT_DISCOUNTS'},r=>replies.push(r));assert.equal(calls,1);assert.equal(replies.at(-1).reason,'already-running');
console.log('Real diagnostic admission: full triple identity, no unused unserializable price read, download-complete success and duplicate/pending-operation isolation passed.');
