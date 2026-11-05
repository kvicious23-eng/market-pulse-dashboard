import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const brands=['acer','lenovo','godox'];
const shared=['styles.css','app.js','xlsx-export.js','price-history.js','competitor-price-history.js'];
const marker=/github(?:usercontent)?\.(?:com|io)|github\s*pages|kvicious23-eng|market-pulse-dashboard/i;
const clean=text=>text.replace(/GitHub Pages/gi,'대시보드');
const digest=text=>createHash('sha256').update(text).digest('hex');
export const assetBase='https://ecimg.cafe24img.com/pg1690b26461132088/redwolfcorp/web/upload/publicmp/';
export function shellFor(brand){
 if(!brands.includes(brand))throw Error('Unsupported public brand');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market Pulse</title></head><body><p id="publicStatus">대시보드를 불러오고 있습니다.</p><script>document.write('<script src="${assetBase}${brand}-page.js?view='+Date.now()+'"></'+'script>');</script></body></html>`;
}
export function publicApp(source){
 const start=source.indexOf('  function watchForPublishedData() {');
 const end=source.indexOf('  function renderSupplierMetrics(',start);
 if(start<0||end<start)throw Error('Dashboard watch function changed; review external adapter');
 return 'document.getElementById("publicStatus")?.remove();\n'+source.slice(0,start)+`  function watchForPublishedData() {
    const initialScript=[...document.scripts].find(s=>/market-data\\.js(?:\\?|$)/.test(s.src));
    if(!initialScript)return;
    window.setInterval(()=>{
      const script=document.createElement('script');
      script.src=initialScript.src+(initialScript.src.includes('?')?'&':'?')+'check='+Date.now();
      const cleanup=()=>script.remove();
      script.onload=()=>{
        const newest=window.MARKET_DATA;
        if(newest?.meta?.brand===data.meta.brand){
          const latest=newest.meta.publishedAt||newest.meta.snapshotAt;
          if(JSON.stringify(newest.meta.competitorPhase||null)!==JSON.stringify(data.meta.competitorPhase||null)||(latest&&latest!==(data.meta.publishedAt||data.meta.snapshotAt)))location.reload();
        }
        window.MARKET_DATA=data;cleanup();
      };
      script.onerror=cleanup;document.head.append(script);
      window.setTimeout(cleanup,15000);
    },300000);
  }

`+source.slice(end);
}
export function buildPublicSnapshot(sources){
 const files=new Map();
 for(const file of shared)files.set('upload/'+file,clean(file==='app.js'?publicApp(sources.get('dist/'+file)):sources.get('dist/'+file)));
 for(const brand of brands){
  const data=clean(sources.get('brand/'+brand+'/market-data.js'));
  const parsed=JSON.parse(data.replace(/^\s*window\.MARKET_DATA\s*=\s*/,'').replace(/;\s*$/,''));
  if(parsed.meta.brand.toLowerCase()!==brand||!Array.isArray(parsed.products))throw Error('Published brand mismatch');
  parsed.meta.monitoring=parsed.meta.monitoring||{};parsed.meta.monitoring.dashboardSync='외부 게시본 · 자동 동기화 연결 대기';
  files.set('upload/'+brand+'-market-data.js','window.MARKET_DATA = '+JSON.stringify(parsed,null,2)+';\n');
  const html=clean(sources.get('brand/'+brand+'/index.html')).replace(/<head>/i,'<head><base href="/publicmp/'+brand+'/">').replaceAll('../../dist/',assetBase).replaceAll('./market-data.js',assetBase+brand+'-market-data.js').replace(/app\.js\?v=[^"']+/g,'app.js?v=public-'+digest(files.get('upload/app.js')).slice(0,12));
  files.set('upload/'+brand+'-page.js','document.open();document.write('+JSON.stringify(html)+');document.close();\n');
  files.set('skin/'+brand+'/index.html',shellFor(brand));
 }
 for(const [name,text] of files){if(typeof text!=='string'||marker.test(text))throw Error('Public source reference rejected: '+name);if(Buffer.byteLength(text)>9500000)throw Error('Cafe24 file size exceeded');}
 return files;
}
export async function readPublishedSnapshot(fetcher=fetch){
 const origin='https://kvicious23-eng.github.io/market-pulse-dashboard/';
 const paths=[...shared.map(f=>'dist/'+f),...brands.flatMap(b=>['brand/'+b+'/index.html','brand/'+b+'/market-data.js'])];
 const read=async p=>{const r=await fetcher(new URL(p+'?externalSnapshot='+Date.now(),origin),{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});if(r.status!==200)throw Error('Published source unavailable: '+p);return r.text();};
 const sources=new Map(await Promise.all(paths.map(async p=>[p,await read(p)])));
 // Do not export a snapshot that changed while the files were being read.
 for(const b of brands){const p='brand/'+b+'/market-data.js';if(await read(p)!==sources.get(p))throw Error('Published data changed during export; retry later');}
 return sources;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const output=process.argv[2];if(!output)throw Error('An explicit output directory is required');
 const files=buildPublicSnapshot(await readPublishedSnapshot());
 const manifest={createdAt:new Date().toISOString(),files:[]};
 for(const [name,text] of files){const dest=path.join(output,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,text);manifest.files.push({path:name,sha256:digest(text),bytes:Buffer.byteLength(text)});}
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({output,files:files.size,bytes:manifest.files.reduce((n,f)=>n+f.bytes,0)}));
}
