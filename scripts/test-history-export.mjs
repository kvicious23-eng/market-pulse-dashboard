import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('dist/app.js','utf8');
const start=source.indexOf('  function exportPriceHistory() {');
const end=source.indexOf('  function productStats(',start);
assert.ok(start>=0&&end>start,'Price history export functions must be present');
const exporter=source.slice(start,end);
const historyContext={window:{}};
vm.runInNewContext(fs.readFileSync('dist/price-history.js','utf8'),historyContext);
const history=historyContext.window.MARKET_PULSE_HISTORY;
const brandIndex=history.headers.indexOf('브랜드');
assert.ok(brandIndex>=0);

function downloadForBrand(brand,sourceHistory=history) {
  const downloads=[];
  const context={
    window:{MARKET_PULSE_HISTORY:sourceHistory},
    data:{meta:{brand}},
    downloadWorkbook:(headers,rows,sheet,filename)=>downloads.push({headers,rows,sheet,filename})
  };
  vm.runInNewContext(`${exporter};this.exportPriceHistory=exportPriceHistory;this.historyRowsForBrand=historyRowsForBrand;`,context);
  context.exportPriceHistory();
  return {downloads,rows:context.historyRowsForBrand(sourceHistory,brand)};
}

let total=0;
const brands=[...new Set(history.rows.map(row=>row[brandIndex]))];
for(const establishedBrand of ['Lenovo','Acer','Godox']) assert.ok(brands.includes(establishedBrand));
for(const brand of brands) {
  const expected=history.rows.filter(row=>row[brandIndex]===brand);
  const {downloads,rows}=downloadForBrand(brand);
  assert.ok(expected.length>0,`${brand} should have historical rows`);
  assert.equal(downloads.length,1);
  assert.equal(rows.length,expected.length);
  assert.equal(downloads[0].rows.length,expected.length);
  assert.ok(downloads[0].rows.every(row=>row[brandIndex]===brand),`${brand} export includes another brand`);
  assert.ok(downloads[0].filename.startsWith(`MarketPulse_${brand}_가격히스토리_`));
  total+=expected.length;
}
assert.equal(total,history.rows.length,'Every published history row belongs to exactly one dashboard');

const futureBrand='NewBrand';
const futureRows=[...history.rows, [...history.rows[0]]];
futureRows.at(-1)[brandIndex]=futureBrand;
const future=downloadForBrand(futureBrand,{headers:history.headers,rows:futureRows});
assert.equal(future.downloads.length,1);
assert.equal(future.downloads[0].rows.length,1,'A new brand must use the same export logic');
assert.equal(downloadForBrand('NoHistory').downloads.length,0);
assert.equal(downloadForBrand('Lenovo',{headers:['MTM'],rows:[['test']]}).downloads.length,0);
assert.equal(downloadForBrand('').downloads.length,0);

console.log('Brand-scoped history downloads passed.');
