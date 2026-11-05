import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {createHandler} from '../lib/gateway.mjs';
const root=new URL('../../',import.meta.url);
const request=(route,options)=>new Request('https://redwolfcorp.com/api/publicmp?route='+encodeURIComponent(route),options);
test('Brand pages, data and every browser asset stay on the external origin',async()=>{
 const handler=createHandler(async(url,options)=>{
  assert.equal(url.origin,'https://kvicious23-eng.github.io');assert.equal(options.redirect,'manual');
  assert.equal(options.headers,undefined,'Do not forward visitor cookies or credentials');
  return new Response(fs.readFileSync(new URL(url.pathname.replace('/market-pulse-dashboard/',''),root)));
 });
 for(const brand of ['acer','lenovo','godox']){
  const response=await handler(request(brand));assert.equal(response.status,200);const text=await response.text();
  assert(text.includes(`<base href="/publicmp/${brand}/">`));assert(!/github|kvicious|\.\.\/\.\.\/dist/i.test(text));
  assert(text.includes('/publicmp/assets/app.js'));
  const data=await handler(request(brand+'/market-data.js'));assert.equal(data.status,200);assert(!/GitHub/i.test(await data.text()));
 }
 for(const file of ['styles.css','app.js','xlsx-export.js','price-history.js','competitor-price-history.js'])assert.equal((await handler(request('assets/'+file))).status,200);
});
test('Only allowlisted files, methods and routes can be fetched',async()=>{
 let calls=0;const handler=createHandler(async()=>{calls++;return new Response('ok');});
 for(const route of ['../PROJECT_RULES.md','https://evil.test','assets/../secret','assets/gateway.mjs','acer/extra','acer//','unknown'])assert.equal((await handler(request(route))).status,404);
 assert.equal((await handler(request('acer',{method:'POST'}))).status,405);
 assert.equal((await handler(new Request('https://redwolfcorp.com/api/publicmp?route=acer&route=lenovo'))).status,404);
 assert.equal(calls,0);
});
test('Redirects, failures, timeouts and unexpected source references never expose the upstream',async()=>{
 for(const fetcher of [async()=>new Response(null,{status:302,headers:{Location:'https://source.example'}}),async()=>new Response('private',{status:500}),async()=>{throw Error('sensitive internal message')},async()=>new Response('https://github.com/owner/repo')]){
  const r=await createHandler(fetcher)(request('acer'));assert.equal(r.status,503);assert.equal(r.headers.get('location'),null);assert.equal(r.headers.get('cache-control'),'no-store');assert(!/source|github|sensitive|private/i.test(await r.text()));
 }
 const r=await createHandler(async()=>new Response('ok'))(request('acer',{method:'HEAD'}));assert.equal(await r.text(),'');assert.equal(r.status,200);
});
