import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/primary.js','utf8');
const release=JSON.parse(readTestFile('chrome-extension/manifest.json','utf8')).version;
const ctx={chrome:{runtime:{getManifest:()=>({version:release})}}};
vm.runInNewContext(readTestFile('chrome-extension/scan-policy.js','utf8'),ctx);
vm.runInNewContext(source.slice(0,source.indexOf('const savePrimaryReceipt='))+';this.factory=createPrimaryReceiptWriter;',ctx);
const receipt={version:1,browser:'whale',requestId:'a'.repeat(32),scanSlot:'2026-10-26T12:00+09:00',at:'2026-10-26T03:00:01Z',status:'running',launchAttempt:1};
async function exercise(mode,verify=false) {
 let time=0;const files=[],budgets=[];
 const writer=ctx.factory({pageId:'b'.repeat(32),now:()=>time,wait:async ms=>{time+=ms;},
  timeout:async(p,ms)=>{budgets.push(ms);return p;},
  download:async o=>{files.push(o);if(mode==='reject')throw Error('FILE_ACCESS_DENIED');return files.length;},
  search:async({id})=>{
   if(mode==='interrupted'||(mode==='fallback'&&id%2===1))return [{state:'interrupted'}];
   if(mode==='pending')return [{state:'in_progress'}];
   return [{state:'complete',filename:mode==='wrong-path'?'C:/wrong/file.json':'C:/Downloads/'+files[id-1].filename}];
  }});
 const result=await writer(receipt,verify);
 return {writer,result,files,budgets,get time(){return time;}};
}
let run=await exercise('complete');assert.equal(run.result.ok,true);assert.equal(run.files.length,1);
run=await exercise('fallback');assert.equal(run.result.ok,true);assert.equal(run.result.fallback,true);assert.equal(run.files.length,2);
const parse=o=>JSON.parse(decodeURIComponent(o.url.split(',')[1]));
const [a,b]=run.files.map(parse);
assert.deepEqual({...a,receiptDelivery:null},{...b,receiptDelivery:null});
assert.equal(b.receiptProducerVersion,release);
assert.equal(b.status,'running');assert.equal(b.at,receipt.at);
assert.match(run.files[1].filename,/acceptance-202610261200-a{32}-b{32}-000001\.json$/);
await run.writer({...receipt,status:'complete'},false);
assert.equal(parse(run.files[2]).sequence,2);
for(const mode of ['interrupted','reject','wrong-path','pending']) {
 run=await exercise(mode);assert.equal(run.result.ok,false);assert.equal(run.files.length,2);
 assert.ok(run.budgets.every(ms=>ms>0&&ms<=15000));assert.ok(run.time<=30000);
}
run=await exercise('fallback',true);
assert.ok(run.files.every(o=>o.filename.includes('whale-primary-transport-check')));
assert.ok(run.files.every(o=>!o.filename.includes('acceptance')));
console.log('Receipt writer: bounded canonical/unique attempts, immutable event identity, sequences, exact saved path, API/interruption/pending failures and verify isolation passed.');
