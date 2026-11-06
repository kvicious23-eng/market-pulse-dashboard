import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readTestFile} from './test-source.mjs';
import {syncData,competitorScanDue,readHistory} from './competitor-data.mjs';
const c={Date};vm.runInNewContext(readTestFile('chrome-extension/scan-policy.js','utf8')+';this.owner=scanPolicyForSlot;this.next=nextScheduledScanTime;this.slots=scheduledSlotsForDay;this.due=competitorScanDue;this.morning=morningScanSlot;',c);
assert.deepEqual(Array.from(c.slots('2026-11-06')),['08','12','15','20'].map(h=>'2026-11-06T'+h+':00+09:00'));
const hours=['07','12','15','20'];
assert.deepEqual(Array.from(c.slots('2026-11-07')),hours.map(h=>'2026-11-07T'+h+':00+09:00'));
for(let i=0;i<4;i++){
 const slot='2026-11-07T'+hours[i]+':00+09:00';
 assert.equal(c.owner(slot).browser,i%2?'whale':'chrome');
 assert.equal(c.due(slot),i%2===0);assert.equal(competitorScanDue(slot),i%2===0);
 assert.equal(c.next(slot),Date.parse(i===3?'2026-11-08T07:00+09:00':'2026-11-07T'+hours[i+1]+':00+09:00'));
}
for(const h of ['08','16'])assert.throws(()=>c.owner('2026-11-07T'+h+':00+09:00'),/invalid-scan-slot/);
assert.equal(c.owner('2026-11-06T08:00+09:00').browser,'chrome');
assert.equal(c.morning(new Date('2026-11-07T06:30+09:00')),'2026-11-07T07:00+09:00');
const source=readTestFile('chrome-extension/background.js','utf8');
vm.runInNewContext(source.slice(source.indexOf('const SCHEDULED_SCAN_TIMES ='),source.indexOf('\nasync function prepareProductForCheckout'))+';this.current=currentScheduledScanSlot;',Object.assign(c,{Intl,navigator:{userAgent:'Chrome'}}));
for(const [time,want] of [['06:59',null],['07:00','07'],['11:59','07'],['12:00','12'],['14:59','12'],['15:00','15'],['19:59','15'],['20:00','20']])assert.equal(c.current(new Date('2026-11-07T'+time+':00+09:00')),want?'2026-11-07T'+want+':00+09:00':null);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mp-schedule-'));
try{
 fs.mkdirSync(path.join(root,'brand/acer'),{recursive:true});fs.mkdirSync(path.join(root,'dist'));
 const file=path.join(root,'brand/acer/market-data.js'),old={role:'competitor',kind:'coupang-model',competitorKey:'1-2-3',model:'Comp',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3',phaseState:'collected',comparisonSlot:'2026-11-07T07:00+09:00',alertEligible:true,finalPrice:10000,observedListPrice:12000,priceCheckedAt:'2026-11-07 07:30',collectionEvidence:{sourceRunId:'a'.repeat(32)}};
 const mine={role:'mine',finalPrice:9000};const catalog={products:[{brand:'Acer',mtm:'A',productId:'10',itemId:'20',vendorItemId:'30',competitors:[{model:'Comp',url:old.url}]}]};
 let d={meta:{brand:'Acer',collectionEvidence:{scanSlot:'2026-11-07T12:00+09:00',runId:'b'.repeat(32)},monitoring:{}},products:[{...catalog.products[0],offers:[mine],competitorModels:[old],supplierMetrics:{stock:17}}]};
 fs.writeFileSync(file,'window.MARKET_DATA = '+JSON.stringify(d)+';');syncData(root,catalog);
 d=JSON.parse(fs.readFileSync(file,'utf8').replace(/^window.MARKET_DATA = /,'').replace(/;\s*$/,''));
 const offer=d.products[0].competitorModels[0];assert.equal(offer.phaseState,'scheduled-reference');assert.equal(offer.finalPrice,10000);assert.equal(offer.priceCheckedAt,old.priceCheckedAt);assert.equal(offer.comparisonSlot,old.comparisonSlot);assert.equal(offer.alertEligible,false);assert.equal(offer.collectionStatus,null);assert.equal(d.meta.competitorPhase.state,'scheduled-skip');assert.equal(readHistory(root).rows.length,0);assert.deepEqual(d.products[0].offers,[mine]);assert.equal(d.products[0].supplierMetrics.stock,17);
 d.meta.collectionEvidence.scanSlot='2026-11-07T15:00+09:00';fs.writeFileSync(file,'window.MARKET_DATA = '+JSON.stringify(d)+';');syncData(root,catalog);
 d=JSON.parse(fs.readFileSync(file,'utf8').replace(/^window.MARKET_DATA = /,'').replace(/;\s*$/,''));assert.equal(d.products[0].competitorModels[0].phaseState,'pending');assert.equal(d.products[0].competitorModels[0].lastVerifiedFinalPrice,10000);
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('Schedule transition, historical identity, 07/12/15/20 boundaries, twice-daily competitors and dated non-error references passed.');
