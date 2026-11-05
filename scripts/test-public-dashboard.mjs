import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildPublicDashboard,readPublicSources} from './build-public-dashboard.mjs';
import {verifyPublicDashboard} from './verify-public-dashboard.mjs';
const sources=new Map();
for(const f of ['styles.css','app.js','xlsx-export.js','price-history.js','competitor-price-history.js'])sources.set('dist/'+f,fs.readFileSync('dist/'+f,'utf8'));
for(const b of ['acer','lenovo','godox'])for(const f of ['index.html','market-data.js'])sources.set('brand/'+b+'/'+f,fs.readFileSync('brand/'+b+'/'+f,'utf8'));
const parse=s=>JSON.parse(s.replace(/^\s*window\.MARKET_DATA\s*=\s*/,'').replace(/;\s*$/,''));
const original=JSON.stringify([...sources]);
const files=buildPublicDashboard(sources);
assert.equal(files.size,14);assert.equal(JSON.stringify([...sources]),original);
for(const b of ['acer','lenovo','godox']){
 assert.deepEqual(parse(files.get(b+'/market-data.js')).products,parse(sources.get('brand/'+b+'/market-data.js')).products);
 assert(files.get(b+'/index.html').includes('/assets/app.js'));
 assert(files.get('index.html').includes('/'+b+'/'));
}
for(const [p,s] of files){assert(!/github|kvicious|cafe24|\.\.\/\.\.\/dist/i.test(s),p);assert(!p.includes('scripts/')&&!p.includes('.github/'));}
const extra=new Map(sources),newData=parse(sources.get('brand/acer/market-data.js'));newData.meta.brand='새 브랜드';
extra.set('brand/새-브랜드/index.html',sources.get('brand/acer/index.html'));
extra.set('brand/새-브랜드/market-data.js','window.MARKET_DATA = '+JSON.stringify(newData)+';');
const expanded=buildPublicDashboard(extra);assert.equal(expanded.size,16);assert(expanded.has('새-브랜드/index.html'));assert(expanded.get('index.html').includes(encodeURIComponent('새-브랜드')));
extra.delete('brand/새-브랜드/index.html');assert.throws(()=>buildPublicDashboard(extra),/Incomplete/);
const bad=new Map(sources);bad.set('dist/app.js',sources.get('dist/app.js')+'\n// https://github.com/source');assert.throws(()=>buildPublicDashboard(bad),/reference/);
const brands=['acer','lenovo','godox'];
const fetched=await readPublicSources(async u=>new Response(sources.get(u.pathname.replace('/market-pulse-dashboard/',''))),brands);
assert.deepEqual([...buildPublicDashboard(fetched)],[...files]);
let calls=0;await assert.rejects(()=>readPublicSources(async u=>new Response(sources.get(u.pathname.replace('/market-pulse-dashboard/',''))+(++calls>11?'\n':'')),brands),/changed/);
await assert.rejects(()=>readPublicSources(async()=>new Response('',{status:404}),brands),/unavailable/);
await assert.rejects(()=>readPublicSources(async()=>{throw Error('must not fetch')},['../']),/Invalid/);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'public-verify-'));
try{
 for(const [name,content] of files){const dest=path.join(temp,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);}
 const mock=async u=>{
  const route=decodeURIComponent(u.pathname).replace(/^\//,'');
  const name=route==='__publicmp_verification_missing__'?'404.html':!route?'index.html':route.endsWith('/')?route+'index.html':route;
  return new Response(files.get(name),{status:name==='404.html'?404:200});
 };
 assert.equal(await verifyPublicDashboard(temp,mock),13);
 await assert.rejects(()=>verifyPublicDashboard(temp,async()=>new Response('wrong')),/unavailable|mismatch/);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('Public dashboard: same-origin assets, dynamic brands, exact product preservation, source isolation and publication consistency passed.');
