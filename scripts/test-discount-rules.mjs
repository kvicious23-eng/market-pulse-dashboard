import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Windows PowerShell 5.1 reads BOM-less .ps1 files as the system ANSI code page.
for (const path of ["scripts/apply-history-corrections.ps1", "scripts/local-coupang-scan.ps1", "scripts/test-history-corrections.ps1"]) {
  const bytes = fs.readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${path} must have a UTF-8 BOM for Windows PowerShell 5.1`);
}

const source=fs.readFileSync("chrome-extension/background.js","utf8");
const manifest=JSON.parse(fs.readFileSync("chrome-extension/manifest.json","utf8"));
const importer=fs.readFileSync("scripts/import-extension-results.ps1","utf8");
const scheduleScript=fs.readFileSync("scripts/set-local-schedule.ps1","utf8");
const dashboard=fs.readFileSync("dist/app.js","utf8");
const lenovoRefresh=fs.readFileSync("scripts/update-market-data.mjs","utf8");
const acerRefresh=fs.readFileSync("scripts/update-acer-data.mjs","utf8");
assert.equal(manifest.version,"1.9.31");
// The uppermost rendered price wins, even if a lower price is crossed out.
const readPriceStart=source.indexOf("async function readDisplayedPrice(");
const readPriceEnd=source.indexOf("\nfunction snapshotCardDetailText(",readPriceStart);
assert.ok(readPriceStart>=0&&readPriceEnd>readPriceStart);
const makePriceNode=(value,top,tagName="SPAN",className="prod-price")=>({
  textContent:value,tagName,className,parentElement:{innerText:value,className:"prod-price"},
  getAttribute:()=>null,closest:()=>null,getBoundingClientRect:()=>({top,left:40,width:85,height:20})
});
async function readC100Basis(upperTop,withTitle=true,withCurrent=true) {
  const title=makePriceNode("Godox C100",50);
  const primary=makePriceNode("41,160원",120,"STRONG","price-value");
  const upper=makePriceNode("75,400원",upperTop,"DEL","origin-price");
  const remote=makePriceNode("1,249,570원",720,"DEL","origin-price");
  const doc={title:"Godox C100",body:{innerText:"C100 41,160원 일시품절"},querySelectorAll(selector){
    if(selector==="strong.price-value") return withCurrent?[primary]:[];
    if(selector==='h1,.prod-buy-header__title,[class*="prod-buy-header__title"]') return withTitle?[title]:[];
    if(selector==="strong,span,em,b,del,s,p,div,[data-price]") return withCurrent?[primary,upper,remote]:[upper,remote];
    if(selector==='script[type="application/ld+json"]') return [{textContent:JSON.stringify({"@type":"Product",offers:{"@type":"Offer",price:41160,priceSpecification:{"@type":"UnitPriceSpecification",price:999999}}})}];
    return [];
  }};
  const ctx={document:doc,location:{href:"https://www.coupang.com/vp/products/9738958594?itemId=29147698397&vendorItemId=96070924334"},
    URL,getComputedStyle:()=>({display:"block",visibility:"visible",textDecorationLine:"none"}),scrollY:0,scrollX:0};
  vm.runInNewContext(`${source.slice(readPriceStart,readPriceEnd)};this.readDisplayedPrice=readDisplayedPrice;`,ctx);
  return ctx.readDisplayedPrice("9738958594","29147698397","96070924334",42000);
}
const lowerStrike=await readC100Basis(145);
assert.equal(lowerStrike.strikePrice,41160);
assert.equal(lowerStrike.priceBasisType,"top-visible");
assert.equal(lowerStrike.priceBasisSource,"visible-product-price");
assert.equal(lowerStrike.basisEvidence.top,120);
const upperStrike=await readC100Basis(80);
assert.equal(upperStrike.strikePrice,75400);
assert.equal(upperStrike.priceBasisType,"crossed-out");
assert.equal(upperStrike.basisEvidence.top,80);
assert.equal((await readC100Basis(80,false)).strikePrice,null);
assert.equal((await readC100Basis(80,true,false)).strikePrice,null);
assert.match(importer,/\$visualBasisValid=/);
const timeoutStart=source.indexOf("async function withScanTimeout(");
const timeoutEnd=source.indexOf("\n\nfunction localDay",timeoutStart);
assert.ok(timeoutStart>=0&&timeoutEnd>timeoutStart,"scan timeout helper was not found");
const timeoutContext={Promise,setTimeout,clearTimeout,Error};
vm.runInNewContext(`${source.slice(timeoutStart,timeoutEnd)};this.withScanTimeout=withScanTimeout;`,timeoutContext);
assert.equal(await timeoutContext.withScanTimeout(Promise.resolve('completed'),50,'fast-step'),'completed');
await assert.rejects(timeoutContext.withScanTimeout(new Promise(()=>{}),10,'stalled-step'),/scan-timeout:stalled-step/);
const openTabStart=source.indexOf("async function openScanTab(");
const openTabEnd=source.indexOf("\n\nasync function waitForScanDownload",openTabStart);
assert.ok(openTabStart>=0&&openTabEnd>openTabStart,"window recovery helper was not found");
const createdTabs=[];
const windowState={windowId:null,anchorTabIds:[]};
let openedWindows=0;
const tabContext={Number,Error,withScanTimeout:promise=>promise,
  chrome:{tabs:{
    create:async spec=>{createdTabs.push(spec);if(createdTabs.length===1) throw new Error('No current window');return {id:20+createdTabs.length};},
    query:async()=>[{id:15}]
  },windows:{create:async()=>{openedWindows++;return {id:42,tabs:[{id:15}]};}}}};
vm.runInNewContext(`${source.slice(openTabStart,openTabEnd)};this.openScanTab=openScanTab;`,tabContext);
assert.equal((await tabContext.openScanTab('https://www.coupang.com/one','first',windowState)).id,22);
assert.equal((await tabContext.openScanTab('https://www.coupang.com/two','second',windowState)).id,23);
assert.equal(openedWindows,1);
assert.equal(createdTabs[1].windowId,42);
assert.equal(createdTabs[2].windowId,42);
assert.deepEqual(windowState.anchorTabIds,[15]);
const downloadStart=source.indexOf("async function waitForScanDownload(");
const downloadEnd=source.indexOf("\n\nfunction localDay",downloadStart);
assert.ok(downloadStart>=0&&downloadEnd>downloadStart,"download completion check was not found");
const downloadStates=[{state:'in_progress'},{state:'complete'}];
const downloadContext={Number,Error,wait:async()=>{},withScanTimeout:promise=>promise,
  chrome:{downloads:{search:async()=>[downloadStates.shift()]}}};
vm.runInNewContext(`${source.slice(downloadStart,downloadEnd)};this.waitForScanDownload=waitForScanDownload;`,downloadContext);
assert.equal((await downloadContext.waitForScanDownload(42)).state,'complete');
downloadContext.chrome.downloads.search=async()=>[{state:'interrupted',error:'NETWORK_FAILED'}];
await assert.rejects(downloadContext.waitForScanDownload(43),/scan-download-interrupted:NETWORK_FAILED/);
const scanRequestStart=source.indexOf("let activeScanPromise=null;");
const scanRequestEnd=source.indexOf("\n\nchrome.runtime.onInstalled",scanRequestStart);
assert.ok(scanRequestStart>=0&&scanRequestEnd>scanRequestStart,"scan request guard was not found");
const scanResolvers=[];
const scanRequests=[];
const slot08='2026-09-25T08:00+09:00',slot14='2026-09-25T16:00+09:00';
const scanContext={scanAll:slot=>{scanRequests.push(slot);return new Promise(resolve=>scanResolvers.push(resolve));},
  currentScheduledScanSlot:()=>slot14,recentScanSlot:()=>true};
vm.runInNewContext(`${source.slice(scanRequestStart,scanRequestEnd)};this.requestScan=requestScan;`,scanContext);
assert.equal(scanContext.requestScan(slot08),true);
assert.equal(scanContext.requestScan(slot08),false);
assert.equal(scanContext.requestScan(slot14),false);
assert.deepEqual(scanRequests,[slot08]);
scanResolvers.shift()();
await new Promise(resolve=>setTimeout(resolve,0));
assert.deepEqual(scanRequests,[slot08,slot14],"the missed afternoon slot starts after the morning scan");
scanResolvers.shift()();
await new Promise(resolve=>setTimeout(resolve,0));
const scheduleStart=source.indexOf("function kstDateTimeParts(");
const scheduleEnd=source.indexOf("\n\nfunction enterCheckoutDiagnostic",scheduleStart);
assert.ok(scheduleStart>=0&&scheduleEnd>scheduleStart,"scheduled alarm guard was not found");
const scheduledAt=[];
const fixedTime=Date.parse('2026-09-25T04:59:59.500Z');
class FixedDate extends Date {
  constructor(...args){super(...(args.length?args:[fixedTime]));}
  static now(){return fixedTime;}
}
const scheduleContext={Date:FixedDate,Intl,Object,String,Number,
  SCHEDULED_SCAN_TIMES:[{alarm:'daily-scan-1600',hour:16,minute:0,slot:'16:00'}],
  chrome:{alarms:{clear:async()=>{},create:async(_name,config)=>scheduledAt.push(config.when)}}};
vm.runInNewContext(`${source.slice(scheduleStart,scheduleEnd)};this.scheduleEntry=scheduleEntry;this.recentScanSlot=recentScanSlot;`,scheduleContext);
await scheduleContext.scheduleEntry(scheduleContext.SCHEDULED_SCAN_TIMES[0]);
assert.equal(scheduledAt[0],Date.parse(slot14),"the next alarm must fire at exactly 16:00 KST");
assert.equal(scheduleContext.recentScanSlot(slot14,Date.parse(slot14)+75*60*1000),true);
assert.equal(scheduleContext.recentScanSlot(slot14,Date.parse(slot14)+75*60*1000+1),false);
const listenerStart=source.indexOf('chrome.runtime.onInstalled.addListener(');
const listenerEnd=source.indexOf('chrome.action.onClicked.addListener(',listenerStart);
assert.ok(listenerStart>=0&&listenerEnd>listenerStart);
const edgeHandlers={},edgeAlarms=[];
const edgeContext={isEdgeBrowser:true,SCHEDULED_SCAN_TIMES:[{alarm:'daily-scan-0800'},{alarm:'daily-scan-1400'}],
  chrome:{runtime:{onInstalled:{addListener:fn=>edgeHandlers.install=fn},onStartup:{addListener:fn=>edgeHandlers.startup=fn}},
    alarms:{clear:async name=>edgeAlarms.push(name),onAlarm:{addListener:fn=>edgeHandlers.alarm=fn}},
    storage:{local:{get:async()=>({lastRunSlot:null}),set:async()=>{}}}},
  schedule:async()=>{throw Error('Edge must not schedule scans');},requestScan:()=>{throw Error('Edge must not run scheduled scans');}};
vm.runInNewContext(source.slice(listenerStart,listenerEnd),edgeContext);
await edgeHandlers.install();
await edgeHandlers.startup();
edgeHandlers.alarm({name:'daily-scan-0800'});
assert.equal(edgeAlarms.length,6,'Edge clears current and retired alarms on install and startup');
assert.match(source,/daily-scan-0800/);
assert.match(source,/daily-scan-1400/);
assert.match(source,/lastRunSlot/);
assert.match(scheduleScript,/New-ScheduledTaskTrigger -Daily -At "08:00"/);
for(const hour of [12,16,20]) assert.ok(scheduleScript.includes(`New-ScheduledTaskTrigger -Daily -At "${hour}:00"`));
assert.match(scheduleScript,/New-ScheduledTaskTrigger -Daily -At "08:30"/);
for(const hour of [12,16,20]) assert.ok(scheduleScript.includes(`New-ScheduledTaskTrigger -Daily -At "${hour}:30"`));
assert.doesNotMatch(scheduleScript,/New-ScheduledTaskTrigger -Daily -At "14:/);
assert.match(scheduleScript,/-WindowStyle Hidden/);
assert.match(source,/version:5,/);
assert.match(source,/actualProductId!==String\(expectedProductId\).*actualItemId!==String\(expectedItemId\).*actualVendorItemId!==String\(expectedVendorItemId\)/s);
assert.match(source,/args:\[target\.productId,target\.itemId,target\.vendorItemId\]/);
assert.match(source,/checkoutCouponSource:'checkout'/);
assert.doesNotMatch(source,/product-page-soldout|checkoutProductDiscount/);
assert.match(source,/checkoutCouponDiscount:null,checkoutCouponSource:null/);
assert.match(importer,/payload\.version -ne 5/);
assert.match(importer,/extensionVersion -lt \[version\]'1\.9\.18'/);
assert.match(importer,/extensionVersion -eq \[version\]'1\.9\.19'/);
assert.doesNotMatch(importer,/pre-card-price-does-not-match-product-page|\$wowCouponEvidence/);
assert.match(importer,/\$preCardItemPrice\*\[decimal\]\$_.rate\/100/);
assert.match(importer,/Sort-Object -Property amount -Descending/);
assert.match(source,/cardTerms:terms|cardTerms,/);
assert.match(importer,/\$cardSource -match/);
assert.match(importer,/scan duration exceeds the three-hour safety limit/i);
assert.match(importer,/Duplicate vendorItemId values/);
assert.match(fs.readFileSync("scripts/brand-lifecycle.ps1","utf8"),/Brand URL names collide/);
assert.match(importer,/\$minimumPrice=if \(\$null -ne \$product\.srp.*-lt 250000\) \{10000\} else \{250000\}/);
assert.match(importer,/\$result\.price -ge \$minimumPrice/);
assert.doesNotMatch(source,/recheckAvailabilityAfterCheckout|availabilityRecheck/);
assert.doesNotMatch(importer,/availabilityRecheck/);
assert.match(importer,/\$result\.checkoutDiscountStatus -eq 'captured' -and \$result\.checkoutDiscountCapturedAt/);
assert.match(importer,/availabilityReportAt'\)/);
assert.match(importer,/NotePropertyName publishedAt/);
assert.match(importer,/\$safeBrand \$safeCategory · Korea/);
assert.match(importer,/Add-Member -NotePropertyName competitionLastAttemptAt -NotePropertyValue \$scanKst -Force/);
assert.match(importer,/\$visualBasisValid=/);
assert.match(dashboard,/categories\.length===1\?categories\[0\]:"Products"/);
assert.match(importer,/\$null -eq \$result\.cardDiscount -or \[long\]\$result\.cardDiscount -ne \$pageBest\.amount/);
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
assert.match(importer,/\$historyCollectionSucceeded=\$alertEligible -or \$checkoutStatus -eq 'soldout'/);
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
assert.equal(defaultTargets.length,15,"A fresh browser profile must include all 15 active products");
const godox={brand:"Godox",category:"Camera",mtm:"C100",srp:42000,enabled:true,
  productId:"9738958594",itemId:"29147698397",vendorItemId:"96070924334",
  url:"https://www.coupang.com/vp/products/9738958594?itemId=29147698397&vendorItemId=96070924334"};
assert.equal(defaultTargets.filter(target=>target.brand==="Godox"&&target.mtm==="C100").length,1);
assert.equal(defaultTargets.find(target=>target.itemId===godox.itemId)?.url,godox.url);
assert.deepEqual(JSON.parse(JSON.stringify(catalogContext.validateProductCatalog([...defaultTargets,godox]))),["C100:duplicate-item-id","C100:duplicate-vendor-item-id","C100:duplicate-brand-mtm"]);
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
const originalQuery=priceContext.document.querySelectorAll;
priceContext.document.querySelectorAll=selector=>selector==='.origin-price'
  ? [{textContent:"1,249,570원",getBoundingClientRect:()=>({top:900,left:40,width:75,height:20})}]:originalQuery(selector);
const unrelatedStrike=await priceContext.readDisplayedPrice(godox.productId,godox.itemId,godox.vendorItemId,godox.srp);
assert.equal(unrelatedStrike.price,42000);
assert.equal(unrelatedStrike.strikePrice,null);
assert.equal(unrelatedStrike.priceBasisType,null);
priceContext.document.querySelectorAll=originalQuery;
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
assert.equal(corrections.length,7);
assert.doesNotMatch(importer,/\$productPagePrice - \$preCardItemPrice -eq \$wowCoupon/);
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
assert.ok(auditedRows.some(row=>Object.entries(audited.corrected)
  .every(([field,value])=>row[history.headers.indexOf(field)]===value)),
  "The audited corrected row must remain in published history.");
const acer={window:{}};
vm.runInNewContext(fs.readFileSync('brand/acer/market-data.js','utf8'),acer);
const auditedOffer=acer.window.MARKET_DATA.products.find(product=>product.mtm===audited.corrected.MTM)?.offers.find(offer=>offer.role==='mine');
if(acer.window.MARKET_DATA.meta.snapshotAt===audited.corrected['수집시각']) {
  assert.equal(auditedOffer.checkoutReprocessedFrom,`sha256:${audited.sourceSha256}`);
  assert.equal(auditedOffer.preCardPrice-auditedOffer.cardDiscount,auditedOffer.finalPrice);
  assert.equal(auditedOffer.alertEligible,true);
}
const auditedGodox={window:{}};
vm.runInNewContext(fs.readFileSync('brand/godox/market-data.js','utf8'),auditedGodox);
for(const correction of corrections.slice(1)){
  assert.equal(correction.originalExtensionVersion,"1.9.15");
  assert.equal(correction.corrected['수집결과'],'success');
  const matches=history.rows.filter(row=>row[history.headers.indexOf('수집시각')]===correction.corrected['수집시각']&&row[history.headers.indexOf('MTM')]===correction.corrected.MTM);
  assert.ok(matches.some(row=>Object.entries(correction.corrected)
    .every(([field,value])=>row[history.headers.indexOf(field)]===value)),
    `Published history is missing the corrected ${correction.corrected.MTM} row.`);
  const currentData=correction.corrected['브랜드']==='Godox'?auditedGodox.window.MARKET_DATA:acer.window.MARKET_DATA;
  if(currentData.meta.snapshotAt===correction.corrected['수집시각']) {
    const offer=currentData.products.find(product=>product.mtm===correction.corrected.MTM)?.offers.find(item=>item.role==='mine');
    assert.equal(offer.checkoutReprocessedFrom,`sha256:${correction.sourceSha256}`);
    if(correction.corrected['상태']==='품절'){
      assert.equal(offer.checkoutCouponDiscount,null);
      assert.equal(offer.checkoutCouponSource,null);
      assert.equal(offer.couponDiscount,null);
      assert.equal(offer.alertEligible,false);
    }else{
      assert.equal(offer.checkoutCouponSource,'checkout');
      assert.equal(offer.finalPrice,correction.corrected['최종 실구매가']);
      assert.equal(offer.alertEligible,true);
    }
  }
}


const calculateAvailable=({display,general,wowInstant,wowCoupon,cardRate=0,cardCap=null})=>{
  const preCard=display-general-wowInstant-wowCoupon;
  const calculated=Math.floor(preCard*cardRate/100);
  const card=Number.isFinite(cardCap)?Math.min(calculated,cardCap):calculated;
  return {general,preCard,card,final:preCard-card};
};

const calculateSoldOut=({productPage,cardRate=0,cardCap=null})=>({
  general:null,
  preCard:null,
  card:cardRate?Math.min(Math.floor(productPage*cardRate/100),cardCap??Infinity):null,
  final:null
});

assert.deepEqual(
  calculateSoldOut({display:2369000,productPage:2159000}),
  {general:null,preCard:null,card:null,final:null}
);
assert.deepEqual(
  calculateSoldOut({productPage:950000,cardRate:2,cardCap:10000}),
  {general:null,preCard:null,card:10000,final:null}
);
assert.equal(calculateAvailable({display:1000000,general:100000,wowInstant:50000,wowCoupon:30000,cardRate:8,cardCap:10000}).card,10000);
assert.deepEqual(
  calculateAvailable({display:1558000,general:30000,wowInstant:80000,wowCoupon:150000,cardRate:8,cardCap:109060}),
  {general:30000,preCard:1298000,card:103840,final:1194160}
);

const godoxData={window:{}};
vm.runInNewContext(fs.readFileSync('brand/godox/market-data.js','utf8'),godoxData);
const godoxMine=godoxData.window.MARKET_DATA.products.find(product=>product.mtm==='C100')?.offers.find(offer=>offer.role==='mine');
const godoxRows=history.rows.filter(row=>row[history.headers.indexOf('브랜드')]==='Godox'&&row[history.headers.indexOf('MTM')]==='C100');
assert.ok(godoxRows.length>=1);
const newestGodoxRow=godoxRows.at(-1);
const morningGodoxRow=godoxRows.find(row=>row[history.headers.indexOf('수집시각')]==='2026-09-24T08:19:16+09:00');
assert.equal(morningGodoxRow?.[history.headers.indexOf('최종 실구매가')],41160);
if(!godoxMine) {
  assert.ok(!godoxData.window.MARKET_DATA.products.some(product=>product.mtm==='C100'), 'Removed C100 must not remain current');
} else if(godoxMine.availabilityReportSource==='operator') {
  assert.equal(godoxMine.status,'품절 제보 · 재확인 필요');
  assert.equal(godoxMine.alertEligible,false);
  assert.ok(Date.parse(godoxMine.availabilityReportAt)>Date.parse(godoxData.window.MARKET_DATA.meta.snapshotAt));
} else {
  assert.equal(godoxMine.status,newestGodoxRow[history.headers.indexOf('상태')]);
  assert.ok(Date.parse(godoxData.window.MARKET_DATA.meta.publishedAt)>=Date.parse(godoxData.window.MARKET_DATA.meta.snapshotAt));
}
if(godoxMine.status==='품절') {
  assert.equal(godoxMine.checkoutCouponDiscount,null);
  assert.equal(godoxMine.checkoutCouponSource,null);
  assert.equal(godoxMine.alertEligible,false);
  assert.ok(['buy-now-button-not-found','buy-now-button-sold-out'].includes(godoxMine.checkoutDiscountReason));
  assert.equal(newestGodoxRow[history.headers.indexOf('최종 실구매가')],'');
}

console.log("Discount source and calculation rules passed.");
await import('./test-checkout-navigation.mjs');
