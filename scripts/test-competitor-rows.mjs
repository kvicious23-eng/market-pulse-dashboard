import {readTestFile} from './test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const source=readTestFile('chrome-extension/background.js','utf8');
const start=source.indexOf('function readDanawaSellers(');
const end=source.indexOf('\n\nasync function scanAll(',start);
function row(label,seller='판매처A',recommended=false) {
  return {innerText:label,closest:()=>recommended?{}:null,querySelector:()=>null,
    querySelectorAll:()=>[{getAttribute:()=>seller}]};
}
function scan(rows,{title='Acer MTM123 정품',section=true,body='Acer MTM123'}={}) {
  const root={querySelectorAll:()=>rows};
  const heading={textContent:'쇼핑몰별 최저가',parentElement:{parentElement:root}};
  const document={title,body:{innerText:body},querySelector:()=>({textContent:title}),
    querySelectorAll:()=>section?[heading]:[]};
  const context={document};
  vm.runInNewContext(source.slice(start,end)+';this.scan=readDanawaSellers;',context);
  return context.scan('MTM123',1000000);
}
assert.equal(scan([row('500,000원 무료배송')]).sellers[0].shipping,0);
const paid=scan([row('500,000원 3,000원 최대 15개월')]).sellers[0];
assert.equal(paid.price+paid.shipping,503000);
assert.equal(paid.shippingStatus,'verified');
assert.equal(paid.matchedMtm,'MTM123');
assert.equal(scan([row('500,000원')]).sellers.length,0,'Unknown delivery must not become zero');
assert.equal(scan([row('500,000원 무료배송')],{section:false}).reason,'seller-section-not-found');
assert.equal(scan([row('500,000원 무료배송')],{title:'애플 맥북',body:'추천 Acer MTM123'}).reason,'mtm-mismatch');
assert.equal(scan([row('삼성 노트북 990,000원 무료배송','삼성 NT761XDA 노트북')]).sellers.length,0);
assert.equal(scan([row('500,000원 무료배송','판매처A',true)]).sellers.length,0);
assert.equal(scan([row('이런 상품 어때요 500,000원 무료배송')]).sellers.length,0);
assert.equal(scan([row('500,000원 착불 무료배송')]).sellers.length,0);

// Enuri card prices are excluded from the base price; the paid delivery remains included.
const ctx={document:{title:'Godox C100 정품',body:{innerText:''},querySelector:()=>({textContent:'Godox C100 정품'}),
  querySelectorAll:()=>[{innerText:'Godox C100 43,110원 G마켓삼성카드 41,610원 3,000원 구매하기',
    querySelectorAll:()=>[{alt:'Godox C100 정품'},{alt:'G마켓 로고'}]}]}};
vm.runInNewContext(source.slice(start,end)+';this.scan=readEnuriSellers;',ctx);
const entry=ctx.scan('Godox','C100',42000).sellers[0];
assert.equal(entry.price,43110);
assert.equal(entry.shipping,3000);

// Prevent legacy/snapshot mismatches from passing deployment again.
const app=readTestFile('dist/app.js','utf8');
const a=app.indexOf('function effectiveCompetitorPrice('),b=app.indexOf('\n\n  function isSoldOut(',a);
const appCtx={effectiveFinalPrice:x=>x.finalPrice,collectionDay:x=>x.priceCheckedAt.slice(0,10)};
vm.runInNewContext(app.slice(a,b)+';this.price=effectiveCompetitorPrice;',appCtx);
const base={displayPrice:42000,shipping:3000,finalPrice:45000,competitionPolicyVerified:true,
  sellerRowVerified:true,shippingStatus:'verified',priceCheckedAt:'2026-10-01 14:00'};
assert.equal(appCtx.price(base,base),45000);
assert.equal(appCtx.price({...base,finalPrice:42000},base),null);
assert.equal(appCtx.price({...base,sellerRowVerified:false},base),null);
assert.equal(appCtx.price(base,{...base,priceCheckedAt:'2026-10-02 08:00'}),null);
const importer=readTestFile('scripts/import-extension-results.ps1','utf8');
assert.match(importer,/price=\(\$price\+\$shipping\)/);
assert.match(importer,/\$entry\.sellerRowVerified -ne \$true/);
assert.match(importer,/if\(\$rowKey -in \$excludedKeys\)\{continue\}/);
const exclusion=JSON.parse(readTestFile('scripts/competitor-history-exclusions.json','utf8'));
const historySource=readTestFile('dist/competitor-price-history.js','utf8');
const history=JSON.parse(historySource.slice(historySource.indexOf('=')+1).trim().replace(/;$/,''));
const indices=['수집시각','브랜드','MTM','비교 사이트','판매처','가격','상품 URL'].map(k=>history.headers.indexOf(k));
const keys=new Set(exclusion.keys);
assert.ok(history.rows.every(r=>!keys.has(indices.map(i=>r[i]).join('|'))));
const data={products:[{itemId:'fixture-c100',mtm:'C100',offers:[{role:'mine',status:'미확인',alertEligible:false,checkoutDiscountStatus:'unverified',cardBenefitStatus:'unverified'}]}]};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'market-pulse-competitor-'));
try {
  fs.mkdirSync(path.join(temp,'brand','godox'),{recursive:true});
  const check=offer=>{
    data.products[0].offers=data.products[0].offers.filter(x=>x.role!=='competitor');
    data.products[0].offers.push(offer);
    fs.writeFileSync(path.join(temp,'brand','godox','market-data.js'),'window.MARKET_DATA = '+JSON.stringify(data)+';');
    return spawnSync(process.execPath,[path.resolve('scripts/validate-market-data.mjs')],{cwd:temp,encoding:'utf8'}).status;
  };
  const valid={...base,role:'competitor',matchedMtm:'C100',alertEligible:true};
  assert.equal(check(valid),0);
  assert.equal(check({...valid,sellerRowVerified:false}),1);
  assert.equal(check({...valid,finalPrice:42000}),1);
} finally {fs.rmSync(temp,{recursive:true,force:true});}

const getTargetsCode=source.slice(source.indexOf('async function getTargets('),source.indexOf('\n\nfunction validateProductCatalog('));
const defaults=vm.runInNewContext(source.match(/const TARGETS\s*=\s*([\s\S]*?\n\];)/)[1]);
const migrationCtx={TARGETS:defaults,chrome:{storage:{local:{get:async()=>({products:[{...defaults[0],danawaUrl:''}]})}}}};
vm.runInNewContext(getTargetsCode+';this.getTargets=getTargets;',migrationCtx);
assert.match((await migrationCtx.getTargets())[0].danawaUrl,/pcode=95845739/);
let listener,saved,started=0;
const edgeCtx={isEdgeBrowser:true,activeScanPromise:null,validateProductCatalog:()=>[],requestScan:()=>{started++;return true;},
  chrome:{runtime:{onMessage:{addListener:fn=>{listener=fn;}}},storage:{local:{set:async value=>{saved=value.products;}}}}};
vm.runInNewContext(source.slice(source.indexOf('let fallbackCatalogPending=false;')),edgeCtx);
const result=await new Promise(resolve=>listener({type:'RUN_FALLBACK',products:defaults},null,resolve));
assert.equal(result.ok,true);
assert.equal(saved.length,15);
assert.equal(started,1);
console.log('Exact competitor row, delivery, legacy quarantine and history exclusions passed.');

