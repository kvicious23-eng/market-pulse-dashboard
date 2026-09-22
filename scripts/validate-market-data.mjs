import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const files=["dist/market-data.js","acer/market-data.js"];
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
    if(soldOut(mine)&&mine.alertEligible===true) fail(file,`${label}: sold-out offer cannot be alert eligible`);
    if(mine.alertEligible===true){
      if(mine.checkoutDiscountStatus!=="captured") fail(file,`${label}: eligible offer needs captured checkout discounts`);
      if(!["captured","none"].includes(mine.cardBenefitStatus)) fail(file,`${label}: eligible offer needs captured/none card status`);
      if(!finite(mine.finalPrice)||mine.finalPrice<0) fail(file,`${label}: eligible finalPrice is invalid`);
    }
    if(mine.checkoutDiscountStatus==="captured"){
      const layers=[mine.checkoutCouponDiscount,mine.wowInstantDiscount,mine.wowCouponDiscount];
      if(!layers.every(value=>finite(value)&&value>=0)) fail(file,`${label}: captured checkout layers are incomplete`);
      if(finite(mine.observedListPrice)&&finite(mine.preCardPrice)){
        const expected=mine.observedListPrice-(mine.preCardPrice-(finite(mine.shipping)?mine.shipping:0));
        const total=layers.reduce((sum,value)=>sum+value,0);
        if(expected!==total) fail(file,`${label}: checkout layers ${total} do not equal displayed discount ${expected}`);
      }
    }
    if(finite(mine.observedListPrice)&&finite(mine.productPagePrice)){
      const expectedGeneral=mine.observedListPrice-mine.productPagePrice;
      if(expectedGeneral<0) fail(file,`${label}: product-page price exceeds displayed basis price`);
      if(mine.checkoutCouponDiscount!==expectedGeneral) fail(file,`${label}: general coupon ${mine.checkoutCouponDiscount} does not equal product-page discount ${expectedGeneral}`);
    }
    if(soldOut(mine)&&finite(mine.productPagePrice)){
      if(finite(mine.wowInstantDiscount)||finite(mine.wowCouponDiscount)) fail(file,`${label}: sold-out offer cannot have current checkout WOW discounts`);
      if(finite(mine.preCardPrice)) fail(file,`${label}: sold-out offer cannot have a current pre-card price`);
    }
    if(mine.cardBenefitStatus==="captured"){
      if(!finite(mine.cardRate)||mine.cardRate<=0||mine.cardRate>100) fail(file,`${label}: captured cardRate is invalid`);
      if(!Array.isArray(mine.cardProviders)||mine.cardProviders.filter(Boolean).length===0) fail(file,`${label}: captured card providers are missing`);
      if(finite(mine.preCardPrice)&&finite(mine.cardDiscount)){
        const itemPrice=mine.preCardPrice-(finite(mine.shipping)?mine.shipping:0);
        const calculated=Math.floor(itemPrice*mine.cardRate/100);
        const expected=finite(mine.cardMaxDiscount)&&mine.cardMaxDiscount>0?Math.min(calculated,mine.cardMaxDiscount):calculated;
        if(mine.cardDiscount!==expected) fail(file,`${label}: cardDiscount ${mine.cardDiscount} does not equal ${expected}`);
      }
    }
    if("inventory" in product||"inventory" in mine||"stock" in product||"stock" in mine) fail(file,`${label}: inventory fields are not allowed`);
  }
}
if(failures.length){
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Validated ${files.length} market-data file(s).`);
