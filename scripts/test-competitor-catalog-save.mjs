import assert from 'node:assert/strict';import vm from 'node:vm';import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/options.js','utf8'),a=source.indexOf('function saveTimeout('),b=source.indexOf('async function save(){',a);
async function save(states,userAgent='Chrome/150'){
 let calls=0;const files=[];const c={navigator:{userAgent},setTimeout:(fn,ms)=>{if(ms===500)fn();return 1;},clearTimeout:()=>{},chrome:{downloads:{download:async options=>{files.push(options);return 1;},search:async()=>[states[Math.min(calls++,states.length-1)]]}}};
 vm.runInNewContext(source.slice(a,source.indexOf('function keepDraft(',a))+source.slice(source.indexOf('async function saveCatalogDownload('),b)+';this.save=saveCatalogDownload;',c);
 let error;try{await c.save({version:1,products:[{skuId:'001',competitors:[]}]});}catch(e){error=e;}
 return {calls,files,error};
}
let r=await save([{state:'in_progress'},{state:'complete',filename:'C:\\Downloads\\MarketPulse\\product-catalog.json'}]);assert.equal(r.error,undefined);assert.equal(r.calls,2);
assert.equal(JSON.parse(decodeURIComponent(r.files[0].url.split(',')[1])).products[0].skuId,'001');
assert.match((await save([{state:'interrupted'}])).error.message,/failed/);
assert.match((await save([{state:'complete',filename:'C:\\Downloads\\wrong.json'}])).error.message,/path/);
r=await save([{state:'in_progress'}]);assert.match(r.error.message,/timeout/);assert.equal(r.calls,30);
assert.equal((await save([{state:'complete',filename:'/Downloads/MarketPulse/whale-product-catalog.json'}],'Whale/5')).error,undefined);
console.log('Catalogue save acknowledgement requires completed exact-path download; rejects interruption, renamed files and bounded timeout; SKU preserved.');
