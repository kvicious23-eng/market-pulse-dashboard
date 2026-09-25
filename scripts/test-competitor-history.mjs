import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync('dist/app.js','utf8');
const start=app.indexOf('  function exportCompetitorHistory() {');
const end=app.indexOf('  function productStats(',start);
assert.ok(start>0&&end>start);
const exporter=app.slice(start,end);
const headers=['수집시각','브랜드','MTM','판매처','가격'];
const history={headers,rows:[
  ['2026-09-24T14:10:00+09:00','Godox','C100','G마켓',41970],
  ['2026-09-25T08:10:00+09:00','Godox','C100','옥션',41980],
  ['2026-09-25T08:10:00+09:00','Acer','A1','11번가',900000]
]};
const downloads=[];
const context={
  window:{MARKET_PULSE_COMPETITOR_HISTORY:history},data:{meta:{brand:'Godox'}},
  downloadWorkbook:(columns,rows,sheet,name)=>downloads.push({columns,rows,sheet,name})
};
vm.runInNewContext(`${exporter}\nthis.exportCompetitorHistory=exportCompetitorHistory`,context);
context.exportCompetitorHistory();
assert.equal(downloads.length,1);
assert.equal(downloads[0].rows.length,2);
assert.ok(downloads[0].rows.every(row=>row[1]==='Godox'));
assert.match(downloads[0].name,/Godox_경쟁사가격히스토리_20260925\.xlsx$/);
context.data.meta.brand='NewBrand';
context.exportCompetitorHistory();
assert.equal(downloads.length,1,'Brand without data cannot download another brand history');

const stats=app.slice(app.indexOf('  function productStats('),app.indexOf('\n\n  function activeProduct()'));
const productContext={
  effectiveCompetitorPrice:offer=>offer.finalPrice,
  effectiveFinalPrice:offer=>offer.finalPrice
};
vm.runInNewContext(`${stats}\nthis.productStats=productStats`,productContext);
const mine={role:'mine',finalPrice:41000};
const prices=[60000,43000,45000,42000,44000,47000,46000];
const result=productContext.productStats({offers:[mine,...prices.map(finalPrice=>({role:'competitor',finalPrice}))]});
assert.equal(result.competitors.length,5);
assert.equal(JSON.stringify(result.competitors.map(row=>row.finalPrice)),JSON.stringify([42000,43000,44000,45000,46000]));

const scanner=fs.readFileSync('chrome-extension/background.js','utf8');
const scannerStart=scanner.indexOf('function readEnuriSellers(');
const scannerEnd=scanner.indexOf('\n\nasync function scanAll()',scannerStart);
assert.ok(scannerStart>0&&scannerEnd>scannerStart);
const scanContext={document:{
  title:'GODOX C100 노출계 토이카메라 [정품]',
  body:{innerText:'GODOX C100 정품 쇼핑몰별 최저가'},
  querySelector:()=>({textContent:'GODOX C100 노출계 토이카메라 [정품]'}),
  querySelectorAll:()=>[
    {innerText:'GODOX 고독스 C100 41,970원 무료배송',querySelectorAll:()=>[
      {alt:'GODOX 고독스 C100 정품'},{alt:'G마켓 로고'}]},
    {innerText:'GODOX C100 해외구매 34,860원',querySelectorAll:()=>[
      {alt:'GODOX C100 해외구매'},{alt:'옥션 로고'}]}
  ]
}};
vm.runInNewContext(`${scanner.slice(scannerStart,scannerEnd)}\nthis.scan=readEnuriSellers`,scanContext);
const scanned=scanContext.scan('Godox','C100',42000);
assert.equal(scanned.sellers.length,1);
assert.equal(scanned.sellers[0].price,41970);
console.log('Competitor history, top five and listing exclusions passed.');
