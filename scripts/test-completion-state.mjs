import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {ownPublicationFingerprint} from './completion-state.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mp-own-fingerprint-'));
try{
 const slot='2026-11-05T16:00+09:00',run='a'.repeat(32),catalog={products:[{brand:'Test',mtm:'OWN',productId:'1',itemId:'2',vendorItemId:'3'}]};
 const d={meta:{brand:'Test',snapshotAt:slot,publishedAt:slot,collectionEvidence:{scanSlot:slot,runId:run}},products:[{mtm:'OWN',productId:'1',itemId:'2',vendorItemId:'3',offers:[{role:'mine',finalPrice:10000,cardDiscount:0}],supplierMetrics:{stock:5},competitorModels:[]}]};
 const p=path.join(root,'brand/test/market-data.js');fs.mkdirSync(path.dirname(p),{recursive:true});fs.mkdirSync(path.join(root,'dist'));
 const save=()=>fs.writeFileSync(p,'window.MARKET_DATA = '+JSON.stringify(d)+';');save();
 const fp=()=>ownPublicationFingerprint(root,catalog,slot,run),first=fp();assert.match(first,/^[a-f0-9]{64}$/);
 d.products[0].competitorModels=[{finalPrice:9000}];d.products[0].supplierMetrics.stock=7;save();assert.equal(fp(),first,'Competitor/Supplier changed own fingerprint');
 d.products[0].offers[0].finalPrice=9999;save();assert.notEqual(fp(),first,'Committed own-price change went unnoticed');d.products[0].offers[0].finalPrice=10000;
 d.meta.collectionEvidence.runId='b'.repeat(32);save();assert.throws(fp,/source differs/);d.meta.collectionEvidence.runId=run;
 d.meta.collectionEvidence.sourceRunId=run;d.meta.collectionEvidence.runId='c'.repeat(32);save();assert.doesNotThrow(fp,'Bound model-recovery source rejected');
 catalog.products[0].itemId='different';assert.throws(fp,/catalogue differs/);catalog.products[0].itemId='2';
 save();const beforeHistory=fp();fs.writeFileSync(path.join(root,'dist/price-history.js'),'history');assert.notEqual(fp(),beforeHistory,'Own history alteration went unnoticed');
 d.products=[];save();assert.throws(fp,/catalogue differs/);catalog.products=[];assert.doesNotThrow(fp);
 console.log('Own source/catalogue/price/history fingerprint detects rollback and alteration while allowing competitor/Supplier-only descendants and empty catalogue.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
