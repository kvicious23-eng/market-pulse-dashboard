import {readTestFile} from './test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=readTestFile('chrome-extension/background.js','utf8');
const start=source.indexOf('async function collectCheckoutDiscountsForTarget(');
const end=source.indexOf('\n\nasync function diagnoseCheckoutDiscounts(',start);
assert.ok(start>=0&&end>start);

async function scan({child,confirmed}) {
  const removed=[];
  const original={id:10,status:'complete',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'};
  const checkout={id:11,status:'complete',openerTabId:10,url:'https://order.coupang.com/order/orderSheet.pang'};
  const context={
    URL,
    wait:async()=>{},
    waitForComplete:async()=>{},
    withScanTimeout:async promise=>promise,
    enterCheckoutDiagnostic(){},
    readCheckoutDiscounts(){},
    reconcileCheckoutDiscounts(regular,instant,coupon){
      return {status:'captured',reason:'checkout-three-discount-fields-captured',regular,instant,coupon,wowTotal:instant+coupon,inferredZeroFields:[]};
    },
    chrome:{
      tabs:{
        async create(options){assert.equal(options.active,true);return original;},
        async get(){return original;},
        async query(options){assert.deepEqual(Object.keys(options),[]);return child?[original,checkout,{id:12,openerTabId:999,status:'complete',url:checkout.url}]:[original];},
        async remove(id){removed.push(id);}
      },
      scripting:{async executeScript({target,func}){
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
  vm.runInNewContext(`${source.slice(start,end)};this.collect=collectCheckoutDiscountsForTarget`,context);
  const result=await context.collect({url:original.url,mtm:'TEST',productId:'1',itemId:'2',vendorItemId:'3'});
  return {result,removed};
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
