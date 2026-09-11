const TARGETS = [
  {brand:'Lenovo',mtm:'83N30037KR',itemId:'27303279355',url:'https://www.coupang.com/vp/products/9235110727?itemId=27303279355&vendorItemId=95415897534'},
  {brand:'Lenovo',mtm:'83N3003DKR',itemId:'27303268765',url:'https://www.coupang.com/vp/products/9235110727?itemId=27303268765&vendorItemId=95415897535'},
  {brand:'Lenovo',mtm:'83N30046KR',itemId:'25515648568',url:'https://www.coupang.com/vp/products/8708708250?itemId=25515648568&vendorItemId=95415897536'},
  {brand:'Acer',mtm:'ANV16-I31-514Z',itemId:'28575928128',url:'https://www.coupang.com/vp/products/9573633117?itemId=28575928128&vendorItemId=95520178041',danawaUrl:'https://prod.danawa.com/info/?pcode=122672194'},
  {brand:'Acer',mtm:'AG14-I71M-972S',itemId:'28951318769',url:'https://www.coupang.com/vp/products/9681715061?itemId=28951318769&vendorItemId=95881909514',danawaUrl:'https://prod.danawa.com/info/?pcode=123650595'},
  {brand:'Acer',mtm:'AG14-I71M-96C5',itemId:'28951318771',url:'https://www.coupang.com/vp/products/9681715061?itemId=28951318771&vendorItemId=95881909515',danawaUrl:'https://prod.danawa.com/info/?pcode=123763381'},
  {brand:'Acer',mtm:'PHN16S-71-949J',itemId:'26004597899',url:'https://www.coupang.com/vp/products/9573633117?itemId=26004597899&vendorItemId=92986675922',danawaUrl:'https://prod.danawa.com/info/?pcode=93445997'},
  {brand:'Acer',mtm:'SFG14-I71-57P5',itemId:'28714706385',url:'https://www.coupang.com/vp/products/9616664363?itemId=28714706385&vendorItemId=95655361667',danawaUrl:'https://prod.danawa.com/info/?pcode=122719782'},
  {brand:'Acer',mtm:'SFG14-75-508U',itemId:'28287192873',url:'https://www.coupang.com/vp/products/9428079675?itemId=28287192873&vendorItemId=95240133006',danawaUrl:'https://prod.danawa.com/info/?pcode=122636128'},
  {brand:'Acer',mtm:'SFG16-74-7412',itemId:'28029585486',url:'https://www.coupang.com/vp/products/9573633117?itemId=28029585486&vendorItemId=94986693706',danawaUrl:'https://prod.danawa.com/info/?pcode=122702450'},
  {brand:'Acer',mtm:'SFG16-I71-75Y2',itemId:'28237319655',url:'https://www.coupang.com/vp/products/9483273252?itemId=28237319655&vendorItemId=95190959758',danawaUrl:'https://prod.danawa.com/info/?pcode=122636236'},
  {brand:'Acer',mtm:'SFG16-74-70E9',itemId:'28714706401',url:'https://www.coupang.com/vp/products/9573633117?itemId=28714706401&vendorItemId=95655361668',danawaUrl:'https://prod.danawa.com/info/?pcode=122719720'},
  {brand:'Acer',mtm:'SF16-71T-7475',itemId:'28067081535',url:'https://www.coupang.com/vp/products/9437677217?itemId=28067081535&vendorItemId=95023756227',danawaUrl:'https://prod.danawa.com/info/?pcode=107769113'}
];

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

function readDisplayedPrice(expectedItemId) {
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
        if (value.price) addCandidate(value.price,'json-ld',value.name||value['@type']||'');
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
  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      addCandidate(node.getAttribute('data-price') || node.textContent, selector, node.parentElement?.innerText || node.textContent);
    }
  }
  const wonMatches = bodyText.match(/(?:[0-9]{1,3},){1,2}[0-9]{3}\s*원/g) || [];
  for (const text of wonMatches.slice(0,40)) addCandidate(text,'visible-won-text',text);

  const preferred = candidates.find(x=>/price-value|prod-sale-price|total-price/.test(x.source))
    || candidates.find(x=>x.source==='json-ld')
    || candidates.find(x=>x.source.startsWith('meta'));
  if (preferred) return {ok:true, price:preferred.price, title:document.title, selector:preferred.source, candidates:candidates.slice(0,20)};
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
  const lock = await chrome.storage.local.get(['running']);
  if (lock.running) return;
  await chrome.storage.local.set({running:true});
  const results = [];
  try {
    for (const target of TARGETS) {
      let tab;
      try {
        tab = await chrome.tabs.create({url:target.url, active:true});
        await waitForComplete(tab.id);
        await wait(7000);
        let injected = await chrome.scripting.executeScript({
          target:{tabId:tab.id}, func:readDisplayedPrice, args:[target.itemId]
        });
        let priceScan=injected[0].result;
        if (!priceScan.ok && priceScan.reason === 'access-check') {
          await wait(45000);
          await chrome.tabs.update(tab.id,{url:target.url,active:true});
          await waitForComplete(tab.id);
          await wait(10000);
          injected=await chrome.scripting.executeScript({
            target:{tabId:tab.id}, func:readDisplayedPrice, args:[target.itemId]
          });
          priceScan=injected[0].result;
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
        if (tab?.id) await chrome.tabs.remove(tab.id).catch(()=>{});
      }
      // A slower cadence reduces Coupang's temporary access-check response.
      await wait(20000);
    }
    const payload = {version:1, scannedAt:new Date().toISOString(), results};
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    await chrome.downloads.download({url, filename:'MarketPulse/latest-coupang-scan.json', conflictAction:'overwrite', saveAs:false});
    await chrome.storage.local.set({lastRunDay:localDay(), lastResult:payload});
  } finally {
    await chrome.storage.local.set({running:false});
  }
}

async function schedule() {
  await chrome.alarms.clear('daily-scan');
  const now = new Date();
  const kstParts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Seoul',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(now);
  const p = Object.fromEntries(kstParts.map(x=>[x.type,x.value]));
  const kstNowAsUtc = Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  let nextKst = Date.UTC(+p.year,+p.month-1,+p.day,11,30);
  if (nextKst <= kstNowAsUtc) nextKst += 86400000;
  const delay = nextKst - kstNowAsUtc;
  await chrome.alarms.create('daily-scan',{when:Date.now()+delay,periodInMinutes:1440});
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(async()=>{
  await schedule();
  const state=await chrome.storage.local.get(['lastRunDay']);
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'2-digit',hour12:false}).format(new Date()));
  if (hour>=11 && state.lastRunDay!==localDay()) scanAll();
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='daily-scan') scanAll();});
chrome.action.onClicked.addListener(scanAll);
