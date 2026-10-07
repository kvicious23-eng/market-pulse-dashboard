import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DailyCsv,kstDay,supplierDownload,csvName} from '../supplier-hub-extension/daily-csv-core.mjs';
const fixed=Date.parse('2026-10-08T08:15:00+09:00');
function fixture(saved={}){
  const f={saved:structuredClone(saved),now:fixed,ready:true,auth:{status:'connected'},items:[],clicks:0,checks:0,publications:0};
  f.io={now:()=>f.now,load:async()=>structuredClone(f.saved),save:async s=>{f.saved=structuredClone(s);},signal:async()=>({ready:f.ready,day:kstDay(f.now),completedAt:new Date(f.now).toISOString()}),authenticate:async()=>f.auth,openPage:async()=>({status:'page_opened'}),click:async()=>{assert.equal(f.saved.stage,'download');assert.ok(f.saved.requestedAt);f.clicks++;return {ok:true};},downloads:async()=>f.items,validate:async()=>{f.checks++;return f.valid||{ok:true,asOfDate:'2026-10-07',monthThrough:'2026-10-07'};},publishStatus:async()=>{f.publications++;}};
  return f;
}
const download=f=>({id:12,filename:'C:\\Users\\Test\\Downloads\\MarketPulse\\basic_operation_rocket_2026100120261007.csv',startTime:new Date(f.now).toISOString(),state:'complete',url:'blob:https://supplier.coupang.com/a',referrer:'https://supplier.coupang.com/rpd/web-v2/basic/rocket'});
let f=fixture();f.ready=false;await new DailyCsv(f.io).tick();assert.equal(f.clicks,0);assert.equal(f.saved.day,undefined);
f=fixture();let daily=new DailyCsv(f.io);await Promise.all([daily.tick(),daily.tick()]);assert.equal(f.clicks,1);assert.equal(f.checks,0);assert.equal(f.saved.stage,'download');
// Recover after worker termination without clicking twice; wait for real completion.
f.items=[{...download(f),state:'in_progress'}];daily=new DailyCsv(f.io);await daily.tick();assert.equal(f.clicks,1);assert.equal(f.checks,0);
f.items[0].state='complete';await daily.tick();assert.equal(f.saved.stage,'complete');assert.equal(f.checks,1);await daily.tick();assert.equal(f.clicks,1);assert.equal(f.publications,1);
f=fixture();f.auth={status:'verification_required',reason:'additional_verification'};await new DailyCsv(f.io).tick();assert.equal(f.saved.stage,'stopped');assert.equal(f.clicks,0);
f.auth={status:'connected'};f.io.authState=async()=>f.auth;await new DailyCsv(f.io).tick();assert.equal(f.saved.stage,'download');assert.equal(f.clicks,1,'Restored authentication continues before a first request');
f=fixture();f.auth={status:'connection_error',reason:'local_host_or_browser_error'};daily=new DailyCsv(f.io);for(let i=0;i<5;i++)await daily.tick();assert.equal(f.saved.stage,'stopped');assert.equal(f.clicks,0);
f=fixture();daily=new DailyCsv(f.io);await daily.tick();f.items=[{...download(f),state:'interrupted'}];await daily.tick();assert.equal(f.saved.reason,'csv_download_interrupted');assert.equal(f.checks,0);
f=fixture();daily=new DailyCsv(f.io);await daily.tick();f.valid={ok:false,reason:'csv_period_mismatch'};f.items=[download(f)];await daily.tick();assert.equal(f.saved.stage,'stopped');assert.equal(f.saved.reason,'csv_period_mismatch');assert.equal(f.publications,0);
f=fixture();daily=new DailyCsv(f.io);await daily.tick();f.now+=21*60000;await new DailyCsv(f.io).tick();assert.equal(f.saved.stage,'uncertain');assert.equal(f.clicks,1);
f=fixture();daily=new DailyCsv(f.io);await daily.tick();f.items=[download(f),{...download(f),id:13}];await daily.tick();assert.equal(f.saved.stage,'uncertain');assert.equal(f.checks,0);
f=fixture();daily=new DailyCsv(f.io);await daily.tick();assert.equal(supplierDownload({...download(f),url:'https://evil.test/a',referrer:'https://evil.test/'},f.saved),false);assert.equal(supplierDownload({...download(f),startTime:'2026-10-07T08:00:00+09:00'},f.saved),false);assert.equal(csvName('../other.csv'),'');
f.now=Date.parse('2026-10-09T07:59:00+09:00');f.ready=false;await new DailyCsv(f.io).tick();assert.equal(f.clicks,1,'Yesterday is not retried as today');
assert.equal(kstDay(Date.parse('2026-10-07T15:00:00Z')),'2026-10-08');
const worker=fs.readFileSync('chrome-extension/background.js','utf8');assert.match(worker,/browser:[^\n]+\n\s+scanSlot,/);
const supplier=fs.readFileSync('supplier-hub-extension/background.js','utf8');assert.match(supplier,/delta\.state\?\.current!=='complete'/);assert.match(supplier,/onDeterminingFilename/);
assert.match(supplier,/daily\.read\(\)\)\.day===kstDay\(Date\.now\(\)\)/,'Automatic authentication monitoring waits for this morning signal');
console.log('Daily CSV: morning gate, single request, worker recovery, real download completion, authentication stops, ambiguity and date validation passed.');
