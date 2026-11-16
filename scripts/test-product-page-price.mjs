import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {offerFor} from './competitor-data.mjs';
const target={competitorKey:'1-2-3',model:'Fixture',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'};
const row={ok:true,checkedAt:'2026-11-16T06:03:00Z',price:1909000,basisPrice:2149000,strikePrice:2149000,basisEvidence:{text:'2,149,000원'},priceBasisType:'crossed-out',priceBasisSource:'visible-product-price',strikeReliable:true,strikeAnchorVerified:true,checkoutDiscountStatus:'captured',checkoutCouponSource:'checkout',checkoutCouponDiscount:150000,wowInstantDiscount:90000,wowCouponDiscount:80000,checkoutDiscountTotal:320000,checkoutShipping:0,cardBenefitStatus:'none',cardDiscount:0};
const normal=offerFor(row,target);
assert.equal(normal.finalPrice,1909000);assert.equal(normal.preCardPrice,1909000);assert.equal(normal.couponDiscount,240000);
assert.equal(normal.wowCouponDiscount,0);assert.equal(normal.excludedWowCouponDiscount,80000);assert.equal(normal.priceCalculationPolicy,'product-page-v1');
assert.equal(offerFor({...row,price:1829000},target).finalPrice,1829000,'An embedded product-page coupon must not be added back');
assert.equal(offerFor({...row,wowCouponDiscount:0,checkoutDiscountTotal:240000},target).finalPrice,1909000);
const terms=[{rate:2,maxDiscount:20000,providers:['A']},{rate:3,maxDiscount:50000,providers:['B']}];
const card=offerFor({...row,checkoutShipping:3000,cardBenefitStatus:'captured',cardEvidenceSource:'dom',cardTerms:terms,cardDiscount:50000},target);
assert.equal(card.finalPrice,1862000);assert.equal(card.cardDiscount,50000);assert.equal(card.cardRate,3);assert.equal(card.preCardPrice,1912000);
const review=offerFor({...row,cardBenefitStatus:'unverified'},target);assert.equal(review.finalPrice,1909000);assert.equal(review.alertEligible,false);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mp-page-price-'));const dir=path.join(root,'brand/fixture');fs.mkdirSync(dir,{recursive:true});
try{
 const validator=path.resolve('scripts/validate-market-data.mjs');
 const verify=(o,valid)=>{fs.writeFileSync(path.join(dir,'market-data.js'),'window.MARKET_DATA = '+JSON.stringify({products:[{mtm:'Fixture',itemId:'2',offers:[{...o,role:'mine'}]}]})+';');const r=spawnSync(process.execPath,[validator],{cwd:root,encoding:'utf8'});assert.equal(r.status===0,valid,r.stderr||r.stdout);};
 verify(normal,true);verify({...normal,preCardPrice:1829000,finalPrice:1829000},false);verify({...normal,wowCouponDiscount:80000},false);verify({...normal,couponDiscount:320000},false);
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('Product-page price: excluded account coupon, embedded discounts, shipping, best capped card, partial evidence and validation passed.');
