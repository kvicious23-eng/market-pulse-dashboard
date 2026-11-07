import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function verifyPublicDashboard(root,fetcher=fetch,origin='https://market-pulse-public.pages.dev/',{attempts=1,delayMs=0}={}){
 const target=new URL(origin);
 if(target.protocol!=='https:'||!/^market-pulse-[a-z0-9-]+\.pages\.dev$/.test(target.hostname)||target.port||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error('Invalid public verification origin');
 if(!Number.isInteger(attempts)||attempts<1||attempts>12||!Number.isInteger(delayMs)||delayMs<0||delayMs>5000)throw Error('Invalid verification retry budget');
 const files=[];
 const walk=async(dir,prefix='')=>{
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const name=prefix+entry.name;
   if(entry.isDirectory())await walk(path.join(dir,entry.name),name+'/');
   else if(entry.isFile()&&name!=='_headers')files.push(name);
  }
 };
 await walk(root);
 if(!files.length)throw Error('Empty public snapshot');
 for(const name of files){
  const route=name==='404.html'?'__publicmp_verification_missing__':name==='index.html'?'':name.replace(/\/index\.html$/,'/');
  const url=new URL(route.split('/').map(encodeURIComponent).join('/'),origin);url.searchParams.set('verify',Date.now());
  let failure;
  for(let attempt=0;attempt<attempts;attempt++){
   try {
    const response=await fetcher(url,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(response.status!==(name==='404.html'?404:200))throw Error('External file unavailable: '+name);
    if(!Buffer.from(await response.arrayBuffer()).equals(await fs.readFile(path.join(root,name))))throw Error('External snapshot mismatch: '+name);
    failure=null;break;
   }catch(error){failure=error;if(attempt+1<attempts)await new Promise(resolve=>setTimeout(resolve,delayMs));}
  }
  if(failure)throw failure;
 }
 return files.length;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('Explicit snapshot directory required');
 console.log('External files verified: '+await verifyPublicDashboard(process.argv[2],fetch,'https://market-pulse-public.pages.dev/',{attempts:12,delayMs:5000}));
}
