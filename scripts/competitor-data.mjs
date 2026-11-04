import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),models=require('../chrome-extension/competitor-models.js');
export const headers=['수집시각','브랜드','MTM','경쟁모델','상품식별자','회차','요청ID','상태','기준가격','일반쿠폰','와우즉시','와우쿠폰','카드할인','최종가','확인시각','상품URL','배송비'];
const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const readData=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF?\s*window\.MARKET_DATA\s*=\s*/,'').replace(/;\s*$/,''));
const kst=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)):'';
const writeData=(p,d)=>fs.writeFileSync(p,'window.MARKET_DATA = '+JSON.stringify(d,null,2)+';\n');
const safeEvidence=values=>[...new Set((Array.isArray(values)?values:[]).filter(v=>typeof v==='string').map(v=>v.replace(/\s+/g,' ').trim()).filter(v=>/(일반\s*쿠폰할인|상품\s*쿠폰\s*할인|쿠폰\s*할인|와우.*(?:즉시|쿠폰)\s*할인)/.test(v)&&!/(결제수단|카드번호|배송지|수령인|전화번호|개인정보|쿠페이|쿠팡캐시|https?:\/\/)/.test(v)).map(v=>v.slice(0,180)))].slice(0,12);
export function offerFor(row,target){
  const o={role:'competitor',kind:'coupang-model',competitorKey:target.competitorKey,model:target.model,seller:target.model,channel:'쿠팡 경쟁모델',url:target.url,sourceType:'쿠팡 상품페이지·주문서',confidence:'C',srp:null,shipping:null,
    observedListPrice:null,preCardPrice:null,finalPrice:null,alertEligible:false,cardBenefitStatus:'unverified',checkoutDiscountStatus:'missing',status:'수집 미확인',collectionStatus:'review-needed',collectionIssue:'product-unavailable',priceCheckedAt:kst(row?.checkedAt),checkedAt:kst(row?.checkedAt)};
  if(!row?.ok)return o;
  const basis=row.basisPrice;
  if(!Number.isSafeInteger(row.price)||row.price<10000||row.price>7000000||!row.basisEvidence||row.strikePrice!==basis||!Number.isSafeInteger(basis)||basis<10000||basis>7000000||row.strikeReliable!==true||row.strikeAnchorVerified!==true||!['top-visible','crossed-out'].includes(row.priceBasisType)||row.priceBasisSource!=='visible-product-price')return o;
  o.observedListPrice=basis;o.priceBasisType=row.priceBasisType;
  if(['buy-now-button-not-found','buy-now-button-sold-out'].includes(row.checkoutDiscountReason))return {...o,confidence:'A',status:'품절',collectionStatus:null,collectionIssue:null,checkoutDiscountStatus:'soldout',checkoutDiscountReason:row.checkoutDiscountReason};
  if(row.checkoutDiscountStatus!=='captured'||row.checkoutCouponSource!=='checkout')return {...o,collectionIssue:'checkout-unconfirmed'};
  const discounts=[row.checkoutCouponDiscount,row.wowInstantDiscount,row.wowCouponDiscount];
  if(discounts.some(n=>!Number.isSafeInteger(n)||n<0)||discounts.reduce((a,b)=>a+b,0)>basis||(row.checkoutDiscountTotal!=null&&row.checkoutDiscountTotal!==discounts.reduce((a,b)=>a+b,0)))return {...o,collectionIssue:'checkout-unconfirmed'};
  const pre=basis-discounts.reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(row.checkoutShipping)||row.checkoutShipping<0||row.checkoutShipping>100000)return {...o,status:'배송비 미확인',collectionIssue:'shipping-unconfirmed'};
  const shipping=row.checkoutShipping;o.shipping=shipping;
  Object.assign(o,{preCardPrice:pre+shipping,couponDiscount:basis-pre,checkoutCouponDiscount:discounts[0],wowInstantDiscount:discounts[1],wowCouponDiscount:discounts[2],checkoutDiscountStatus:'captured',checkoutDiscountReason:row.checkoutDiscountReason,checkoutDiscountFieldStatus:row.checkoutDiscountFieldStatus||null,checkoutDiscountEvidence:safeEvidence(row.checkoutDiscountEvidence),cardProviders:row.cardProviders||[],cardTerms:row.cardTerms||[],cardRate:row.cardRate??null,cardMaxDiscount:row.cardMaxDiscount??null,cardBenefitText:row.cardBenefitText||''});
  if(row.cardBenefitStatus==='none'&&(row.cardDiscount==null||row.cardDiscount===0))return {...o,confidence:'A',collectionStatus:null,collectionIssue:null,status:'현재가 직접 확인',finalPrice:pre+shipping,cardDiscount:0,cardBenefitStatus:'none',alertEligible:true};
  const terms=row.cardTerms;
  if(!/^(?:dom|dom-snapshot|accessibility)(?:\+(?:dom|dom-snapshot|accessibility))*$/.test(row.cardEvidenceSource||'')||row.cardBenefitStatus!=='captured'||!Array.isArray(terms)||!terms.length||terms.some(t=>!Number.isFinite(t.rate)||t.rate<=0||t.rate>100||(t.maxDiscount!==null&&(!Number.isSafeInteger(t.maxDiscount)||t.maxDiscount<=0))||!Array.isArray(t.providers)||!t.providers.length||t.providers.some(p=>typeof p!=='string'||!p.trim())))return {...o,collectionStatus:null,collectionIssue:'card-unconfirmed',status:'카드할인 재확인 필요',finalPrice:pre+shipping,cardDiscount:null,cardBenefitStatus:'review-needed',publishedPriceBasis:'pre-card'};
  const observedBest=Math.max(...terms.map(t=>Math.min(Math.floor(row.price*t.rate/100),t.maxDiscount??Infinity)));
  if(row.cardDiscount!==observedBest)return {...o,collectionStatus:null,collectionIssue:'card-unconfirmed',status:'카드할인 재확인 필요',finalPrice:pre+shipping,cardDiscount:null,cardBenefitStatus:'review-needed',publishedPriceBasis:'pre-card'};
  const best=terms.map(t=>({...t,amount:Math.min(Math.floor(pre*t.rate/100),t.maxDiscount??Infinity)})).sort((a,b)=>b.amount-a.amount)[0];
  return {...o,confidence:'A',collectionStatus:null,collectionIssue:null,status:'현재가 직접 확인',finalPrice:pre+shipping-best.amount,cardDiscount:best.amount,cardBenefitStatus:'captured',cardRate:best.rate,cardMaxDiscount:best.maxDiscount,cardProviders:best.providers,alertEligible:true};
}
export function readHistory(repo,{allowRetired=false}={}){
  const p=path.join(repo,'dist/competitor-price-history.js');
  if(!fs.existsSync(p))return {schema:2,headers,rows:[]};
  const h=JSON.parse(fs.readFileSync(p,'utf8').replace(/^window\.MARKET_PULSE_COMPETITOR_HISTORY\s*=\s*/,'').replace(/;\s*$/,''));
  if(h.schema!==2){if(allowRetired)return {schema:2,headers,rows:[]};throw Error('Unexpected competitor history schema; preserve original');}
  if(!Array.isArray(h.rows)||!Array.isArray(h.headers))throw Error('Competitor history schema damaged');
  if(!h.rows.length)return {schema:2,headers,rows:[]};
  if(JSON.stringify(h.headers)!==JSON.stringify(headers)||h.rows.some(r=>!Array.isArray(r)||r.length!==headers.length))throw Error('Competitor history columns damaged');
  return h;
}
export function writeHistory(repo,h){
  fs.writeFileSync(path.join(repo,'dist/competitor-price-history.js'),'window.MARKET_PULSE_COMPETITOR_HISTORY = '+JSON.stringify(h)+';\n');
  fs.mkdirSync(path.join(repo,'reports'),{recursive:true});
  const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  fs.writeFileSync(path.join(repo,'reports/competitor-price-history.csv'),'\uFEFF'+[h.headers,...h.rows].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n');
}
export function assertCurrentSource(repo,catalog,queue){
  if(!/^[a-f0-9]{32}$/.test(queue?.sourceRunId||''))throw Error('Competitor source identity missing');
  for(const entry of fs.readdirSync(path.join(repo,'brand'),{withFileTypes:true}).filter(e=>e.isDirectory())){
    const file=path.join(repo,'brand',entry.name,'market-data.js');if(!fs.existsSync(file))continue;
    const d=readData(file),active=d.products.some(p=>catalog.products.some(x=>x.enabled!==false&&x.brand===d.meta.brand&&['mtm','productId','itemId','vendorItemId'].every(k=>x[k]===p[k])));
    if(active&&(d.meta.collectionEvidence?.scanSlot!==queue.scanSlot||(d.meta.collectionEvidence?.sourceRunId||d.meta.collectionEvidence?.runId)!==queue.sourceRunId))throw Error('Competitor publication superseded');
  }
}
export function syncData(repo,catalog,{queue=null,result=null,migrate=false}={}){
  if(!catalog||!Array.isArray(catalog.products))throw Error('Competitor catalog products missing');
  const ownerKeys=new Set();for(const p of catalog.products){const key=[p.brand,p.mtm,p.productId,p.itemId,p.vendorItemId].join('|');if(!p.brand||!p.mtm||!['productId','itemId','vendorItemId'].every(k=>/^\d+$/.test(p[k]||''))||ownerKeys.has(key))throw Error('Competitor owner catalog invalid');ownerKeys.add(key);}
  const products=catalog.products,targets=models.targets(products),lookup=new Map(targets.map(t=>[t.competitorKey,t]));
  const historyKey=r=>[r[1],r[2],r[4],r[5],r[6]].join('|');
  const h=readHistory(repo,{allowRetired:migrate}),historyKeys=new Set(h.rows.map(historyKey)),writes=[];
  if(result){
    if(!queue||!/^[a-f0-9]{32}$/.test(queue.sourceRunId||'')||!/^[a-f0-9]{32}$/.test(queue.requestId||'')||result.version!==1||result.scope!=='competitors'||result.sourceRunId!==queue.sourceRunId||result.scanSlot!==queue.scanSlot||result.terminal!==true||result.requestId!==queue.requestId||result.browser!==queue.browser||result.deadlineAt!==queue.deadlineAt||!Array.isArray(result.results)||result.total!==queue.targets.length)throw Error('Competitor result identity mismatch');
    if([result.startedAt,result.completedAt,queue.firstPublishedAt,queue.deadlineAt,queue.publicationDeadline].some(t=>!Number.isFinite(Date.parse(t))))throw Error('Competitor result time missing/invalid');
    if(!Array.isArray(queue.targets)||new Set(queue.targets.map(t=>t.competitorKey)).size!==queue.targets.length)throw Error('Competitor queue targets malformed');
    for(const t of queue.targets){const id=models.identity(t.url);if(t.competitorKey!==id.key||['productId','itemId','vendorItemId'].some(k=>t[k]!==id[k]))throw Error('Competitor queue identity mismatch');}
    if(!result.stoppedReason&&result.results.length!==queue.targets.length)throw Error('Incomplete competitor result without stop reason');
    if(Date.parse(result.startedAt)<Date.parse(queue.firstPublishedAt)||Date.parse(result.completedAt)<Date.parse(result.startedAt)||Date.parse(result.completedAt)>Date.parse(queue.publicationDeadline))throw Error('Competitor result time mismatch');
    const requested=new Map(queue.targets.map(t=>[t.competitorKey,t])),seen=new Set();
    for(const r of result.results){const t=requested.get(r.competitorKey);if(!t||seen.has(r.competitorKey)||['productId','itemId','vendorItemId','url'].some(k=>r[k]!==t[k])||Date.parse(r.checkedAt)>Date.parse(queue.deadlineAt)||Date.parse(r.checkedAt)<Date.parse(result.startedAt)||Date.parse(r.checkedAt)>Date.parse(result.completedAt)||!Number.isFinite(Date.parse(r.checkedAt)))throw Error('Competitor row identity/time mismatch');seen.add(r.competitorKey);}
  }
  for(const entry of fs.readdirSync(path.join(repo,'brand'),{withFileTypes:true}).filter(e=>e.isDirectory())){
    const file=path.join(repo,'brand',entry.name,'market-data.js');if(!fs.existsSync(file))continue;
    const d=readData(file),brand=d.meta.brand;let touched=false;
    if(Array.isArray(d.history))d.history=d.history.flatMap(entry=>{
      if(!/danawa|enuri|naver|다나와|에누리|네이버|competitorBest|competitorSeller/i.test(JSON.stringify(entry)))return [entry];
      if(!entry.products)return [];
      const products=Object.fromEntries(Object.entries(entry.products).map(([key,value])=>{const {competitorBest,competitorSeller,difference,inverted,...mine}=value;return [key,mine];}));
      return [{...entry,source:'Coupang own price archive',products}];
    });

    if(queue&&(d.meta.collectionEvidence?.scanSlot!==queue.scanSlot||(d.meta.collectionEvidence?.sourceRunId||d.meta.collectionEvidence?.runId)!==queue.sourceRunId)){
      if(d.products.some(p=>products.some(x=>x.enabled!==false&&x.brand===brand&&x.itemId===p.itemId)))throw Error('Competitor publication superseded');
      continue;
    }
    for(const p of d.products){
      const current=products.find(x=>x.brand===brand&&x.mtm===p.mtm&&x.productId===p.productId&&x.itemId===p.itemId&&x.vendorItemId===p.vendorItemId&&x.enabled!==false);
      const previous=p.competitorModels||[];
      const links=current?models.links(current).filter(c=>c.enabled):[];
      p.competitorModels=links.map(c=>{
        const old=previous.find(o=>o.competitorKey===c.key),target=lookup.get(c.key);
        const row=result?.results.find(r=>r.competitorKey===c.key);
        const retain=!queue&&old?.phaseState==='collected'&&old.comparisonSlot===d.meta.collectionEvidence?.scanSlot&&old.collectionEvidence?.sourceRunId===(d.meta.collectionEvidence?.sourceRunId||d.meta.collectionEvidence?.runId);
        let o=retain?{...old}:row?offerFor(row,{...target,model:c.model}):{...(old||offerFor(null,{...target,model:c.model})),status:queue?'시간 내 미수집':'경쟁모델 업데이트 중',alertEligible:false,collectionStatus:'review-needed',collectionIssue:'competitor-pending',finalPrice:null,observedListPrice:null,preCardPrice:null,couponDiscount:null,checkoutCouponDiscount:null,wowInstantDiscount:null,wowCouponDiscount:null,checkoutDiscountStatus:'missing',cardBenefitStatus:'unverified',cardDiscount:null};
        if(row)o.collectionEvidence={browser:result.browser,extensionVersion:result.extensionVersion||null,requestId:queue.requestId,sourceRunId:queue.sourceRunId,checkedAt:row.checkedAt};
        o={...o,model:c.model,seller:c.model,note:c.note,comparisonSlot:d.meta.collectionEvidence?.scanSlot||null,phaseState:retain||row?'collected':queue?'not-collected':'pending'};
        if(old&&!o.alertEligible){const last=old.alertEligible?old.finalPrice:old.lastVerifiedFinalPrice;if(Number.isFinite(last)){o.lastVerifiedFinalPrice=last;o.lastVerifiedPriceCheckedAt=old.alertEligible?old.priceCheckedAt:old.lastVerifiedPriceCheckedAt;}}
        if(row||queue){
          const values=[result.completedAt,brand,p.mtm,c.model,c.key,queue.scanSlot,queue.requestId,o.status,o.observedListPrice,o.checkoutCouponDiscount,o.wowInstantDiscount,o.wowCouponDiscount,o.cardDiscount,o.alertEligible?o.finalPrice:null,o.priceCheckedAt,c.url,o.shipping],key=historyKey(values);
          if(!historyKeys.has(key)){h.rows.push(values);historyKeys.add(key);}
        }
        return o;
      });
      // The retired comparison channels can never be restored by an old scan.
      p.offers=(p.offers||[]).filter(o=>o.role==='mine');p.references=[];touched=true;
    }
    if(touched){if(migrate)d.meta.publishedAt=new Date().toISOString();delete d.meta.monitoring.competitionLastAttemptAt;delete d.meta.monitoring.competitionConfigurationStatus;d.meta.comparisonBasis='사용자가 지정한 쿠팡 경쟁모델의 가격 구성과 실제 확인시각 비교';d.meta.exclusions='품절·수집 오류·이전 회차 가격은 현재 순위와 차액에서 제외. 카드사별 조건은 개별 확인.';d.meta.monitoring.competitionValidationStatus='coupang-models';d.meta.competitorPhase={scanSlot:d.meta.collectionEvidence?.scanSlot||null,state:queue?(result?.stoppedReason?'partial':'complete'):(d.products.some(p=>p.competitorModels.some(o=>o.phaseState==='pending'))?'waiting':'complete'),count:d.products.reduce((n,p)=>n+p.competitorModels.length,0),sourceRunId:queue?.sourceRunId||null,completedAt:result?.completedAt||null};writes.push([file,d]);}
  }
  // All identity, time, catalogue and history validation precedes writes.
  for(const [file,d] of writes)writeData(file,d);writeHistory(repo,h);
  return {targets,capacity:models.capacity(products)};
}
if(process.argv[1]===new URL(import.meta.url).pathname||process.argv[1]?.endsWith('competitor-data.mjs')){
  const [mode,repo,catalogPath,queuePath,resultPath]=process.argv.slice(2),catalog=readJSON(catalogPath);
  if(mode==='plan')console.log(JSON.stringify({targets:models.targets(catalog.products),capacity:models.capacity(catalog.products)}));
  else if(mode==='verify-source')assertCurrentSource(repo,catalog,readJSON(queuePath));
  else if(['prepare','migrate','merge'].includes(mode))syncData(repo,catalog,{migrate:mode==='migrate',queue:queuePath?readJSON(queuePath):null,result:resultPath?readJSON(resultPath):null});
  else throw Error('Unknown competitor-data mode');
}
