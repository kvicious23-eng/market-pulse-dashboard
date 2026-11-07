import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildPublicDashboard} from './build-public-dashboard.mjs';
import {buildBrandSites,ensureBrandProject,writeBrandSites,publishBrandSites} from './brand-public-sites.mjs';
import {brandProject,brandOrigin} from './public-brand-hosts.mjs';
import {verifyPublicDashboard} from './verify-public-dashboard.mjs';
const sources=new Map();
for(const a of ['styles.css','app.js','xlsx-export.js','price-history.js','competitor-price-history.js'])sources.set('dist/'+a,await fs.readFile('dist/'+a,'utf8'));
for(const b of ['acer','lenovo','godox','hp'])for(const a of ['index.html','market-data.js','apple-touch-icon-v2.png'])sources.set('brand/'+b+'/'+a,await fs.readFile('brand/'+b+'/'+a,a.endsWith('.png')?undefined:'utf8'));
const snapshot=buildPublicDashboard(sources),before=JSON.stringify([...snapshot]);
const sites=buildBrandSites(snapshot);assert.equal(sites.length,4);assert.equal(new Set(sites.map(s=>new URL(s.origin).hostname)).size,4);assert.equal(JSON.stringify([...snapshot]),before);
for(const s of sites){
 assert.equal(s.project,'market-pulse-'+s.slug);assert.equal(s.origin,'https://'+s.project+'.pages.dev/');assert.equal(s.files.size,12);
 assert(s.files.get('index.html').includes('href="/apple-touch-icon-v2.png"'));assert(!s.files.get('index.html').includes('data:image/svg+xml'));
 assert.equal(s.files.get('market-data.js'),snapshot.get(s.slug+'/market-data.js'));
 assert.deepEqual(s.files.get('apple-touch-icon.png'),snapshot.get(s.slug+'/apple-touch-icon-v2.png'));
 const ico=s.files.get('favicon.ico');assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),1);assert.equal(ico[6],180);assert.deepEqual(ico.subarray(22),s.files.get('apple-touch-icon.png'));
 assert(![...s.files.keys()].some(k=>k.startsWith('lenovo/')||k.startsWith('godox/')||k.startsWith('acer/')||k.startsWith('hp/')));
 assert(snapshot.get('index.html').includes(s.origin));
}
assert.equal(brandProject('새-브랜드'),brandProject('새-브랜드'));assert.match(brandProject('새-브랜드'),/^market-pulse-b-[a-f0-9]{20}$/);assert.notEqual(brandProject('public'),'market-pulse-public');
for(const b of ['../','Acer','a/b','','a'.repeat(100)+'/'])assert.throws(()=>brandProject(b));
assert.notEqual(brandProject('a'.repeat(100)),brandProject('a'.repeat(99)+'b'));
const incomplete=new Map(snapshot);incomplete.delete('acer/apple-touch-icon-v2.png');assert.throws(()=>buildBrandSites(incomplete),/Incomplete/);
const token='private-test-token',accountId='a'.repeat(32),calls=[],projects=new Map();
function project(s){return {name:s.project,subdomain:s.project+'.pages.dev',production_branch:'main',deployment_configs:{production:{env_vars:{MARKET_PULSE_BRAND_SLUG:{type:'plain_text',value:s.slug}}}}};}
const fetcher=async(input,options={})=>{
 const u=new URL(input);
 if(u.hostname==='api.cloudflare.com'){
  assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.redirect,'error');calls.push({method:options.method,path:u.pathname});
  if(options.method==='POST'){const body=JSON.parse(options.body),s=sites.find(s=>s.project===body.name);assert(s);assert.equal(body.production_branch,'main');const p=project(s);assert.equal(body.deployment_configs.production.env_vars.MARKET_PULSE_BRAND_SLUG.value,s.slug);projects.set(s.project,p);return Response.json({success:true,result:p});}
  const p=projects.get(u.pathname.split('/').pop());return Response.json({success:!!p,result:p||null},{status:p?200:404});
 }
 assert.equal(options.headers,undefined,'Never send API token to a public dashboard');
 const s=sites.find(s=>new URL(s.origin).hostname===u.hostname);assert(s);
 let name=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';if(name==='__publicmp_verification_missing__')name='404.html';return new Response(s.files.get(name),{status:name==='404.html'?404:200});
};
await ensureBrandProject(sites[0],{accountId,token,fetcher});assert.equal(calls.filter(c=>c.method==='POST').length,1);
await ensureBrandProject(sites[0],{accountId,token,fetcher});assert.equal(calls.filter(c=>c.method==='POST').length,1,'Reuse only a marked existing project');
let failedPosts=0;
await assert.rejects(()=>ensureBrandProject(sites[0],{accountId,token,fetcher:async(_,o)=>{if(o.method==='POST')failedPosts++;return Response.json({success:false,errors:[{message:token}]},{status:403});}}),e=>/HTTP 403/.test(e.message)&&!e.message.includes(token));assert.equal(failedPosts,0);
await assert.rejects(()=>ensureBrandProject(sites[0],{accountId,token,fetcher:async()=>Response.json({success:true,result:{...project(sites[0]),deployment_configs:{}}})}),/ownership/);
await assert.rejects(()=>ensureBrandProject({...sites[0],project:'other'},{accountId,token,fetcher}),/configuration/);
await assert.rejects(()=>ensureBrandProject(sites[0],{accountId,token,fetcher:async()=>Response.json({success:true,result:{...project(sites[0]),subdomain:'different.pages.dev'}})}),/ownership/);
const root=await fs.mkdtemp(path.join(os.tmpdir(),'brand-sites-'));
try{
 const legacy=path.join(root,'legacy'),output=path.join(root,'brands');
 for(const [name,value]of snapshot){const dest=path.join(legacy,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,value);}
 const manifest=await writeBrandSites(legacy,output);assert.equal(manifest.length,4);await assert.rejects(()=>writeBrandSites(legacy,output),/empty/);
 const uploaded=[];const result=await publishBrandSites(output,{accountId,token,fetcher,deploy:async(s,d)=>{assert.equal(d,path.resolve(output,s.slug));uploaded.push(s.slug);},verification:{attempts:1,delayMs:0}});
 assert.equal(result.length,4);assert.equal(uploaded.length,4);assert(result.every(r=>r.verifiedFiles===11));
 const receipt=JSON.parse(await fs.readFile(path.join(output,'deployment-receipt.json'),'utf8'));assert.equal(receipt.complete,true);assert.equal(receipt.sites.length,4);assert(!JSON.stringify(receipt).includes(token));
 let stale=true;
 const transient=async(u,o)=>{if(stale){stale=false;return new Response('old');}return fetcher(u,o);};
 assert.equal(await verifyPublicDashboard(path.join(output,'acer'),transient,brandOrigin('acer'),{attempts:2,delayMs:0}),11);
 await assert.rejects(()=>verifyPublicDashboard(path.join(output,'acer'),fetcher,'http://evil.test/'),/origin/);
 await assert.rejects(()=>verifyPublicDashboard(path.join(output,'acer'),fetcher,brandOrigin('acer'),{attempts:13}),/budget/);
 let deploys=0;await assert.rejects(()=>publishBrandSites(output,{accountId,token,fetcher,deploy:async()=>{deploys++;throw Error('mock upload failed');},verification:{attempts:1,delayMs:0}}),/upload failed/);
 assert.equal(deploys,1);assert.equal(JSON.parse(await fs.readFile(path.join(output,'deployment-receipt.json'),'utf8')).complete,false);
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('Independent brand sites: four distinct origins, correct root icons/data, marked project ownership, single-snapshot packaging, no token leakage, publication receipts and bounded verification passed.');
