import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync("chrome-extension/background.js","utf8");
const manifest=JSON.parse(fs.readFileSync("chrome-extension/manifest.json","utf8"));
const importer=fs.readFileSync("scripts/import-extension-results.ps1","utf8");
const dashboard=fs.readFileSync("dist/app.js","utf8");
assert.equal(manifest.version,"1.9.2");
assert.match(source,/version:5,/);
assert.match(source,/checkoutCouponSource:'checkout'/);
assert.match(source,/checkoutCouponSource:soldOut\?'product-page-soldout':null/);
assert.match(importer,/payload\.version -ne 5/);
assert.match(importer,/extensionVersion -lt \[version\]'1\.9\.2'/);
assert.match(source,/checkout-discount-label-present-amount-unparsed/);
assert.match(importer,/checkoutUnparsedFields/);
assert.match(importer,/checkoutDiscountFieldStatus/);
assert.match(importer,/checkoutDiscountEvidence/);
assert.match(dashboard,/checkoutDiscountFieldStatus/);
assert.match(dashboard,/금액 판독 실패/);
assert.match(dashboard,/주문서 할인 근거/);
assert.match(importer,/\$historyCollectionSucceeded=\$alertEligible -or \(\$checkoutStatus -eq 'soldout' -and \$null -ne \$checkoutCoupon\)/);
assert.match(importer,/'수집결과'=if\(\$historyCollectionSucceeded\)\{'success'\}else\{'failed'\}/);

const checkoutStart=source.indexOf("function readCheckoutDiscounts(");
const checkoutEnd=source.indexOf("\n\nfunction reconcileCheckoutDiscounts",checkoutStart);
assert.ok(checkoutStart>=0&&checkoutEnd>checkoutStart,"checkout reader was not found");
const element=(text,parentElement=null)=>({
  innerText:text,textContent:text,parentElement,
  getBoundingClientRect:()=>({width:100,height:20})
});
const siblingRow=(label,amount)=>{
  const parent=element(`${label}\n${amount}`);
  return [element(label,parent),element(amount,parent),parent];
};
const paymentButton=element("결제하기");
const readCheckoutRows=rows=>{
  const checkoutContext={
    document:{
      body:{innerText:"주문 / 결제"},
      querySelectorAll:selector=>selector==="dt,dd,li,tr,div,span,p"?rows:selector==='button,[role="button"]'?[paymentButton]:[]
    },
    getComputedStyle:()=>({display:"block",visibility:"visible"}),
    location:{hostname:"checkout.coupang.com",pathname:"/order"},
    Date
  };
  vm.runInNewContext(`${source.slice(checkoutStart,checkoutEnd)};this.readCheckoutDiscounts=readCheckoutDiscounts;`,checkoutContext);
  const read=checkoutContext.readCheckoutDiscounts();
  return JSON.parse(JSON.stringify({
    regular:read.regularCouponDiscount,
    instant:read.wowInstantDiscount,
    coupon:read.wowCouponDiscount,
    wowTotal:read.wowMemberTotal
  }));
};
const expectedCheckoutRead={
  regular:{status:"captured",amount:130000},
  instant:{status:"captured",amount:80000},
  coupon:{status:"captured",amount:147800},
  wowTotal:{status:"captured",amount:227800}
};
for(const wowPrefix of ["와우 전용","와우전용"]){
  assert.deepEqual(readCheckoutRows([
    element("쿠폰할인 변경 -130,000원"),
    element(`${wowPrefix} 즉시할인 -80,000원`),
    element(`${wowPrefix} 쿠폰할인 변경 -147,800원`),
    element("와우회원 총 추가 혜택 -227,800원")
  ]),expectedCheckoutRead);
}
assert.deepEqual(readCheckoutRows([
  element("쿠폰할인"),
  element("와우전용 즉시할인 -80,000원"),
  element("와우 전용 쿠폰할인"),
  element("와우전용 쿠폰할인 변경 -147,800원"),
  element("와우회원 총 추가 혜택 -227,800원")
]),{
  regular:{status:"missing",amount:null},
  instant:{status:"captured",amount:80000},
  coupon:{status:"captured",amount:147800},
  wowTotal:{status:"captured",amount:227800}
});
assert.deepEqual(readCheckoutRows([
  element("쿠폰할인 변경 -130,000원 와우전용 즉시할인 -80,000원 와우전용 쿠폰할인 변경 -147,800원 와우회원 총 추가 혜택 -227,800원")
]),expectedCheckoutRead);
assert.deepEqual(readCheckoutRows([
  element("−130,000원 쿠폰 할인 변경"),
  element("–80,000원 와우 전용 즉시 할인"),
  element("—147,800원 와우전용 쿠폰 할인 변경"),
  element("−227,800원 와우 회원 총 추가 혜택")
]),expectedCheckoutRead);
assert.deepEqual(readCheckoutRows([
  ...siblingRow("쿠폰할인 변경","-130,000원"),
  ...siblingRow("와우 전용 즉시할인","₩80,000"),
  ...siblingRow("와우전용 쿠폰할인 변경","-147,800원"),
  ...siblingRow("와우회원 총 추가 혜택","-227,800원")
]),expectedCheckoutRead);
assert.deepEqual(readCheckoutRows([
  element("쿠폰할인 변경"),
  element("와우전용 즉시할인 -80,000원"),
  element("와우전용 쿠폰할인 변경 -147,800원"),
  element("와우회원 총 추가 혜택 -227,800원")
]),{
  regular:{status:"unverified",amount:null},
  instant:{status:"captured",amount:80000},
  coupon:{status:"captured",amount:147800},
  wowTotal:{status:"captured",amount:227800}
});
const start=source.indexOf("function reconcileCheckoutDiscounts(");
const end=source.indexOf("\n\nasync function collectCheckoutDiscountsForTarget",start);
assert.ok(start>=0&&end>start,"checkout three-discount reconciler was not found");
const context={};
vm.runInNewContext(`${source.slice(start,end)};this.reconcileCheckoutDiscounts=reconcileCheckoutDiscounts;`,context);
const reconcile=context.reconcileCheckoutDiscounts;

assert.deepEqual(
  JSON.parse(JSON.stringify(reconcile(null,null,null,null))),
  {status:"captured",reason:"checkout-confirmed-absent-discount-fields-zero",regular:0,instant:0,coupon:0,wowTotal:0,inferredZeroFields:["checkoutCouponDiscount","wowInstantDiscount","wowCouponDiscount"]}
);
assert.equal(reconcile(30000,80000,null,80000).coupon,0);
assert.equal(reconcile(30000,null,150000,150000).instant,0);
assert.equal(reconcile(30000,80000,150000,230000).status,"captured");
assert.equal(reconcile(30000,80000,150000,200000).status,"unverified");

const calculateAvailable=({display,general,wowInstant,wowCoupon,cardRate=0,cardCap=null})=>{
  const preCard=display-general-wowInstant-wowCoupon;
  const calculated=Math.floor(preCard*cardRate/100);
  const card=Number.isFinite(cardCap)?Math.min(calculated,cardCap):calculated;
  return {general,preCard,card,final:preCard-card};
};

const calculateSoldOut=({display,productPage})=>({
  general:display-productPage,
  preCard:null,
  card:null,
  final:null
});

assert.deepEqual(
  calculateSoldOut({display:2369000,productPage:2159000}),
  {general:210000,preCard:null,card:null,final:null}
);
assert.deepEqual(
  calculateAvailable({display:1558000,general:30000,wowInstant:80000,wowCoupon:150000,cardRate:8,cardCap:109060}),
  {general:30000,preCard:1298000,card:103840,final:1194160}
);

console.log("Discount source and calculation rules passed.");
