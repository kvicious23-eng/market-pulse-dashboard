import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {brands,legacyOrigin,retirementFiles,buildRetirement,publishRetirement,verifyRetirement} from './retire-legacy-public.mjs';
import {brandOrigin} from './public-brand-hosts.mjs';
const config={version:1,project:'market-pulse-public',brands};
const files=retirementFiles(config),directory=await fs.mkdtemp(path.join(os.tmpdir(),'mp-retire-'));
let deployed=0,apiCalls=0;
const fetcher=async(url,options={})=>{
 url=String(url);
 if(url.startsWith('https://api.cloudflare.com/')){
  apiCalls++;assert.equal(options.method,undefined);assert.equal(options.redirect,'error');
  return Response.json({success:true,result:{name:config.project,subdomain:config.project+'.pages.dev',production_branch:'main'}});
 }
 assert.equal(options.headers?.Authorization,undefined,'Token must never reach public hosts');
 assert.equal(options.redirect,'manual');
 for(const s of brands)if(url.startsWith(brandOrigin(s)))return new Response(url.endsWith('market-data.js')?'window.MARKET_DATA = '+JSON.stringify({meta:{brand:s}})+';':'dashboard');
 const route=url.slice(legacyOrigin.length);
 if(route===''||route==='retirement.json')return new Response(files[route||'index.html']);
 for(const s of brands)for(const prefix of [s,'brand/'+s])if(route===prefix||route.startsWith(prefix+'/')){
  const suffix=route.slice(prefix.length).replace(/^\//,'');
  return new Response(null,{status:301,headers:{location:brandOrigin(s)+(suffix==='index.html'?'':suffix)}});
 }
 return new Response(files['404.html'],{status:404});
};
const options={accountId:'synthetic-account',token:'synthetic-token',fetcher,attempts:1,delayMs:0,deploy:async(dir,project)=>{assert.equal(project,config.project);assert.equal(dir,path.resolve(directory));deployed++;}};
try{
 assert.deepEqual(Object.keys(files).sort(),['404.html','_headers','_redirects','index.html','retirement.json']);
 assert(!Object.values(files).join('').includes('window.MARKET_DATA'));
 for(const s of brands)assert(files._redirects.includes('/'+s+'/* '+brandOrigin(s)+':splat 301'));
 assert.throws(()=>retirementFiles({...config,project:'market-pulse-lenovo'}));
 assert.throws(()=>retirementFiles({...config,brands:[...brands,'../escape']}));
 await buildRetirement(config,directory);
 await fs.writeFile(path.join(directory,'market-data.js'),'private');
 await assert.rejects(publishRetirement(config,directory,options),/Unexpected legacy bundle/);assert.equal(deployed,0);assert.equal(apiCalls,0);
 await buildRetirement(config,directory);
 await assert.rejects(publishRetirement(config,directory,{...options,fetcher:async(u,o)=>String(u)===brandOrigin('acer')?new Response('',{status:503}):fetcher(u,o)}),/destination unavailable/);assert.equal(deployed,0);
 await assert.rejects(publishRetirement(config,directory,{...options,fetcher:async(u,o)=>String(u).startsWith('https://api.cloudflare.com/')?Response.json({success:true,result:{name:'wrong'}}):fetcher(u,o)}),/identity mismatch/);assert.equal(deployed,0);
 const result=await publishRetirement(config,directory,options);assert.equal(deployed,1);assert.equal(result.mode,'redirect-only');assert.equal(apiCalls,1);
 await assert.rejects(verifyRetirement(config,async(u,o)=>String(u).endsWith('assets/app.js')?new Response('old app'):fetcher(u,o)),/asset still served/);
 await assert.rejects(verifyRetirement(config,async(u,o)=>String(u)===legacyOrigin+'lenovo/'?new Response(null,{status:302,headers:{location:brandOrigin('godox')}}):fetcher(u,o)),/redirect mismatch/);
 console.log('Legacy retirement verified: minimal bundle, destination guards, project identity, token isolation, 40 redirects, removed assets, conditional upload');
}finally{await fs.rm(directory,{recursive:true,force:true});}
