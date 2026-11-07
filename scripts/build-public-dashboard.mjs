import fs from 'node:fs/promises';
import {brandOrigin} from './public-brand-hosts.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const touchIcon='apple-touch-icon-v2.png';
const isPng=(value)=>Buffer.isBuffer(value)&&value.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&value.length>=24&&value.readUInt32BE(16)===180&&value.readUInt32BE(20)===180;
const shared=['styles.css','app.js','xlsx-export.js','price-history.js','competitor-price-history.js'];
const validSlug=s=>typeof s==='string'&&/^[\p{L}\p{Nd}]+(?:-[\p{L}\p{Nd}]+)*$/u.test(s)&&s===s.toLowerCase();
const slugFor=s=>s.trim().toLowerCase().replace(/[^\p{L}\p{Nd}]+/gu,'-').replace(/^-+|-+$/g,'');
const clean=s=>s.replace(/GitHub Pages/gi,'대시보드');
const forbidden=/github(?:usercontent)?\.(?:com|io)|github\s*pages|kvicious23-eng|market-pulse-dashboard|ecimg\.cafe24img\.com/i;
const sha=s=>createHash('sha256').update(s).digest('hex');
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parseData=s=>JSON.parse(s.replace(/^\s*window\.MARKET_DATA\s*=\s*/,'').replace(/;\s*$/,''));

export async function discoverPublicBrands(root=new URL('../brand/',import.meta.url)){
 const result=[];
 for(const entry of await fs.readdir(root,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const files=await fs.readdir(new URL(encodeURIComponent(entry.name)+'/',root));
  if(!files.includes('index.html')&&!files.includes('market-data.js'))continue;
  if(!validSlug(entry.name)||!files.includes('index.html')||!files.includes('market-data.js'))throw Error('Incomplete brand dashboard: '+entry.name);
  result.push(entry.name);
 }
 if(!result.length)throw Error('No own-brand dashboards');
 return result.sort();
}

export function buildPublicDashboard(sources){
 const brands=[...new Set([...sources.keys()].filter(k=>k.startsWith('brand/')).map(k=>k.split('/')[1]))].sort();
 if(!brands.length||brands.some(b=>!validSlug(b)))throw Error('Invalid own-brand dashboard list');
 const files=new Map(),labels=new Map();
 for(const name of shared){
  const source=sources.get('dist/'+name);
  if(typeof source!=='string')throw Error('Missing shared asset: '+name);
  files.set('assets/'+name,clean(source));
 }
 for(const brand of brands){
  const html=sources.get('brand/'+brand+'/index.html'),raw=sources.get('brand/'+brand+'/market-data.js');
  if(typeof html!=='string'||typeof raw!=='string')throw Error('Incomplete published brand: '+brand);
  const data=parseData(raw);
  if(typeof data.meta?.brand!=='string'||slugFor(data.meta.brand)!==brand||!Array.isArray(data.products))throw Error('Published brand mismatch: '+brand);
  const icon=sources.get('brand/'+brand+'/'+touchIcon);
  if(!isPng(icon)||!html.includes('rel="apple-touch-icon" sizes="180x180" href="'+touchIcon+'"'))throw Error('Missing brand touch icon: '+brand);
  files.set(brand+'/'+touchIcon,icon);
  labels.set(brand,data.meta.brand);
  data.meta.monitoring=data.meta.monitoring||{};
  data.meta.monitoring.dashboardSync='외부 공개 대시보드';
  files.set(brand+'/market-data.js',clean('window.MARKET_DATA = '+JSON.stringify(data,null,2)+';\n'));
  files.set(brand+'/index.html',clean(html).replaceAll('../../dist/','/assets/').replace(/app\.js\?v=[^"']+/g,'app.js?v='+sha(files.get('assets/app.js')).slice(0,12)).replace(/styles\.css\?v=[^"']+/g,'styles.css?v='+sha(files.get('assets/styles.css')).slice(0,12)));
 }
 const links=brands.map(b=>`<li><a href="${brandOrigin(b)}">${escape(labels.get(b))}</a></li>`).join('');
 files.set('index.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market Pulse</title><style>body{font:18px system-ui;max-width:680px;margin:64px auto;padding:24px;background:#eef5f1;color:#12392a}li{margin:20px 0}a{color:#007d4a}</style><h1>Market Pulse</h1><p>브랜드별 가격 현황</p><ul>${links}</ul></html>`);
 files.set('404.html','<!doctype html><html lang="ko"><meta charset="utf-8"><title>페이지 없음</title><h1>대시보드를 찾을 수 없습니다.</h1><a href="/">브랜드 목록</a></html>');
 files.set('_headers','/*\n  Cache-Control: no-cache\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n');
 for(const [name,source] of files){
  if(typeof source==='string'&&forbidden.test(source))throw Error('External source reference rejected: '+name);
  if(Buffer.byteLength(source)>9500000)throw Error('Public asset too large: '+name);
 }
 return files;
}

// Read only the actually published internal result; never export the repository root.
export async function readPublicSources(fetcher=fetch,brands){
 brands=brands??await discoverPublicBrands();
 if(!Array.isArray(brands)||!brands.length||brands.some(b=>!validSlug(b))||new Set(brands).size!==brands.length)throw Error('Invalid brand list');
 const origin='https://kvicious23-eng.github.io/market-pulse-dashboard/';
 const paths=[...shared.map(f=>'dist/'+f),...brands.flatMap(b=>['brand/'+b+'/index.html','brand/'+b+'/market-data.js','brand/'+b+'/'+touchIcon])];
 const read=async p=>{
  const r=await fetcher(new URL(p+'?publicSnapshot='+Date.now(),origin),{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(r.status!==200)throw Error('Published source unavailable: '+p);
  return p.endsWith('.png')?Buffer.from(await r.arrayBuffer()):r.text();
 };
 const sources=new Map(await Promise.all(paths.map(async p=>[p,await read(p)])));
 for(const p of paths){const again=await read(p),first=sources.get(p);if(Buffer.isBuffer(first)?!first.equals(again):again!==first)throw Error('Published snapshot changed; retry after internal publication');}
 return sources;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const output=process.argv[2];if(!output)throw Error('Explicit empty output directory required');
 try{if((await fs.readdir(output)).length)throw Error('Output directory must be empty');}catch(e){if(e.code!=='ENOENT')throw e;}
 const files=buildPublicDashboard(await readPublicSources());
 for(const [name,source] of files){const dest=path.join(output,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,source);}
 console.log(JSON.stringify({files:files.size,brands:[...files.keys()].filter(p=>p.endsWith('/index.html')).map(p=>p.split('/')[0])}));
}
