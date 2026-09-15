const TARGETS = [
  {brand:'Lenovo',category:'Notebook',mtm:'83N30037KR',productId:'9235110727',itemId:'27303279355',vendorItemId:'95415897534',skuid:'',srp:1109000,enabled:true,url:'https://www.coupang.com/vp/products/9235110727?itemId=27303279355&vendorItemId=95415897534'},
  {brand:'Lenovo',category:'Notebook',mtm:'83N3003DKR',productId:'9235110727',itemId:'27303268765',vendorItemId:'95415897535',skuid:'',srp:1159000,enabled:true,url:'https://www.coupang.com/vp/products/9235110727?itemId=27303268765&vendorItemId=95415897535'},
  {brand:'Lenovo',category:'Notebook',mtm:'83N30046KR',productId:'8708708250',itemId:'25515648568',vendorItemId:'95415897536',skuid:'',srp:1199000,enabled:true,url:'https://www.coupang.com/vp/products/8708708250?itemId=25515648568&vendorItemId=95415897536'},
  {brand:'Acer',category:'Notebook',mtm:'ANV16-I31-514Z',productId:'9573633117',itemId:'28575928128',vendorItemId:'95520178041',skuid:'74357773',srp:1558000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=28575928128&vendorItemId=95520178041',danawaUrl:'https://prod.danawa.com/info/?pcode=122672194'},
  {brand:'Acer',category:'Notebook',mtm:'AG14-I71M-972S',productId:'9681715061',itemId:'28951318769',vendorItemId:'95881909514',skuid:'77524457',srp:1429000,enabled:true,url:'https://www.coupang.com/vp/products/9681715061?itemId=28951318769&vendorItemId=95881909514',danawaUrl:'https://prod.danawa.com/info/?pcode=123650595'},
  {brand:'Acer',category:'Notebook',mtm:'AG14-I71M-96C5',productId:'9681715061',itemId:'28951318771',vendorItemId:'95881909515',skuid:'',srp:1569000,enabled:true,url:'https://www.coupang.com/vp/products/9681715061?itemId=28951318771&vendorItemId=95881909515',danawaUrl:'https://prod.danawa.com/info/?pcode=123763381'},
  {brand:'Acer',category:'Notebook',mtm:'PHN16S-71-949J',productId:'9573633117',itemId:'26004597899',vendorItemId:'92986675922',skuid:'',srp:4099000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=26004597899&vendorItemId=92986675922',danawaUrl:'https://prod.danawa.com/info/?pcode=93445997'},
  {brand:'Acer',category:'Notebook',mtm:'SFG14-I71-57P5',productId:'9616664363',itemId:'28714706385',vendorItemId:'95655361667',skuid:'',srp:1689000,enabled:true,url:'https://www.coupang.com/vp/products/9616664363?itemId=28714706385&vendorItemId=95655361667',danawaUrl:'https://prod.danawa.com/info/?pcode=122719782'},
  {brand:'Acer',category:'Notebook',mtm:'SFG14-75-508U',productId:'9428079675',itemId:'28287192873',vendorItemId:'95240133006',skuid:'',srp:1229000,enabled:true,url:'https://www.coupang.com/vp/products/9428079675?itemId=28287192873&vendorItemId=95240133006',danawaUrl:'https://prod.danawa.com/info/?pcode=122636128'},
  {brand:'Acer',category:'Notebook',mtm:'SFG16-74-7412',productId:'9573633117',itemId:'28029585486',vendorItemId:'94986693706',skuid:'',srp:1659000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=28029585486&vendorItemId=94986693706',danawaUrl:'https://prod.danawa.com/info/?pcode=122702450'},
  {brand:'Acer',category:'Notebook',mtm:'SFG16-I71-75Y2',productId:'9483273252',itemId:'28237319655',vendorItemId:'95190959758',skuid:'',srp:1829000,enabled:true,url:'https://www.coupang.com/vp/products/9483273252?itemId=28237319655&vendorItemId=95190959758',danawaUrl:'https://prod.danawa.com/info/?pcode=122636236'},
  {brand:'Acer',category:'Notebook',mtm:'SFG16-74-70E9',productId:'9573633117',itemId:'28714706401',vendorItemId:'95655361668',skuid:'',srp:1439000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=28714706401&vendorItemId=95655361668',danawaUrl:'https://prod.danawa.com/info/?pcode=122719720'},
  {brand:'Acer',category:'Notebook',mtm:'SF16-71T-7475',productId:'9437677217',itemId:'28067081535',vendorItemId:'95023756227',skuid:'',srp:2369000,enabled:true,url:'https://www.coupang.com/vp/products/9437677217?itemId=28067081535&vendorItemId=95023756227',danawaUrl:'https://prod.danawa.com/info/?pcode=107769113'}
];

async function getTargets() {
  const state=await chrome.storage.local.get(['products']);
  return Array.isArray(state.products) ? state.products : TARGETS;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function localDay() {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul'}).format(new Date());
}

async function waitForComplete(tabId) {
  for (let i = 0; i < 45; i++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return true;
    await wait(1000);
  }
  // Some shopping pages keep ad/tracker requests open indefinitely even
  // though the product DOM is already usable. Continue with the DOM scan.
  return false;
}

async function readDisplayedPrice(expectedItemId) {
  const params = new URL(location.href).searchParams;
  const actualItemId = params.get('itemId');
  const bodyText = document.body?.innerText || '';
  if (actualItemId !== expectedItemId) return {ok:false, reason:'item-id-mismatch', actualItemId};
  if (/Access Denied|비정상적인 접근|잠시 후 다시 시도|로봇이 아닙니다|captcha/i.test(bodyText)) {
    return {ok:false, reason:'access-check'};
  }
  const candidates = [];
  const addCandidate = (value, source, text='') => {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    const price = Number(digits);
    if (price >= 250000 && price <= 7000000 && !candidates.some(x=>x.price===price && x.source===source)) {
      candidates.push({price, source, text:String(text).trim().slice(0,160)});
    }
  };

  for (const selector of ['meta[property="product:price:amount"]','meta[property="og:price:amount"]','meta[itemprop="price"]']) {
    for (const node of document.querySelectorAll(selector)) addCandidate(node.content, selector, node.outerHTML);
  }
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed=JSON.parse(node.textContent);
      const walk=value=>{
        if (!value || typeof value!=='object') return;
        if (value.price) {
          const type=String(value['@type']||'');
          const source=/UnitPriceSpecification/i.test(type)?'json-ld-unit-price':'json-ld';
          addCandidate(value.price,source,value.name||type||'');
        }
        for (const child of Object.values(value)) if (typeof child==='object') walk(child);
      };
      walk(parsed);
    } catch (_) {}
  }

  const selectors = [
    'strong.price-value',
    '.prod-sale-price .total-price strong',
    '.prod-price .total-price strong',
    '.total-price strong',
    '[class*="price"] strong',
    '[class*="Price"] strong',
    '[class*="price-value"]',
    '[data-price]'
  ];
  const positionedPrices=[];
  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const raw=node.getAttribute('data-price')||node.textContent;
      addCandidate(raw,selector,node.parentElement?.innerText||node.textContent);
      const price=Number(String(raw??'').replace(/[^0-9]/g,''));
      if (rect.width>0&&rect.height>0&&price>=250000&&price<=7000000) {
        positionedPrices.push({price,top:rect.top+scrollY,left:rect.left+scrollX,selector});
      }
    }
  }
  const wonMatches = bodyText.match(/(?:[0-9]{1,3},){1,2}[0-9]{3}\s*원/g) || [];
  for (const text of wonMatches.slice(0,40)) addCandidate(text,'visible-won-text',text);

  const preferred = candidates.find(x=>/price-value|prod-sale-price|total-price/.test(x.source))
    || candidates.find(x=>x.source==='json-ld')
    || candidates.find(x=>x.source.startsWith('meta'));
  const strikeCandidates=[];
  for (const selector of ['.prod-origin-price','.origin-price','[class*="origin-price"]','[class*="base-price"]']) {
    for (const node of document.querySelectorAll(selector)) {
      const style=getComputedStyle(node);
      const digits=(node.textContent||'').replace(/[^0-9]/g,'');
      const price=Number(digits);
      if (style.display!=='none'&&style.visibility!=='hidden'&&price>=250000&&price<=7000000) strikeCandidates.push({price,selector});
    }
  }
  // UnitPriceSpecification belongs to the active offer. Generic <del>/<s>
  // nodes also contain other variants and recommendations, so never use them.
  const jsonStrike=candidates.find(x=>x.source==='json-ld-unit-price'&&(!preferred||x.price>=preferred.price));
  const topVisiblePrice=positionedPrices
    .filter(x=>!preferred||x.price>=preferred.price)
    .sort((a,b)=>a.top-b.top||a.left-b.left)[0];
  const strike=jsonStrike
    ? {price:jsonStrike.price,selector:jsonStrike.source,basisType:'crossed-out'}
    : preferred ? ((()=>{const candidate=strikeCandidates.find(x=>x.price>=preferred.price);return candidate?{...candidate,basisType:'crossed-out'}:null;})()
      || (topVisiblePrice?{price:topVisiblePrice.price,selector:'top-visible-price',basisType:'top-visible'}:null)) : null;
  let cardDiscount=null;
  let cardRate=null;
  let cardMaxDiscount=null;
  let cardProviders=[];
  let cardBenefitText='';
  let cardBenefitStatus=/카드\s*즉시할인/.test(bodyText)?'partial':'none';
  if (preferred) {
    const visible=node=>{
      const style=getComputedStyle(node);
      return style.display!=='none'&&style.visibility!=='hidden'&&node.getBoundingClientRect().width>0;
    };
    const compact=node=>(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();
    const summaryNodes=[...document.querySelectorAll('div,li,p')]
      .filter(node=>visible(node)&&/카드\s*즉시할인/.test(compact(node))&&compact(node).length<700)
      .sort((a,b)=>compact(a).length-compact(b).length);
    const summaryRoot=summaryNodes[0]||null;
    const summaryText=compact(summaryRoot);
    if (summaryRoot) cardBenefitStatus='partial';
    const parseRate=text=>Number(text.match(/(?:최대\s*)?([0-9]+(?:\.[0-9]+)?)\s*%/)?.[1]||0);
    const parseKrwAmount=raw=>{
      const normalized=raw.replace(/[\s,]/g,'');
      if (!normalized.includes('만')) return Number(normalized);
      const [tenThousands,remainder='']=normalized.split('만');
      return Number(tenThousands)*10000+Number(remainder||0);
    };
    const parseCap=text=>{
      const maxPattern=/최대\s*(?:할인\s*)?(?:금액|한도)?\s*([0-9][0-9,]*(?:\s*만\s*[0-9,]*)?)\s*원/g;
      for (const match of text.matchAll(maxPattern)) {
        const prefix=text.slice(Math.max(0,match.index-24),match.index);
        if (/적립|캐시/.test(prefix)) continue;
        return parseKrwAmount(match[1]);
      }
      const direct=text.match(/할인\s*(?:금액|한도)[^0-9]{0,20}([0-9][0-9,]*(?:\s*만\s*[0-9,]*)?)\s*원/);
      return direct?parseKrwAmount(direct[1]):null;
    };
    let detailText='';
    let detailRoot=null;
    if (summaryRoot) {
      // Prefer the blue "와우 전용" control. A broad nearby-icon search can
      // open Coupang's unrelated price-information popup.
      const controlScope=summaryRoot.parentElement?.parentElement||summaryRoot.parentElement||summaryRoot;
      const textControls=[...controlScope.querySelectorAll('a,button,[role="button"],span')]
        .filter(node=>visible(node)&&compact(node).length<120&&/와우\s*전용/.test(compact(node)))
        .sort((a,b)=>compact(a).length-compact(b).length);
      const summaryRect=summaryRoot.getBoundingClientRect();
      const iconControls=[...controlScope.querySelectorAll('button,[role="button"],[aria-label],[data-tooltip],svg,i')]
        .map(node=>['svg','i'].includes(node.tagName.toLowerCase())?(node.closest('button,[role="button"]')||node.parentElement):node)
        .filter(node=>node&&visible(node)&&!node.closest('a[href]:not([href="#"])'))
        .sort((a,b)=>{
          const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
          const ad=Math.hypot(ar.left-summaryRect.right,ar.top-summaryRect.top);
          const bd=Math.hypot(br.left-summaryRect.right,br.top-summaryRect.top);
          return ad-bd;
        });
      const controls=[...new Set([...textControls,...iconControls])];
      const hasCapText=text=>Number.isFinite(parseCap(text));
      const readDetail=()=>{
        const layers=[...document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="layer"],[class*="popover"],[class*="tooltip"]')]
          .filter(node=>visible(node)&&/카드/.test(compact(node))&&compact(node).length>=20&&compact(node).length<12000)
          .sort((a,b)=>compact(a).length-compact(b).length);
        const layerWithCap=layers.find(node=>hasCapText(compact(node)));
        if (layerWithCap) return layerWithCap;
        // Some Coupang popups use generated class names without modal/layer
        // keywords. Search visible compact containers only after the card icon
        // interaction, and require both card/discount wording and a cap amount.
        const capContainers=[...document.querySelectorAll('div,section,table')]
          .filter(node=>visible(node)&&/카드/.test(compact(node))&&hasCapText(compact(node))&&compact(node).length>=20&&compact(node).length<4000)
          .sort((a,b)=>compact(a).length-compact(b).length);
        return capContainers[0]||layers[0]||null;
      };
      for (const detailControl of controls.slice(0,8)) {
        detailControl.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
        detailControl.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));
        await new Promise(resolve=>setTimeout(resolve,700));
        detailRoot=readDetail();
        if (!detailRoot) {
          const link=detailControl.closest('a[href]');
          const preventNavigation=event=>event.preventDefault();
          if (link) link.addEventListener('click',preventNavigation,{capture:true,once:true});
          detailControl.click();
          await new Promise(resolve=>setTimeout(resolve,700));
          detailRoot=readDetail();
        }
        if (detailRoot) {
          detailText=compact(detailRoot);
          if (hasCapText(detailText)) break;
        }
      }
    }
    cardBenefitText=[summaryText,detailText].filter(Boolean).join(' | ').slice(0,4000);
    const knownCards=['와우카드(KB)','KB국민','NH농협','신한','BC','우리','롯데','하나','삼성','현대','KB'];
    cardProviders=knownCards.filter(card=>cardBenefitText.includes(card));
    const benefitRows=[];
    for (const node of detailRoot?.querySelectorAll('tr,li,div,p')||[]) {
      const text=compact(node);
      if (text.length<10||text.length>700||!/%/.test(text)||!/원/.test(text)) continue;
      const rate=parseRate(text),cap=parseCap(text);
      if (!rate||!cap) continue;
      const providers=knownCards.filter(card=>text.includes(card));
      benefitRows.push({rate,cap,providers});
    }
    if (!benefitRows.length) {
      const rate=parseRate(summaryText)||parseRate(detailText);
      const cap=parseCap(detailText)||parseCap(summaryText);
      if (rate) benefitRows.push({rate,cap,providers:cardProviders});
    }
    const calculated=benefitRows.map(row=>({
      ...row,
      amount:Number.isFinite(row.cap)&&row.cap>0
        ? Math.min(Math.floor(preferred.price*row.rate/100),row.cap)
        : Math.floor(preferred.price*row.rate/100)
    })).sort((a,b)=>b.amount-a.amount);
    if (calculated[0]) {
      cardDiscount=calculated[0].amount;
      cardRate=calculated[0].rate;
      cardMaxDiscount=Number.isFinite(calculated[0].cap)&&calculated[0].cap>0?calculated[0].cap:null;
      if (calculated[0].providers.length) cardProviders=calculated[0].providers;
      cardBenefitStatus='captured';
    }
    if (cardBenefitStatus==='none') cardDiscount=0;
  }
  if (preferred) return {ok:true, price:preferred.price, strikePrice:strike?.price||null, strikeSelector:strike?.selector||null, priceBasisType:strike?.basisType||null, strikeReliable:Boolean(strike), cardDiscount, cardRate, cardMaxDiscount, cardProviders, cardBenefitText, cardBenefitStatus, title:document.title, selector:preferred.source, candidates:candidates.slice(0,20)};
  return {ok:false, reason:'price-not-found', title:document.title, actualItemId, bodyLength:bodyText.length, candidates:candidates.slice(0,20), pageSample:bodyText.slice(0,500)};
}

function readDanawaSellers(expectedMtm) {
  const bodyText=document.body?.innerText||'';
  if (!bodyText.toUpperCase().includes(expectedMtm.toUpperCase())) return {ok:false,reason:'mtm-mismatch',sellers:[]};
  const heading=[...document.querySelectorAll('h2,h3,h4,div,strong')].find(n=>n.textContent?.trim()==='쇼핑몰별 최저가');
  const root=heading?.parentElement?.parentElement || document.body;
  const sellers=[];
  for (const img of root.querySelectorAll('img[alt]')) {
    const seller=(img.getAttribute('alt')||'').replace(/^Image:\s*/,'').trim();
    if (!seller || /로딩중|상품.*이미지|다나와/i.test(seller)) continue;
    let node=img.parentElement;
    for (let depth=0;node&&depth<7;depth++,node=node.parentElement) {
      const text=(node.innerText||'').replace(/\s+/g,' ').trim();
      const match=text.match(/([0-9][0-9,]{4,})\s*원/);
      if (match && text.length<1800) {
        const price=Number(match[1].replace(/,/g,''));
        if (price>=250000&&price<=7000000&&!sellers.some(x=>x.seller===seller)) sellers.push({seller,price});
        break;
      }
    }
  }
  return {ok:sellers.length>0,reason:sellers.length?'ok':'seller-not-found',sellers:sellers.slice(0,12),title:document.title};
}

async function scanAll() {
  const lock = await chrome.storage.local.get(['running','runningStartedAt']);
  const lockAge = Date.now() - Number(lock.runningStartedAt || 0);
  // A full multi-brand pass can take well over five minutes. Keep a one-hour
  // lock so a second manual click cannot start an overlapping scan.
  if (lock.running && lock.runningStartedAt && lockAge < 60 * 60 * 1000) return;
  await chrome.storage.local.set({running:true,runningStartedAt:Date.now()});
  const results = [];
  const closeChildTabs = async (openerTabId) => {
    const childIds=(await chrome.tabs.query({}))
      .filter(candidate=>candidate.openerTabId===openerTabId)
      .map(candidate=>candidate.id)
      .filter(Number.isInteger);
    if (childIds.length) await chrome.tabs.remove(childIds).catch(()=>{});
  };
  try {
    const targets=(await getTargets()).filter(x=>x.enabled!==false);
    for (const target of targets) {
      let tab;
      try {
        tab = await chrome.tabs.create({url:target.url, active:true});
        await waitForComplete(tab.id);
        await wait(7000);
        const injected = await chrome.scripting.executeScript({
          target:{tabId:tab.id}, func:readDisplayedPrice, args:[target.itemId]
        });
        const priceScan=injected?.[0]?.result;
        if (!priceScan || typeof priceScan !== 'object') {
          throw new Error('scan-script-no-result');
        }
        const result={...target, ...priceScan, checkedAt:new Date().toISOString()};
        if (target.danawaUrl) {
          let danawaTab;
          try {
            danawaTab=await chrome.tabs.create({url:target.danawaUrl,active:true});
            await waitForComplete(danawaTab.id);
            await wait(6000);
            const sellerScan=await chrome.scripting.executeScript({target:{tabId:danawaTab.id},func:readDanawaSellers,args:[target.mtm]});
            result.competitors=sellerScan[0].result.sellers||[];
            result.competitorReason=sellerScan[0].result.reason;
          } catch(error) {
            result.competitors=[];
            result.competitorReason=String(error);
          } finally {
            if (danawaTab?.id) await chrome.tabs.remove(danawaTab.id).catch(()=>{});
          }
        }
        results.push(result);
      } catch (error) {
        results.push({...target, ok:false, reason:String(error), checkedAt:new Date().toISOString()});
      } finally {
        if (tab?.id) await closeChildTabs(tab.id).catch(()=>{});
        if (tab?.id) await chrome.tabs.remove(tab.id).catch(()=>{});
      }
      // A slower cadence reduces Coupang's temporary access-check response.
      await wait(20000);
    }
    // Retry blocked pages after the full pass. Processing the other targets
    // creates cooldown time without a long idle timer that Chrome may stop.
    for (const result of results.filter(x=>!x.ok && x.reason==='access-check')) {
      let retryTab;
      try {
        retryTab=await chrome.tabs.create({url:result.url,active:true});
        await waitForComplete(retryTab.id);
        await wait(10000);
        const retried=await chrome.scripting.executeScript({
          target:{tabId:retryTab.id},func:readDisplayedPrice,args:[result.itemId]
        });
        const retryScan=retried?.[0]?.result;
        if (retryScan?.ok) Object.assign(result,retryScan,{checkedAt:new Date().toISOString(),retried:true});
      } catch (_) {
      } finally {
        if (retryTab?.id) await closeChildTabs(retryTab.id).catch(()=>{});
        if (retryTab?.id) await chrome.tabs.remove(retryTab.id).catch(()=>{});
      }
      await wait(20000);
    }
    const payload = {version:2, scannedAt:new Date().toISOString(), results};
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    await chrome.downloads.download({url, filename:'MarketPulse/latest-coupang-scan.json', conflictAction:'overwrite', saveAs:false});
    await chrome.storage.local.set({lastRunDay:localDay(), lastResult:payload});
  } finally {
    await chrome.storage.local.set({running:false,runningStartedAt:null});
  }
}

async function schedule() {
  await chrome.alarms.clear('daily-scan');
  const now = new Date();
  const kstParts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Seoul',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(now);
  const p = Object.fromEntries(kstParts.map(x=>[x.type,x.value]));
  const kstNowAsUtc = Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  let nextKst = Date.UTC(+p.year,+p.month-1,+p.day,10,0);
  if (nextKst <= kstNowAsUtc) nextKst += 86400000;
  const delay = nextKst - kstNowAsUtc;
  await chrome.alarms.create('daily-scan',{when:Date.now()+delay,periodInMinutes:1440});
}

chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.storage.local.set({running:false,runningStartedAt:null});
  await schedule();
});
chrome.runtime.onStartup.addListener(async()=>{
  await schedule();
  const state=await chrome.storage.local.get(['lastRunDay']);
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'2-digit',hour12:false}).format(new Date()));
  if (hour>=10 && state.lastRunDay!==localDay()) scanAll();
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='daily-scan') scanAll();});
chrome.action.onClicked.addListener(scanAll);
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if (message?.type==='GET_PRODUCTS') {
    getTargets().then(products=>sendResponse({ok:true,products}));
    return true;
  }
  if (message?.type==='SAVE_PRODUCTS') {
    chrome.storage.local.set({products:message.products}).then(()=>sendResponse({ok:true})).catch(error=>sendResponse({ok:false,error:String(error)}));
    return true;
  }
  if (message?.type==='RUN_SCAN') {
    scanAll();
    sendResponse({ok:true});
  }
});
