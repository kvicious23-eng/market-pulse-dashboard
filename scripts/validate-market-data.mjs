import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const files=[];
const brandRoot=path.join(root,"brand");
if(fs.existsSync(brandRoot)){
  for(const entry of fs.readdirSync(brandRoot,{withFileTypes:true})){
    if(entry.isDirectory()){
      const relative=path.join("brand",entry.name,"market-data.js");
      if(fs.existsSync(path.join(root,relative))) files.push(relative);
    }
  }
}

const failures=[];
const finite=value=>Number.isFinite(value);
const fail=(file,message)=>failures.push(`${file}: ${message}`);
const soldOut=offer=>["buy-now-button-not-found","buy-now-button-sold-out"].includes(offer?.checkoutDiscountReason)||offer?.status==="품절";

for(const file of [...new Set(files)]){
  const source=fs.readFileSync(path.join(root,file),"utf8");
  const context={window:{}};
  try{vm.runInNewContext(source,context,{filename:file,timeout:1000});}
  catch(error){fail(file,`cannot parse market data: ${error.message}`);continue;}
  const data=context.window.MARKET_DATA;
  if(!data||!Array.isArray(data.products)){fail(file,"window.MARKET_DATA.products is missing");continue;}
  const ids=new Set();
  for(const product of data.products){
    const label=product.mtm||product.itemId||"unknown";
    if(!product.itemId) fail(file,`${label}: itemId is missing`);
    if(ids.has(String(product.itemId))) fail(file,`${label}: duplicate itemId ${product.itemId}`);
    ids.add(String(product.itemId));
    const mine=product.offers?.find(offer=>offer.role==="mine");
    if(!mine){fail(file,`${label}: mine offer is missing`);continue;}
    for(const offer of product.offers||[]){
      if(offer.role==="competitor"&&offer.alertEligible!==true&&offer.alertEligible!==false) {
        fail(file,`${label}: competitor eligibility must be explicitly true or false`);
      }
    }
    if(soldOut(mine)&&mine.alertEligible===true) fail(file,`${label}: sold-out offer cannot be alert eligible`);
    if(mine.alertEligible===true){
      if(mine.checkoutDiscountStatus!=="captured") fail(file,`${label}: eligible offer needs captured checkout discounts`);
      if(!["captured","none"].includes(mine.cardBenefitStatus)) fail(file,`${label}: eligible offer needs captured/none card status`);
      if(!finite(mine.finalPrice)||mine.finalPrice<0) fail(file,`${label}: eligible finalPrice is invalid`);
      if(finite(mine.preCardPrice)&&finite(mine.cardDiscount)&&mine.finalPrice!==mine.preCardPrice-mine.cardDiscount) {
        fail(file,`${label}: finalPrice does not equal preCardPrice minus cardDiscount`);
      }
    }
    if(mine.checkoutDiscountStatus==="captured"){
      if(mine.checkoutCouponSource!=="checkout") fail(file,`${label}: available-product coupons must come from checkout`);
      const layers=[mine.checkoutCouponDiscount,mine.wowInstantDiscount,mine.wowCouponDiscount];
      if(!layers.every(value=>finite(value)&&value>=0)) fail(file,`${label}: captured checkout layers are incomplete`);
      if(finite(mine.observedListPrice)&&finite(mine.preCardPrice)){
        const expected=mine.observedListPrice-(mine.preCardPrice-(finite(mine.shipping)?mine.shipping:0));
        const total=layers.reduce((sum,value)=>sum+value,0);
        if(expected!==total) fail(file,`${label}: checkout layers ${total} do not equal displayed discount ${expected}`);
      }
    }
    if(soldOut(mine)&&finite(mine.observedListPrice)&&finite(mine.productPagePrice)){
      if(mine.observedListPrice<mine.productPagePrice) fail(file,`${label}: product-page price exceeds displayed basis price`);
    }
    if(soldOut(mine)&&finite(mine.productPagePrice)){
      if(finite(mine.checkoutCouponDiscount)||finite(mine.couponDiscount)) fail(file,`${label}: sold-out offer cannot infer coupon discounts without checkout`);
      if(mine.checkoutCouponSource) fail(file,`${label}: sold-out offer cannot claim a checkout coupon source`);
      if(finite(mine.wowInstantDiscount)||finite(mine.wowCouponDiscount)) fail(file,`${label}: sold-out offer cannot have current checkout WOW discounts`);
      if(finite(mine.preCardPrice)) fail(file,`${label}: sold-out offer cannot have a current pre-card price`);
    }
    if(mine.cardBenefitStatus==="captured"){
      if(!/^(?:dom|dom-snapshot|accessibility)(?:\+(?:dom|dom-snapshot|accessibility))*$/.test(mine.cardEvidenceSource||"")) fail(file,`${label}: card evidence must come from the product page`);
      if(!finite(mine.cardRate)||mine.cardRate<=0||mine.cardRate>100) fail(file,`${label}: captured cardRate is invalid`);
      if(!Array.isArray(mine.cardProviders)||mine.cardProviders.filter(Boolean).length===0) fail(file,`${label}: captured card providers are missing`);
      if(finite(mine.cardDiscount)){
        const basis=soldOut(mine)?mine.productPagePrice:finite(mine.preCardPrice)?mine.preCardPrice-(finite(mine.shipping)?mine.shipping:0):null;
        if(!finite(basis)) fail(file,`${label}: captured cardDiscount needs a verified price basis`);
        else {
        const terms=Array.isArray(mine.cardTerms)&&mine.cardTerms.length?mine.cardTerms:[{rate:mine.cardRate,maxDiscount:mine.cardMaxDiscount,providers:mine.cardProviders}];
        for(const term of terms){
          if(!finite(term.rate)||term.rate<=0||term.rate>100||!Array.isArray(term.providers)||!term.providers.some(Boolean)) fail(file,`${label}: invalid card term`);
        }
        const expected=Math.max(...terms.map(term=>{
          const calculated=Math.floor(basis*term.rate/100);
          return finite(term.maxDiscount)&&term.maxDiscount>0?Math.min(calculated,term.maxDiscount):calculated;
        }));
        if(mine.cardDiscount!==expected) fail(file,`${label}: cardDiscount ${mine.cardDiscount} does not equal ${expected}`);
        if(!terms.some(term=>term.rate===mine.cardRate&&term.maxDiscount===mine.cardMaxDiscount&&
          JSON.stringify(term.providers)===JSON.stringify(mine.cardProviders)&&
          Math.min(Math.floor(basis*term.rate/100),finite(term.maxDiscount)?term.maxDiscount:Infinity)===expected))
          fail(file,`${label}: selected card is not a maximum-discount term`);
        }
      }
    }
    if(mine.cardBenefitStatus==="none"&&finite(mine.cardDiscount)&&mine.cardDiscount!==0) {
      fail(file,`${label}: no-card-benefit offer must have a zero card discount`);
    }
    if("inventory" in product||"inventory" in mine||"stock" in product||"stock" in mine) fail(file,`${label}: inventory fields are not allowed`);
  }
}
if(failures.length){
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Validated ${files.length} market-data file(s).`);
