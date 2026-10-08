import {readTestFile} from './test-source.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readTestFile('dist/app.js','utf8');
const start=source.indexOf('  function renderSupplierMetrics('),end=source.indexOf('  function renderCards(',start);
assert.ok(start>=0&&end>start);
const makeRender=now=>{
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:[now]));}}
  return vm.runInNewContext(source.slice(start,end)+'\nrenderSupplierMetrics;',{
    Date:FixedDate,Intl,escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  });
};
const render=makeRender('2026-10-07T06:00:00Z');
const metrics={stock:126,dailySales:0,monthSales:1234,stockStatus:'confirmed',dailySalesStatus:'confirmed',monthSalesStatus:'confirmed',asOfDate:'2026-10-06',month:'2026-10',monthThrough:'2026-10-06',salesBasis:'outbound'};
const html=render({supplierMetrics:metrics});
assert.match(html,/>재고</);assert.match(html,/>판매</);assert.match(html,/>월판매</);
assert.match(html,/<strong>126<\/strong>/);assert.match(html,/<strong>0<\/strong>/);assert.match(html,/<strong>1,234<\/strong>/);
assert.match(html,/10\/06 기준/);assert.match(html,/출고수량 기준/);
const absent=render({supplierMetrics:{...metrics,stock:null,dailySales:null,monthSales:null,stockStatus:'sku-not-found',dailySalesStatus:'sku-not-found',monthSalesStatus:'sku-not-found'}});
assert.equal((absent.match(/<strong>미확인<\/strong>/g)||[]).length,3);assert.match(absent,/미확인 · CSV에 해당 SKU 없음/);
const noDay=render({supplierMetrics:{...metrics,stock:0,dailySales:0,monthSales:28}});
assert.equal((noDay.match(/<strong>0<\/strong>/g)||[]).length,2);assert.match(noDay,/<strong>28<\/strong>/);assert.doesNotMatch(noDay,/미확인/);
assert.equal((render({}).match(/<strong>미확인<\/strong>/g)||[]).length,3);
assert.match(render({supplierMetrics:{...metrics,stock:null,stockStatus:'sku-unregistered'}}),/SKUID 등록 필요/);
const partial=render({supplierMetrics:{...metrics,monthSales:null,monthSalesStatus:'period-incomplete'}});
assert.match(partial,/<strong>126<\/strong>/);assert.match(partial,/월 자료 일부 누락/);
const stale=render({supplierMetrics:{...metrics,asOfDate:'2026-10-05'}});
assert.equal((stale.match(/<strong>미확인<\/strong>/g)||[]).length,3);assert.match(stale,/갱신 지연 · 자료 갱신 필요/);
const first=makeRender('2026-11-01T01:00:00Z')({supplierMetrics:{...metrics,monthSales:0,asOfDate:'2026-10-31',month:'2026-11',monthThrough:'2026-10-31'}});
assert.match(first,/11월 누적/);assert.match(first,/<strong>0<\/strong>/);
assert.ok(source.includes('${renderSupplierMetrics(product)}'),'Metrics must be in the existing product status cell');
console.log('Supplier metric display: location, zero, periods, stale/missing/partial states and month rollover passed.');

for (const state of ['csv-missing','csv-invalid','date-missing']) {
  const delayed=render({supplierMetrics:{...metrics,stock:null,dailySales:null,monthSales:null,stockStatus:state,dailySalesStatus:state,monthSalesStatus:state}});
  assert.match(delayed,/갱신 지연/);
  assert.equal((delayed.match(/<strong>미확인<\/strong>/g)||[]).length,3);
  assert.doesNotMatch(delayed,/<strong>126<\/strong>/);
}
assert.doesNotMatch(absent,/갱신 지연/);
assert.doesNotMatch(html,/갱신 지연/);
