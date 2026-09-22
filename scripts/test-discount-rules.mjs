import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync("chrome-extension/background.js","utf8");
const start=source.indexOf("function reconcileCheckoutWowDiscounts(");
const end=source.indexOf("\n\nasync function collectCheckoutDiscountsForTarget",start);
assert.ok(start>=0&&end>start,"checkout WOW reconciler was not found");
const context={};
vm.runInNewContext(`${source.slice(start,end)};this.reconcileCheckoutWowDiscounts=reconcileCheckoutWowDiscounts;`,context);
const reconcile=context.reconcileCheckoutWowDiscounts;

assert.deepEqual(
  JSON.parse(JSON.stringify(reconcile(null,null,null))),
  {status:"captured",reason:"checkout-confirmed-absent-wow-fields-zero",instant:0,coupon:0,wowTotal:0,inferredZeroFields:["wowInstantDiscount","wowCouponDiscount"]}
);
assert.equal(reconcile(80000,null,80000).coupon,0);
assert.equal(reconcile(null,150000,150000).instant,0);
assert.equal(reconcile(80000,150000,230000).status,"captured");
assert.equal(reconcile(80000,150000,200000).status,"unverified");

const calculate=({display,productPage,wowInstant,wowCoupon,cardRate=0,cardCap=null})=>{
  const general=display-productPage;
  const preCard=display-general-wowInstant-wowCoupon;
  const calculated=Math.floor(preCard*cardRate/100);
  const card=Number.isFinite(cardCap)?Math.min(calculated,cardCap):calculated;
  return {general,preCard,card,final:preCard-card};
};

assert.deepEqual(
  calculate({display:2369000,productPage:2159000,wowInstant:0,wowCoupon:0}),
  {general:210000,preCard:2159000,card:0,final:2159000}
);
assert.deepEqual(
  calculate({display:1558000,productPage:1408000,wowInstant:80000,wowCoupon:150000,cardRate:8,cardCap:109060}),
  {general:150000,preCard:1178000,card:94240,final:1083760}
);

console.log("Discount source and calculation rules passed.");
