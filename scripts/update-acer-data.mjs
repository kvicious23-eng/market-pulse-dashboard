import fs from "node:fs/promises";

const FILE = new URL("../acer/market-data.js", import.meta.url);
const mode = process.env.SCAN_MODE || "precision";
const now = new Date();
const stamp = new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(now).replace(" ","T")+"+09:00";
const display = new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
const raw=await fs.readFile(FILE,"utf8");
const data=Function('"use strict";return ('+raw.replace(/^window\.MARKET_DATA\s*=\s*/,"").replace(/;\s*$/,"")+")")();

async function fetchText(url){
 const r=await fetch(url,{redirect:"follow",headers:{"user-agent":"Mozilla/5.0 (compatible; AcerMarketPulse/1.0)","accept-language":"ko-KR,ko;q=0.9"},signal:AbortSignal.timeout(25000)});
 if(!r.ok) throw new Error(String(r.status));
 return r.text();
}
function pricesNear(html,needle){
 const text=html.replace(/&quot;/g,'"').replace(/&#44;/g,",");
 const p=text.toUpperCase().indexOf(String(needle).toUpperCase());
 if(p<0) return [];
 const scope=text.slice(Math.max(0,p-120000),p+240000);
 const vals=[];
 for(const m of scope.matchAll(/(?:finalPrice|salePrice|lowPrice|price)[\"'\s:=]+[\"']?([0-9]{5,9})/gi)){
  const n=Number(m[1]); if(n>=250000&&n<=7000000) vals.push(n);
 }
 return [...new Set(vals)].sort((a,b)=>a-b);
}
let attempts=0,successes=0;
for(const product of data.products){
 const mine=product.offers.find(x=>x.role==="mine");
 attempts++;
 try{
  const html=await fetchText(mine.url);
  const exact=html.includes(String(product.itemId));
  const prices=exact?pricesNear(html,product.itemId):[];
  if(prices.length){
   mine.displayPrice=prices[0]; mine.finalPrice=prices[0]; mine.status="판매 확인";
   mine.checkedAt=display; mine.confidence="A"; mine.confidenceText="동일 Item ID와 가격을 자동 확인";
   successes++;
  }else if(exact){
   mine.status="상품 확인·가격 제한"; mine.checkedAt=display;
   mine.confidenceText="동일 Item ID 확인, 로그인·와우 가격은 미반영"; successes++;
  }
 }catch{}

 const checks=await Promise.all(product.references.map(async ref=>{
  attempts++;
  try{
   const html=await fetchText(ref.url);
   const prices=pricesNear(html,product.mtm);
   if(!prices.length) return null;
   return {ref,price:prices[0]};
  }catch{return null;}
 }));
 for(const found of checks.filter(Boolean)){
  const {ref,price}=found;
  ref.status="현재가 확인"; ref.displayPrice=price; ref.finalPrice=price; ref.referencePrice=price;
  ref.checkedAt=display; ref.confidence="B"; ref.confidenceText="정확한 MTM과 가격을 검색 결과에서 재확인";
  let offer=product.offers.find(x=>x.sourceType===ref.sourceType);
  if(!offer){ offer={...ref,role:"competitor"}; product.offers.push(offer); }
  else Object.assign(offer,{...ref,role:"competitor"});
  successes++;
 }
}
data.meta.snapshotAt=stamp;
data.meta.monitoring.lastAttemptAt=stamp;
data.meta.monitoring.lastAttemptStatus=successes?"success":"partial";
data.meta.monitoring.lastAttemptText=`Acer ${mode} 조사 완료 · ${attempts}개 확인 중 ${successes}개 검증 · 나머지는 마지막 검증값 유지`;
await fs.writeFile(FILE,"window.MARKET_DATA = "+JSON.stringify(data,null,2)+";\n");
console.log(`Acer scan ${successes}/${attempts} at ${stamp}`);
