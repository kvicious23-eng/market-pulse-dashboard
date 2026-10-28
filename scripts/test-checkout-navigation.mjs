import {readTestFile} from './test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=readTestFile('chrome-extension/background.js','utf8');
const start=source.indexOf('async function collectCheckoutDiscountsForTarget(');
const end=source.indexOf('\n\nasync function diagnoseCheckoutDiscounts(',start);
assert.ok(start>=0&&end>start);

async function scan({child,confirmed,busyFailures=0,createError,entryTimeout=false}) {
  let createAttempts=0;
  const removed=[];
  const original={id:10,status:'complete',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'};
  const checkout={id:11,status:'complete',openerTabId:10,url:'https://order.coupang.com/order/orderSheet.pang'};
  const context={
    navigator:{userAgent:'Chrome/150'},
    crypto:{randomUUID:()=> 'a'.repeat(32)},
    URL,
    wait:async()=>{},
    waitForComplete:async()=>{},
    withScanTimeout:async (promise,ms,stage)=>{if(entryTimeout&&stage==='checkout-entry')throw Error('scan-timeout:'+stage);return promise;},

    enterCheckoutDiagnostic(){},
    readCheckoutDiscounts(){},
    reconcileCheckoutDiscounts(regular,instant,coupon){
      return {status:'captured',reason:'checkout-three-discount-fields-captured',regular,instant,coupon,wowTotal:instant+coupon,inferredZeroFields:[]};
    },
    chrome:{
      runtime:{onMessage:{addListener(){}}},
      tabs:{
        async create(options){createAttempts++;assert.equal(options.active,true);if(createError)throw Error(createError);if(createAttempts<=busyFailures)throw Error('Tabs cannot be edited right now (user may be dragging a tab).');return original;},
        async get(){return original;},
        async query(options){assert.deepEqual(Object.keys(options),[]);return child?[original,checkout,{id:12,openerTabId:999,status:'complete',url:checkout.url}]:[original];},
        async remove(id){removed.push(id);}
      },
      scripting:{async executeScript({target,func}){
        if(func.name==='enterCheckoutDiagnostic'&&entryTimeout)return new Promise(()=>{});
        if(func.name==='enterCheckoutDiagnostic') return [{result:{ok:true,buttonEvidence:'바로구매'}}];
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
  const result=await context.collect({url:original.url,mtm:'TEST',productId:'1',itemId:'2',vendorItemId:'3'});
  return {result,removed,createAttempts};
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
