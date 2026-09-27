import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const validator=path.resolve("scripts/validate-market-data.mjs");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"market-pulse-sources-"));
const brand=path.join(root,"brand","fixture");
fs.mkdirSync(brand,{recursive:true});
const base={
  role:"mine",status:"현재가 직접 확인",alertEligible:true,shipping:0,
  observedListPrice:1_000_000,productPagePrice:950_000,
  checkoutDiscountStatus:"captured",checkoutCouponSource:"checkout",
  checkoutCouponDiscount:100_000,wowInstantDiscount:50_000,wowCouponDiscount:30_000,
  preCardPrice:820_000,cardBenefitStatus:"captured",cardEvidenceSource:"dom",
  cardRate:2,cardMaxDiscount:null,cardProviders:["KB"],cardDiscount:16_400,finalPrice:803_600
};
function verify(mine,expectedSuccess){
  const data={products:[{itemId:"12345",mtm:"TEST-123",offers:[mine]}]};
  fs.writeFileSync(path.join(brand,"market-data.js"),`window.MARKET_DATA = ${JSON.stringify(data)};`);
  const run=spawnSync(process.execPath,[validator],{cwd:root,encoding:"utf8"});
  assert.equal(run.status===0,expectedSuccess,run.stderr||run.stdout);
  return run.stderr;
}
try {
  // Checkout coupons are valid even if their derived price differs from the
  // product-page current price. The applicable card amount uses the coupon-adjusted price.
  verify(base,true);
  assert.match(verify({...base,cardDiscount:19_000,finalPrice:801_000},false),/cardDiscount/);
  verify({...base,cardRate:8,cardMaxDiscount:10_000,cardDiscount:10_000,finalPrice:810_000},true);
  assert.match(verify({...base,cardEvidenceSource:"checkout"},false),/card evidence/);
  assert.match(verify({...base,checkoutCouponSource:"product-page"},false),/coupons must come from checkout/);
  const soldOut={...base,status:"품절",alertEligible:false,checkoutDiscountStatus:"soldout",
    checkoutCouponSource:null,checkoutCouponDiscount:null,wowInstantDiscount:null,
    wowCouponDiscount:null,preCardPrice:null,cardBenefitStatus:"none",
    cardEvidenceSource:"",cardDiscount:null,finalPrice:null};
  verify(soldOut,true);
  verify({...soldOut,cardBenefitStatus:"captured",cardEvidenceSource:"dom",cardDiscount:19_000},true);
  assert.match(verify({...soldOut,checkoutCouponDiscount:50_000},false),/cannot infer coupon/);
} finally {
  fs.rmSync(root,{recursive:true,force:true});
}
console.log("Price source boundaries passed.");
