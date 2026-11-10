import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {brandOrigin} from './public-brand-hosts.mjs';

export const legacyOrigin='https://market-pulse-public.pages.dev/';
const project='market-pulse-public';
const boundedFetch=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(20000)});
export const brands=['acer','lenovo','godox','hp'];
export function retirementFiles(config){
 if(config.version!==1||config.project!==project||JSON.stringify(config.brands)!==JSON.stringify(brands))throw Error('Invalid legacy retirement configuration');
 const links=brands.map(s=>`<li><a href="${brandOrigin(s)}">${s==='hp'?'HP':s[0].toUpperCase()+s.slice(1)} Price Dashboard</a></li>`).join('\n');
 const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market Pulse Dashboards</title><style>body{max-width:42rem;margin:3rem auto;padding:1rem;font:18px system-ui;line-height:2}a{color:#165c35}</style><h1>Market Pulse</h1><p>브랜드별 대시보드 주소</p><ul>${links}</ul></html>\n`;
 const redirects=brands.flatMap(s=>[s,'brand/'+s].flatMap(prefix=>[`/${prefix} ${brandOrigin(s)} 301`,`/${prefix}/ ${brandOrigin(s)} 301`,`/${prefix}/index.html ${brandOrigin(s)} 301`,`/${prefix}/* ${brandOrigin(s)}:splat 301`])).join('\n')+'\n';
 return {'index.html':html,'404.html':html,'_redirects':redirects,'_headers':'/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n','retirement.json':JSON.stringify(config)+'\n'};
}
export async function buildRetirement(config,directory){
 const files=retirementFiles(config);
 await fs.rm(directory,{recursive:true,force:true});await fs.mkdir(directory,{recursive:true});
 for(const [name,body] of Object.entries(files))await fs.writeFile(path.join(directory,name),body);
 return files;
}
export async function validateBundle(config,directory){
 const files=retirementFiles(config);
 if(JSON.stringify((await fs.readdir(directory)).sort())!==JSON.stringify(Object.keys(files).sort()))throw Error('Unexpected legacy bundle files');
 for(const [name,body] of Object.entries(files))if(await fs.readFile(path.join(directory,name),'utf8')!==body)throw Error('Legacy bundle content mismatch');
}
export async function verifyDestinations(fetcher=boundedFetch){
 for(const s of brands){
  const origin=brandOrigin(s);
  const page=await fetcher(origin,{redirect:'manual'});
  const data=await fetcher(origin+'market-data.js',{redirect:'manual'});
  if(page.status!==200||data.status!==200)throw Error('Independent destination unavailable: '+s);
  const source=await data.text();
  // Parse the JSON assignment without executing remotely supplied JavaScript.
  const match=source.match(/window\.MARKET_DATA\s*=\s*([\s\S]*?);?\s*$/);
  let parsed;try{parsed=JSON.parse(match?.[1].replace(/;\s*$/,''));}catch{throw Error('Independent destination data invalid: '+s);}
  if(parsed.meta?.brand?.toLowerCase()!==s)throw Error('Independent destination brand mismatch: '+s);
 }
}
export async function verifyRetirement(config,fetcher=boundedFetch){
 const files=retirementFiles(config);
 for(const name of ['index.html','retirement.json']){
  const r=await fetcher(legacyOrigin+(name==='index.html'?'':name),{redirect:'manual',cache:'no-store'});
  if(r.status!==200||await r.text()!==files[name])throw Error('Legacy transition file mismatch: '+name);
 }
 for(const s of brands)for(const prefix of [s,'brand/'+s])for(const suffix of ['', '/', '/index.html','/market-data.js','/favicon.ico']){
  const r=await fetcher(legacyOrigin+prefix+suffix,{redirect:'manual',cache:'no-store'});
  const target=brandOrigin(s)+(['','/','/index.html'].includes(suffix)?'':suffix.slice(1));
  if(r.status!==301||r.headers.get('location')!==target)throw Error('Legacy redirect mismatch: '+prefix+suffix);
 }
 for(const name of ['assets/app.js','assets/styles.css','market-data.js','my-coupang-price-history.csv']){
  const r=await fetcher(legacyOrigin+(name==='index.html'?'':name),{redirect:'manual',cache:'no-store'});
  if(r.status!==404)throw Error('Legacy asset still served: '+name);
 }
}
export async function publishRetirement(config,directory,{accountId,token,fetcher=boundedFetch,deploy,attempts=12,delayMs=5000}={}){
 await validateBundle(config,directory);
 await verifyDestinations(fetcher);
 if(!accountId||!token)throw Error('Missing deployment configuration');
 const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${project}`,{headers:{Authorization:'Bearer '+token},redirect:'error'});
 if(response.status!==200)throw Error('Existing legacy project could not be verified');
 const body=await response.json(),p=body.result;
 if(!body.success||p?.name!==project||p.subdomain!==project+'.pages.dev'||p.production_branch!=='main'||p.source)throw Error('Legacy project identity mismatch');
 if(deploy)await deploy(path.resolve(directory),project);
 else {const r=spawnSync('npx',['--no-install','wrangler','pages','deploy',path.resolve(directory),'--project-name='+project,'--branch=main','--commit-dirty=true'],{stdio:'inherit',env:process.env});if(r.status!==0||r.error)throw Error('Legacy transition upload failed');}
 for(let i=0;i<attempts;i++){try{await verifyRetirement(config,fetcher);return {project,verified:true,brands,mode:'redirect-only'};}catch(e){if(i===attempts-1)throw e;await new Promise(r=>setTimeout(r,delayMs));}}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const config=JSON.parse(await fs.readFile('config/legacy-public-retirement.json','utf8'));
 const directory='legacy-public-retirement';await buildRetirement(config,directory);
 console.log(JSON.stringify(await publishRetirement(config,directory,{accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN})));
}
