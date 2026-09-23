import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync("chrome-extension/background.js","utf8");
const manifest=JSON.parse(fs.readFileSync("chrome-extension/manifest.json","utf8"));
const importer=fs.readFileSync("scripts/import-extension-results.ps1","utf8");
const scheduleScript=fs.readFileSync("scripts/set-local-schedule.ps1","utf8");
const dashboard=fs.readFileSync("dist/app.js","utf8");
const lenovoRefresh=fs.readFileSync("scripts/update-market-data.mjs","utf8");
const acerRefresh=fs.readFileSync("scripts/update-acer-data.mjs","utf8");
assert.equal(manifest.version,"1.9.6");
assert.match(source,/daily-scan-0800/);
assert.match(source,/daily-scan-1400/);
assert.match(source,/lastRunSlot/);
assert.match(scheduleScript,/New-ScheduledTaskTrigger -Daily -At "08:00"/);
assert.match(scheduleScript,/New-ScheduledTaskTrigger -Daily -At "14:00"/);
assert.match(scheduleScript,/New-ScheduledTaskTrigger -Daily -At "08:30"/);
assert.match(scheduleScript,/New-ScheduledTaskTrigger -Daily -At "14:30"/);
assert.match(source,/version:5,/);
assert.match(source,/actualProductId!==String\(expectedProductId\).*actualItemId!==String\(expectedItemId\).*actualVendorItemId!==String\(expectedVendorItemId\)/s);
assert.match(source,/args:\[target\.productId,target\.itemId,target\.vendorItemId\]/);
assert.match(source,/checkoutCouponSource:'checkout'/);
assert.match(source,/checkoutCouponSource:soldOut\?'product-page-soldout':null/);
assert.match(importer,/payload\.version -ne 5/);
assert.match(importer,/extensionVersion -lt \[version\]'1\.9\.3'/);
assert.match(importer,/pre-card-price-does-not-match-product-page/);
assert.match(importer,/scan duration exceeds the three-hour safety limit/i);
assert.match(importer,/Duplicate vendorItemId values/);
assert.match(importer,/produce the same dashboard slug/);
assert.match(importer,/\$minimumPrice=if \(\$null -ne \$product\.srp.*-lt 250000\) \{10000\} else \{250000\}/);
assert.match(importer,/\$result\.price -ge \$minimumPrice/);
assert.match(importer,/\$safeBrand \$safeCategory · Korea/);
assert.match(dashboard,/categories\.length===1\?categories\[0\]:"Products"/);
assert.match(importer,/\$null -eq \$result\.cardDiscount -or \[long\]\$result\.cardDiscount -ne \$verifiedCardDiscount/);
assert.match(source,/checkout-discount-label-present-amount-unparsed/);
assert.match(importer,/checkoutUnparsedFields/);
assert.match(importer,/checkoutDiscountFieldStatus/);
assert.match(importer,/checkoutDiscountEvidence/);
assert.match(dashboard,/checkoutDiscountFieldStatus/);
assert.match(dashboard,/금액 판독 실패/);
assert.match(dashboard,/주문서 할인 근거/);
assert.match(dashboard,/offer\.alertEligible !== true/);
assert.match(dashboard,/offerStatus\(mine\) !== "현재가 직접 확인" \|\| mine\.alertEligible !== true \? "overview-status--soldout"/);
assert.match(dashboard,/offerStatus\(offer\) === "현재가 직접 확인" : offer\.alertEligible === true/);
const breakdownStart=dashboard.indexOf("function priceBreakdown(");
const breakdownEnd=dashboard.indexOf("\n\n  function checkoutDiscounts",breakdownStart);
assert.ok(breakdownStart>=0&&breakdownEnd>breakdownStart);
const breakdownContext={isSoldOut:offer=>offer?.status==="품절"};
vm.runInNewContext(`${dashboard.slice(breakdownStart,breakdownEnd)};this.priceBreakdown=priceBreakdown;`,breakdownContext);
const oldPrice={srp:1829000,observedListPrice:1829000,finalPrice:1662210,cardDiscount:16790,shipping:0,alertEligible:false,couponDiscount:null};
const partial=breakdownContext.priceBreakdown(oldPrice);
assert.equal(partial.preCardPrice,null);
assert.equal(partial.couponDiscount,null);
assert.equal(breakdownContext.priceBreakdown({...oldPrice,preCardPrice:1679000,couponDiscount:150000}).couponDiscount,null);
assert.equal(breakdownContext.priceBreakdown({...oldPrice,alertEligible:true}).preCardPrice,1679000);
assert.doesNotMatch(lenovoRefresh,/mine\.alertEligible\s*=\s*true/);
assert.doesNotMatch(acerRefresh,/mine\.alertEligible\s*=\s*true/);
assert.match(importer,/\$historyCollectionSucceeded=\$alertEligible -or \(\$checkoutStatus -eq 'soldout' -and \$null -ne \$checkoutCoupon\)/);
assert.match(importer,/'수집결과'=if\(\$historyCollectionSucceeded\)\{'success'\}else\{'failed'\}/);

const catalogStart=source.indexOf("function validateProductCatalog(");
const catalogEnd=source.indexOf("\n\nconst wait",catalogStart);
assert.ok(catalogStart>=0&&catalogEnd>catalogStart,"catalog validator was not found");
const targetLiteral=source.match(/const TARGETS\s*=\s*([\s\S]*?\n\];)/)?.[1];
assert.ok(targetLiteral,"default catalog was not found");
const catalogContext={URL,Set,Map};
vm.runInNewContext(`${source.slice(catalogStart,catalogEnd)};this.validateProductCatalog=validateProductCatalog;`,catalogContext);
const defaultTargets=vm.runInNewContext(targetLiteral);
assert.deepEqual(JSON.parse(JSON.stringify(catalogContext.validateProductCatalog(defaultTargets))),[]);
const godox={brand:"Godox",category:"Camera",mtm:"C100",srp:42000,enabled:true,
  productId:"9738958594",itemId:"29147698397",vendorItemId:"96070924334",
  url:"https://www.coupang.com/vp/products/9738958594?itemId=29147698397&vendorItemId=96070924334"};
assert.deepEqual(JSON.parse(JSON.stringify(catalogContext.validateProductCatalog([...defaultTargets,godox]))),[]);
const priceStart=source.indexOf("async function readDisplayedPrice(");
const priceEnd=source.indexOf("\n\nfunction snapshotCardDetailText",priceStart);
assert.ok(priceStart>=0&&priceEnd>priceStart,"product price reader was not found");
const priceContext={
  URL,location:{href:godox.url},
  document:{body:{innerText:"Godox C100 42,000원"},title:"Godox C100",
    querySelectorAll:selector=>selector==='meta[itemprop="price"]'?[{content:"42000",outerHTML:'<meta itemprop="price" content="42000">'}]:[]},
  getComputedStyle:()=>({display:"block",visibility:"visible"}),scrollX:0,scrollY:0
};
vm.runInNewContext(`${source.slice(priceStart,priceEnd)};this.readDisplayedPrice=readDisplayedPrice;`,priceContext);
const godoxPrice=await priceContext.readDisplayedPrice(godox.productId,godox.itemId,godox.vendorItemId,godox.srp);
assert.equal(godoxPrice.ok,true);
assert.equal(godoxPrice.price,42000);
assert.equal(godoxPrice.cardBenefitStatus,"none");
const notebookPrice=await priceContext.readDisplayedPrice(godox.productId,godox.itemId,godox.vendorItemId,1829000);
assert.equal(notebookPrice.ok,false);
assert.equal(notebookPrice.reason,"price-not-found");
const duplicateVendor=structuredClone(defaultTargets);
duplicateVendor[1].vendorItemId=duplicateVendor[0].vendorItemId;
assert.ok(catalogContext.validateProductCatalog(duplicateVendor).some(value=>value.includes("duplicate-vendor-item-id")));
const mismatchedUrl=structuredClone(defaultTargets);
mismatchedUrl[0].url=mismatchedUrl[0].url.replace(mismatchedUrl[0].vendorItemId,"99999999999");
assert.ok(catalogContext.validateProductCatalog(mismatchedUrl).some(value=>value.includes("coupang-url-identifiers-mismatch")));

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
  element("쿠폰할인 쿠폰할인 변경 -130,000원 와우전용 즉시할인 -80,000원 와우전용 쿠폰할인 변경 -147,800원 와우회원 총 추가 혜택 -227,800원")
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
assert.deepEqual(readCheckoutRows([
  element("쿠폰할인"),
  element("와우회원 총 추가 혜택 -166,790원 와우 전용 쿠폰할인 변경 -150,000원 와우 전용 카드 즉시할인 -16,790원 배송비 0원")
]),{
  regular:{status:"missing",amount:null},
  instant:{status:"missing",amount:null},
  coupon:{status:"captured",amount:150000},
  wowTotal:{status:"captured",amount:166790}
});
// An unparsed coupon must not borrow the following card discount's amount.
assert.equal(readCheckoutRows([
  element("와우 전용 쿠폰할인 변경 와우 전용 카드 즉시할인 -16,790원")
]).coupon.status,"unverified");
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
assert.equal(reconcile(30000,80000,150000,200000).status,"captured");
assert.equal(reconcile(null,null,150000,166790).status,"captured");
assert.equal(reconcile(null,null,150000,166790).wowTotal,150000);
assert.doesNotMatch(importer,/\$memberTotal\s*-ne\s*\$wowTotal|checkout-wow-total-mismatch/);
const corrections=JSON.parse(fs.readFileSync('scripts/history-corrections.json','utf8'));
assert.equal(corrections.length,1);
const audited=corrections[0];
assert.match(audited.sourceSha256,/^[a-f0-9]{64}$/);
assert.equal(audited.expected['수집결과'],'failed');
assert.equal(audited.corrected['수집결과'],'success');
assert.equal(audited.corrected['표시가']-audited.corrected['쿠폰할인 총금액'],audited.corrected['카드할인 전 가격']);
assert.equal(audited.corrected['카드할인 전 가격']-audited.corrected['카드할인'],audited.corrected['최종 실구매가']);
const historical={window:{}};
vm.runInNewContext(fs.readFileSync('dist/price-history.js','utf8'),historical);
const history=historical.window.MARKET_PULSE_HISTORY;
const auditedRows=history.rows.filter(row=>row[history.headers.indexOf('수집시각')]===audited.corrected['수집시각']&&row[history.headers.indexOf('MTM')]===audited.corrected.MTM);
assert.equal(auditedRows.length,1);
for(const [field,value] of Object.entries(audited.corrected)){
  assert.equal(auditedRows[0][history.headers.indexOf(field)],value,`Published history differs in ${field}`);
}
const acer={window:{}};
vm.runInNewContext(fs.readFileSync('brand/acer/market-data.js','utf8'),acer);
const auditedOffer=acer.window.MARKET_DATA.products.find(product=>product.mtm===audited.corrected.MTM)?.offers.find(offer=>offer.role==='mine');
assert.equal(auditedOffer.checkoutReprocessedFrom,`sha256:${audited.sourceSha256}`);
assert.equal(auditedOffer.finalPrice,audited.corrected['최종 실구매가']);
assert.equal(auditedOffer.alertEligible,true);

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
