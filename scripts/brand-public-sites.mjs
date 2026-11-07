import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {brandProject,brandOrigin,validBrandSlug} from './public-brand-hosts.mjs';
import {verifyPublicDashboard} from './verify-public-dashboard.mjs';
const assets=['styles.css','app.js','xlsx-export.js','price-history.js','competitor-price-history.js'];
const png='apple-touch-icon-v2.png';
const marker='MARKET_PULSE_BRAND_SLUG';
const parse=s=>JSON.parse(s.replace(/^\s*window\.MARKET_DATA\s*=\s*/,'').replace(/;\s*$/,''));
function icoFromPng(bytes){
 const head=Buffer.alloc(22);head.writeUInt16LE(1,2);head.writeUInt16LE(1,4);head[6]=180;head[7]=180;head.writeUInt16LE(1,10);head.writeUInt16LE(32,12);head.writeUInt32LE(bytes.length,14);head.writeUInt32LE(22,18);return Buffer.concat([head,bytes]);
}
export function buildBrandSites(snapshot){
 const brands=[...snapshot.keys()].filter(p=>/^[^/]+\/index\.html$/.test(p)).map(p=>p.split('/')[0]).sort();
 if(!brands.length||brands.some(b=>!validBrandSlug(b)))throw Error('Invalid brand site list');
 const sites=[];const projects=new Set();
 for(const slug of brands){
  const project=brandProject(slug);if(projects.has(project))throw Error('Brand host collision');projects.add(project);
  const html=snapshot.get(slug+'/index.html'),data=snapshot.get(slug+'/market-data.js'),icon=snapshot.get(slug+'/'+png);
  if(typeof html!=='string'||typeof data!=='string'||!Buffer.isBuffer(icon)||icon.length<24||icon.toString('hex',0,8)!=='89504e470d0a1a0a'||icon.readUInt32BE(16)!==180||icon.readUInt32BE(20)!==180)throw Error('Incomplete brand site: '+slug);
  const brand=parse(data).meta?.brand;
  if(typeof brand!=='string'||brand.trim().toLowerCase().replace(/[^\p{L}\p{Nd}]+/gu,'-').replace(/^-+|-+$/g,'')!==slug)throw Error('Brand site data mismatch');
  if((html.match(/<link\s+rel="icon"[^>]*>/g)||[]).length!==1||!html.includes('rel="apple-touch-icon"'))throw Error('Brand site icon links missing');
  const rootHtml=html.replace(/<link\s+rel="icon"[^>]*>/,'<link rel="icon" type="image/png" sizes="180x180" href="/apple-touch-icon-v2.png" />').replace('href="'+png+'"','href="/'+png+'"');
  const files=new Map([['index.html',rootHtml],['market-data.js',data],[png,icon],['apple-touch-icon.png',icon],['favicon.ico',icoFromPng(icon)],['404.html','<!doctype html><html lang="ko"><meta charset="utf-8"><title>페이지 없음</title><a href="/">대시보드</a></html>'],['_headers',snapshot.get('_headers')]]);
  for(const name of assets){const value=snapshot.get('assets/'+name);if(typeof value!=='string')throw Error('Brand shared asset missing');files.set('assets/'+name,value);}
  for(const [name,value]of files)if(!(typeof value==='string'||Buffer.isBuffer(value)))throw Error('Invalid brand asset: '+name);
  sites.push({slug,project,origin:brandOrigin(slug),files});
 }
 return sites;
}
export async function ensureBrandProject(site,{accountId,token,fetcher=fetch}){
 if(!/^[a-f0-9]{32}$/.test(accountId||'')||!token||site.project!==brandProject(site.slug)||site.origin!==brandOrigin(site.slug))throw Error('Brand deployment configuration invalid');
 const endpoint='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/pages/projects';
 const request=async(url,method='GET',body)=>{
  const r=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await r.json();}catch{throw Error('Cloudflare project response invalid: '+site.project);}
  return {status:r.status,ok:r.ok&&data.success===true,project:data.result};
 };
 let response=await request(endpoint+'/'+site.project);
 if(response.status===404){response=await request(endpoint,'POST',{name:site.project,production_branch:'main',deployment_configs:{production:{env_vars:{[marker]:{type:'plain_text',value:site.slug}}}}});}
 if(!response.ok)throw Error('Cloudflare project access/create failed: '+site.project+' HTTP '+response.status);
 const p=response.project;
 if(p?.name!==site.project||p.subdomain!==site.project+'.pages.dev'||p.production_branch!=='main'||p.deployment_configs?.production?.env_vars?.[marker]?.value!==site.slug||p.source)throw Error('Cloudflare project ownership/configuration mismatch: '+site.project);
 return {project:site.project,origin:site.origin};
}
export async function writeBrandSites(snapshotRoot,output){
 try{if((await fs.readdir(output)).length)throw Error('Brand output must be empty');}catch(e){if(e.code!=='ENOENT')throw e;}
 const snapshot=new Map();
 const walk=async(dir,prefix='')=>{for(const e of await fs.readdir(dir,{withFileTypes:true})){const name=prefix+e.name;if(e.isDirectory())await walk(path.join(dir,e.name),name+'/');else if(e.isFile())snapshot.set(name,await fs.readFile(path.join(dir,e.name),/\.(png|ico)$/.test(name)?undefined:'utf8'));}};
 await walk(snapshotRoot);const sites=buildBrandSites(snapshot);
 for(const site of sites)for(const [name,value]of site.files){const dest=path.join(output,site.slug,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,value);}
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({version:1,sites:sites.map(({slug,project,origin})=>({slug,project,origin}))},null,2));
 return sites.map(({slug,project,origin})=>({slug,project,origin}));
}
export async function publishBrandSites(root,{accountId,token,fetcher=fetch,deploy,verification={attempts:12,delayMs:5000}}={}){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.sites)||!manifest.sites.length||new Set(manifest.sites.map(s=>s.slug)).size!==manifest.sites.length)throw Error('Invalid brand deployment manifest');
 // Validate every bundle before creating or modifying any project.
 for(const site of manifest.sites){if(site.project!==brandProject(site.slug)||site.origin!==brandOrigin(site.slug))throw Error('Invalid brand deployment target');const d=parse(await fs.readFile(path.join(root,site.slug,'market-data.js'),'utf8'));if(d.meta.brand.trim().toLowerCase().replace(/[^\p{L}\p{Nd}]+/gu,'-').replace(/^-+|-+$/g,'')!==site.slug)throw Error('Brand deployment data mismatch');}
 const results=[];
 const receipt=()=>fs.writeFile(path.join(root,'deployment-receipt.json'),JSON.stringify({verifiedAt:new Date().toISOString(),complete:results.length===manifest.sites.length,sites:results},null,2));
 await receipt();
 for(const site of manifest.sites){
  await ensureBrandProject(site,{accountId,token,fetcher});
  const directory=path.resolve(root,site.slug);
  if(deploy)await deploy(site,directory);
  else {const r=spawnSync('npx',['--no-install','wrangler','pages','deploy',directory,'--project-name='+site.project,'--branch=main','--commit-dirty=true'],{stdio:'inherit',env:process.env});if(r.status!==0||r.error)throw Error('Brand upload failed: '+site.project);}
  const count=await verifyPublicDashboard(directory,fetcher,site.origin,verification);
  results.push({brand:site.slug,origin:site.origin,verifiedFiles:count});await receipt();
 }
 return results;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [mode,first,second]=process.argv.slice(2);
 if(mode==='build'&&first&&second)console.log(JSON.stringify(await writeBrandSites(first,second)));
 else if(mode==='publish'&&first)console.log(JSON.stringify(await publishBrandSites(first,{accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN})));
 else throw Error('Expected build <snapshot> <output> or publish <bundles>');
}
