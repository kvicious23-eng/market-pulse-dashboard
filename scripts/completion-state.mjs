import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const identity=(brand,p)=>[brand,p.mtm,p.productId,p.itemId,p.vendorItemId].join('|');
export function ownPublicationFingerprint(repo,catalog,slot,runId){
 if(!Array.isArray(catalog?.products)||!/^[a-f0-9]{32}$/.test(runId)||!Number.isFinite(Date.parse(slot)))throw Error('Invalid own publication identity');
 const expected=catalog.products.filter(p=>p.enabled!==false).map(p=>identity(p.brand,p)).sort(),actual=[],projection=[];
 const root=path.join(repo,'brand');
 for(const e of (fs.existsSync(root)?fs.readdirSync(root,{withFileTypes:true}):[]).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=path.join(root,e.name,'market-data.js');if(!fs.existsSync(file))continue;
  const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  if(!/^\s*window\.MARKET_DATA\s*=/.test(text))throw Error('Invalid published own data');
  const d=JSON.parse(text.slice(text.indexOf('=')+1).trim().replace(/;\s*$/,''));
  if(!Array.isArray(d.products))throw Error('Invalid published own products');
  if(!d.products.length)continue;
  const proof=d.meta?.collectionEvidence;
  if(Date.parse(proof?.scanSlot)!==Date.parse(slot)||(proof?.sourceRunId||proof?.runId)!==runId)throw Error('Published own source differs');
  const products=d.products.map(p=>{
   const key=identity(d.meta.brand,p);actual.push(key);
   return {key,offers:(p.offers||[]).filter(o=>o.role==='mine')};
  }).sort((a,b)=>a.key.localeCompare(b.key));
  projection.push({brand:d.meta.brand,snapshotAt:d.meta.snapshotAt,publishedAt:d.meta.publishedAt,proof,products});
 }
 actual.sort();if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Published own catalogue differs');
 const history=path.join(repo,'dist','price-history.js');
 return createHash('sha256').update(JSON.stringify(canonical({projection,history:fs.existsSync(history)?fs.readFileSync(history,'utf8').replace(/\r\n/g,'\n'):null}))).digest('hex');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [repo,catalogPath,slot,runId]=process.argv.slice(2);process.stdout.write(ownPublicationFingerprint(repo,readJSON(catalogPath),slot,runId));}
 catch{process.exitCode=2;}
}
