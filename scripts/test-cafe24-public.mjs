import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildPublicSnapshot,shellFor,readPublishedSnapshot,assetBase,publicApp} from './build-cafe24-public.mjs';
const sources=new Map();
for(const file of ['styles.css','app.js','xlsx-export.js','price-history.js','competitor-price-history.js'])sources.set('dist/'+file,fs.readFileSync('dist/'+file,'utf8'));
for(const b of ['acer','lenovo','godox'])for(const f of ['index.html','market-data.js'])sources.set('brand/'+b+'/'+f,fs.readFileSync('brand/'+b+'/'+f,'utf8'));
const before=JSON.stringify([...sources]);const files=buildPublicSnapshot(sources);assert.equal(files.size,14);assert.equal(JSON.stringify([...sources]),before);
for(const [file,text] of files){assert(!/github|kvicious|\.\.\/\.\.\/dist/i.test(text),file);assert(Buffer.byteLength(text)<10000000);}
for(const b of ['acer','lenovo','godox']){
 const html=JSON.parse(files.get('upload/'+b+'-page.js').match(/^document.open\(\);document.write\((.*)\);document.close\(\);/s)[1]);assert(html.includes('<base href="/publicmp/'+b+'/">'));assert(html.includes(assetBase+b+'-market-data.js'));
 const original=JSON.parse(sources.get('brand/'+b+'/market-data.js').replace(/^\s*window\.MARKET_DATA\s*=\s*/,'').replace(/;\s*$/,''));
 const external=JSON.parse(files.get('upload/'+b+'-market-data.js').replace(/^\s*window\.MARKET_DATA\s*=\s*/,'').replace(/;\s*$/,''));assert.deepEqual(original.products,external.products,'Prices, SKU, statuses and comparison evidence must remain intact');
 assert(shellFor(b).includes(b+'-page.js'));assert(!shellFor(b).includes('iframe'));
}
assert.throws(()=>shellFor('../'),/Unsupported/);
const bad=new Map(sources);bad.set('dist/app.js',sources.get('dist/app.js')+'\n// https://github.com/private/source');assert.throws(()=>buildPublicSnapshot(bad),/reference/);
await assert.rejects(()=>readPublishedSnapshot(async()=>new Response('error',{status:302})),/unavailable/);
let count=0;await assert.rejects(()=>readPublishedSnapshot(async url=>{const p=url.pathname.replace('/market-pulse-dashboard/','');count++;return new Response(sources.get(p)+(count>11?'\n':'') );}),/changed/);
console.log('Cafe24 export: same-origin paths, exact brand/price preservation, source isolation, complete marker, fixed source and concurrent-publication rejection passed.');

const adapted=publicApp(sources.get('dist/app.js'));new vm.Script(adapted);
const watch=adapted.slice(adapted.indexOf('  function watchForPublishedData()'),adapted.indexOf('  function renderSupplierMetrics('));
let poll,reloads=0,removed=0;const data={meta:{brand:'Acer',publishedAt:'before'}};const ctx={data,Date,JSON,location:{reload:()=>reloads++},window:{MARKET_DATA:data,setInterval:f=>{poll=f},setTimeout:()=>{}},document:{scripts:[{src:assetBase+'acer-market-data.js?ts=1'}],createElement:()=>({remove:()=>removed++}),head:{append:s=>{ctx.window.MARKET_DATA={meta:{brand:'Acer',publishedAt:'after'}};s.onload();}}}};
vm.runInNewContext(watch+';watchForPublishedData();',ctx);assert.equal(typeof poll,'function');poll();assert.equal(reloads,1);assert.equal(removed,1);assert.equal(ctx.window.MARKET_DATA,data);
