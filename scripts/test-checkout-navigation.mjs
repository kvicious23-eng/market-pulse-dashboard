import {readTestFile} from './test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=readTestFile('chrome-extension/background.js','utf8');
const start=source.indexOf('async function collectCheckoutDiscountsForTarget(');
const end=source.indexOf('\n\nasync function diagnoseCheckoutDiscounts(',start);
assert.ok(start>=0&&end>start);

async function scan({child,confirmed,busyFailures=0,createError,entryTimeout=false,reuse=false,userAgent='Chrome/150',prepareError=null,entryError=null,tabClosed=false}) {
  let createAttempts=0,entryCalls=0,loadCalls=0,preparedCalls=0;
  const removed=[],waits=[],updates=[];
  const original={id:10,status:'complete',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'};
  const checkout={id:11,status:'complete',openerTabId:10,url:'https://order.coupang.com/order/orderSheet.pang'};
  const context={
    navigator:{userAgent},
    crypto:{randomUUID:()=> 'a'.repeat(32)},
    URL,
    wait:async ms=>waits.push(ms),
    waitForComplete:async()=>{loadCalls++;},
    withScanTimeout:async (promise,ms,stage)=>{if(entryTimeout&&stage==='checkout-entry')throw Error('scan-timeout:'+stage);return promise;},

    enterCheckoutDiagnostic(){},
    settleBuyButton(){},
    prepareProductForCheckout(){},
    prepareWhaleScanWindow:async()=>{},
    ensureWhaleTabViewport:async()=>({width:1200,height:800}),
    readCheckoutDiscounts(){},
    reconcileCheckoutDiscounts(regular,instant,coupon){
      return {status:'captured',reason:'checkout-three-discount-fields-captured',regular,instant,coupon,wowTotal:instant+coupon,inferredZeroFields:[]};
    },
    chrome:{
      runtime:{onMessage:{addListener(){}}},
      tabs:{
        async create(options){createAttempts++;assert.equal(options.active,true);if(createError)throw Error(createError);if(createAttempts<=busyFailures)throw Error('Tabs cannot be edited right now (user may be dragging a tab).');return original;},
        async get(){if(tabClosed)throw Error('No tab with id: 10');return {...original,windowId:50};},
        async update(id,options){assert.equal(id,10);updates.push(options);assert.deepEqual(Object.keys(options),['active']);return original;},
        async query(options){assert.deepEqual(Object.keys(options),[]);return child?[original,checkout,{id:12,openerTabId:999,status:'complete',url:checkout.url}]:[original];},
        async remove(id){removed.push(id);}
      },
      windows:{get:async()=>({state:'normal'})},
      scripting:{async executeScript({target,func}){
        if(/innerWidth/.test(String(func)))return [{result:{width:1200,height:800}}];
        if(func.name==='prepareProductForCheckout'){preparedCalls++;return [{result:prepareError?{ok:false,reason:prepareError}:{ok:true}}];}
        if(func.name==='settleBuyButton')return [{result:{ok:true}}];
        if(func.name==='enterCheckoutDiagnostic'){entryCalls++;if(entryTimeout)return new Promise(()=>{});if(confirmed&&!child&&!entryError)original.url=checkout.url;return [{result:entryError?{ok:false,reason:entryError}:{ok:true,buttonEvidence:'바로구매'}}];}
        assert.equal(target.tabId,child?11:10);
        return [{result:confirmed?{
          ok:true,host:'order.coupang.com',path:'/order/orderSheet.pang',capturedAt:'2026-09-27T05:00:00Z',
          regularCouponDiscount:{status:'captured',amount:1000},
          wowInstantDiscount:{status:'captured',amount:2000},
          wowCouponDiscount:{status:'captured',amount:3000}
        }:{
          ok:false,reason:'checkout-page-not-confirmed',host:'www.coupang.com',path:'/vp/products/1',
          discountEvidence:['상품페이지 쿠폰 문구']
        }}];
      }}
    }
  };
  vm.runInNewContext(readTestFile('chrome-extension/checkout-diagnostics.js','utf8'),context);
  vm.runInNewContext(`${source.slice(source.indexOf('async function withTabEditRetry('),source.indexOf('async function openScanTab('))}\n${source.slice(start,end)};this.collect=collectCheckoutDiscountsForTarget`,context);
  const result=await context.collect({url:original.url,mtm:'TEST',productId:'1',itemId:'2',vendorItemId:'3'},null,undefined,reuse?original:null);
  return {result,removed,createAttempts,entryCalls,loadCalls,waits,updates,preparedCalls};
}

const newTab=await scan({child:true,confirmed:true});
assert.equal(newTab.result.checkoutDiscountStatus,'captured');
assert.equal(newTab.result.checkoutDiscountTotal,6000);
assert.deepEqual(newTab.removed,[11,10]);

const productPage=await scan({child:false,confirmed:false});
assert.equal(productPage.result.checkoutDiscountStatus,'missing');
assert.equal(productPage.result.checkoutCouponDiscount,null);
assert.equal(productPage.result.checkoutPageHost,'www.coupang.com');
assert.equal(productPage.result.checkoutPagePath,'/vp/products/1');
assert.equal(productPage.result.checkoutEntryButtonEvidence,'바로구매');
assert.deepEqual(productPage.removed,[10]);
console.log('Checkout navigation and fail-closed tests passed.');

const transient=await scan({child:true,confirmed:true,busyFailures:2});
assert.equal(transient.createAttempts,3);
assert.equal(transient.result.checkoutDiscountStatus,'captured');
const persistent=await scan({child:true,confirmed:true,busyFailures:9});
assert.equal(persistent.createAttempts,3);
assert.equal(persistent.result.checkoutDiscountStatus,'missing');
assert.match(persistent.result.checkoutDiscountReason,/Tabs cannot be edited/);
const otherError=await scan({createError:'scan-timeout:checkout-open'});
assert.equal(otherError.createAttempts,1);
assert.equal(otherError.result.checkoutDiscountStatus,'missing');
console.log('Explicit tab-edit rejection retries twice; timeout never retries.');

const stalled=await scan({child:true,confirmed:true,entryTimeout:true});
assert.equal(stalled.result.checkoutDiscountStatus,'missing');
assert.equal(stalled.result.checkoutCouponDiscount,null);
assert.equal(stalled.result.checkoutDiagnostic.pendingOperations,1);
assert.ok(stalled.result.checkoutDiagnostic.events.some(e=>e.kind==='failure-tab'&&e.route==='checkout'));
assert.deepEqual(stalled.removed,[11,10],'Owned child opened during a lost entry acknowledgement is still closed');
assert.equal(stalled.createAttempts,1,'Entry timeout never reopens/replays buy-now');
console.log('Real collector retains diagnostic on stalled entry, snapshots owned checkout child and fails closed without a repeated click.');

for(const userAgent of ['Chrome/150','Edg/150','Whale/5']) {
  for(const child of [false,true]) {
    const r=await scan({reuse:true,child,confirmed:true,userAgent});
    assert.equal(r.result.checkoutDiscountTotal,6000);
    assert.equal(r.createAttempts,0,'Checkout reuses the scanned product tab');
    assert.equal(r.preparedCalls,1);assert.equal(r.entryCalls,1);
    assert.equal(r.loadCalls,0);assert.ok(!r.waits.includes(7000),'No duplicate load wait');
    assert.deepEqual(r.removed,child?[11]:[],'Caller retains ownership of the product tab');
    assert.equal(r.updates.length,1,'Activate the original tab without a URL navigation');
  }
  for(const reason of ['product-identifiers-mismatch','card-popup-close-unavailable','card-popup-not-dismissed']) {
    const r=await scan({reuse:true,prepareError:reason,userAgent});
    assert.equal(r.result.checkoutDiscountStatus,'missing');assert.match(r.result.checkoutDiscountReason,new RegExp(reason));
    assert.equal(r.entryCalls,0);assert.equal(r.createAttempts,0);assert.deepEqual(r.removed,[]);
  }
  for(const reason of ['buy-now-button-sold-out','quantity-is-not-one','care-option-selected','buy-now-button-obscured']) {
    const r=await scan({reuse:true,entryError:reason,userAgent});
    assert.equal(r.result.checkoutDiscountStatus,'missing');assert.equal(r.result.checkoutDiscountReason,reason);
    assert.equal(r.entryCalls,1);assert.equal(r.createAttempts,0);
  }
  const changed=await scan({reuse:true,entryError:'buy-now-button-not-found',userAgent});assert.equal(changed.result.checkoutDiscountReason,'buy-now-button-layout-changed');assert.equal(changed.entryCalls,1);
  const timeout=await scan({reuse:true,child:true,confirmed:true,entryTimeout:true,userAgent});
  assert.equal(timeout.result.checkoutDiscountStatus,'missing');assert.equal(timeout.entryCalls,1);assert.equal(timeout.createAttempts,0);
  assert.deepEqual(timeout.removed,[11],'Lost entry acknowledgement only closes its child');
}
const closed=await scan({reuse:true,tabClosed:true});
assert.equal(closed.result.checkoutDiscountStatus,'missing');assert.equal(closed.createAttempts,0);assert.equal(closed.entryCalls,0);
console.log('Three-browser same/child checkout, single entry, borrowed ownership, no duplicate load, closed tab, preparation/identity/sold-out/care/quantity failures and timeout without replay passed.');
