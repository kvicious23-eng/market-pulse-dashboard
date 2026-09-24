const TARGETS = [
  {brand:'Lenovo',category:'Notebook',mtm:'83N30037KR',productId:'9235110727',itemId:'27303279355',vendorItemId:'95415897534',srp:1109000,enabled:true,url:'https://www.coupang.com/vp/products/9235110727?itemId=27303279355&vendorItemId=95415897534'},
  {brand:'Lenovo',category:'Notebook',mtm:'83N3003DKR',productId:'9235110727',itemId:'27303268765',vendorItemId:'95415897535',srp:1159000,enabled:true,url:'https://www.coupang.com/vp/products/9235110727?itemId=27303268765&vendorItemId=95415897535'},
  {brand:'Lenovo',category:'Notebook',mtm:'83N30046KR',productId:'8708708250',itemId:'25515648568',vendorItemId:'95415897536',srp:1199000,enabled:true,url:'https://www.coupang.com/vp/products/8708708250?itemId=25515648568&vendorItemId=95415897536'},
  {brand:'Acer',category:'Notebook',mtm:'ANV16-I31-514Z',productId:'9573633117',itemId:'28575928128',vendorItemId:'95520178041',srp:1558000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=28575928128&vendorItemId=95520178041',danawaUrl:'https://prod.danawa.com/info/?pcode=122672194'},
  {brand:'Acer',category:'Notebook',mtm:'AG14-I71M-972S',productId:'9681715061',itemId:'28951318769',vendorItemId:'95881909514',srp:1429000,enabled:true,url:'https://www.coupang.com/vp/products/9681715061?itemId=28951318769&vendorItemId=95881909514',danawaUrl:'https://prod.danawa.com/info/?pcode=123650595'},
  {brand:'Acer',category:'Notebook',mtm:'AG14-I71M-96C5',productId:'9681715061',itemId:'28951318771',vendorItemId:'95881909515',srp:1569000,enabled:true,url:'https://www.coupang.com/vp/products/9681715061?itemId=28951318771&vendorItemId=95881909515',danawaUrl:'https://prod.danawa.com/info/?pcode=123763381'},
  {brand:'Acer',category:'Notebook',mtm:'PHN16S-71-949J',productId:'9573633117',itemId:'26004597899',vendorItemId:'92986675922',srp:4099000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=26004597899&vendorItemId=92986675922',danawaUrl:'https://prod.danawa.com/info/?pcode=93445997'},
  {brand:'Acer',category:'Notebook',mtm:'SFG14-I71-57P5',productId:'9616664363',itemId:'28714706385',vendorItemId:'95655361667',srp:1689000,enabled:true,url:'https://www.coupang.com/vp/products/9616664363?itemId=28714706385&vendorItemId=95655361667',danawaUrl:'https://prod.danawa.com/info/?pcode=122719782'},
  {brand:'Acer',category:'Notebook',mtm:'SFG14-75-508U',productId:'9428079675',itemId:'28287192873',vendorItemId:'95240133006',srp:1229000,enabled:true,url:'https://www.coupang.com/vp/products/9428079675?itemId=28287192873&vendorItemId=95240133006',danawaUrl:'https://prod.danawa.com/info/?pcode=122636128'},
  {brand:'Acer',category:'Notebook',mtm:'SFG16-74-7412',productId:'9573633117',itemId:'28029585486',vendorItemId:'94986693706',srp:1659000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=28029585486&vendorItemId=94986693706',danawaUrl:'https://prod.danawa.com/info/?pcode=122702450'},
  {brand:'Acer',category:'Notebook',mtm:'SFG16-I71-75Y2',productId:'9483273252',itemId:'28237319655',vendorItemId:'95190959758',srp:1829000,enabled:true,url:'https://www.coupang.com/vp/products/9483273252?itemId=28237319655&vendorItemId=95190959758',danawaUrl:'https://prod.danawa.com/info/?pcode=122636236'},
  {brand:'Acer',category:'Notebook',mtm:'SFG16-74-70E9',productId:'9573633117',itemId:'28714706401',vendorItemId:'95655361668',srp:1439000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=28714706401&vendorItemId=95655361668',danawaUrl:'https://prod.danawa.com/info/?pcode=122719720'},
  {brand:'Acer',category:'Notebook',mtm:'SF16-71T-7475',productId:'9437677217',itemId:'28067081535',vendorItemId:'95023756227',srp:2369000,enabled:true,url:'https://www.coupang.com/vp/products/9437677217?itemId=28067081535&vendorItemId=95023756227',danawaUrl:'https://prod.danawa.com/info/?pcode=107769113'}
];

async function getTargets() {
  const state=await chrome.storage.local.get(['products']);
  if (!Array.isArray(state.products)) return TARGETS;
  return state.products.map(product=>{
    const fallback=TARGETS.find(target=>String(target.itemId)===String(product.itemId));
    return {...fallback,...product};
  });
}

function validateProductCatalog(products) {
  if(!Array.isArray(products)) return ['product-catalog-is-not-an-array'];
  const errors=[];
  const seenItemIds=new Set(),seenVendorItemIds=new Set(),seenBrandMtms=new Set(),slugOwners=new Map();
  for(const [index,product] of products.entries()){
    const label=String(product?.mtm||`row-${index+1}`).trim();
    const brand=String(product?.brand||'').trim();
    const mtm=String(product?.mtm||'').trim();
    const productId=String(product?.productId||'').trim();
    const itemId=String(product?.itemId||'').trim();
    const vendorItemId=String(product?.vendorItemId||'').trim();
    if(!brand||!mtm||!productId||!itemId||!vendorItemId) errors.push(`${label}:required-fields-missing`);
    try{
      const url=new URL(String(product?.url||''));
      const urlProductId=url.pathname.match(/\/vp\/products\/(\d+)/)?.[1]||'';
      if(url.protocol!=='https:'||url.hostname!=='www.coupang.com'||urlProductId!==productId
          ||url.searchParams.get('itemId')!==itemId||url.searchParams.get('vendorItemId')!==vendorItemId){
        errors.push(`${label}:coupang-url-identifiers-mismatch`);
      }
    }catch{ errors.push(`${label}:coupang-url-invalid`); }
    if(itemId){ if(seenItemIds.has(itemId)) errors.push(`${label}:duplicate-item-id`); else seenItemIds.add(itemId); }
    if(vendorItemId){ if(seenVendorItemIds.has(vendorItemId)) errors.push(`${label}:duplicate-vendor-item-id`); else seenVendorItemIds.add(vendorItemId); }
    const brandMtm=`${brand}|${mtm}`.toLowerCase();
    if(brand&&mtm){ if(seenBrandMtms.has(brandMtm)) errors.push(`${label}:duplicate-brand-mtm`); else seenBrandMtms.add(brandMtm); }
    const slug=brand.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
    if(brand&&slug){
      const owner=slugOwners.get(slug);
      if(owner&&owner!==brand) errors.push(`${label}:duplicate-brand-slug`);
      else slugOwners.set(slug,brand);
    }
    if(product?.srp!==null&&product?.srp!==undefined&&(!Number.isFinite(product.srp)||product.srp<=0)) errors.push(`${label}:srp-invalid`);
  }
  return [...new Set(errors)];
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

async function readDisplayedPrice(expectedProductId,expectedItemId,expectedVendorItemId,expectedSrp) {
  const currentUrl = new URL(location.href);
  const params = currentUrl.searchParams;
  const actualProductId = currentUrl.pathname.match(/\/vp\/products\/(\d+)/)?.[1]||null;
  const actualItemId = params.get('itemId');
  const actualVendorItemId = params.get('vendorItemId');
  const bodyText = document.body?.innerText || '';
  if (actualProductId!==String(expectedProductId)||actualItemId!==String(expectedItemId)||actualVendorItemId!==String(expectedVendorItemId)) {
    return {ok:false,reason:'product-identifiers-mismatch',actualProductId,actualItemId,actualVendorItemId};
  }
  if (/Access Denied|비정상적인 접근|잠시 후 다시 시도|로봇이 아닙니다|captcha/i.test(bodyText)) {
    return {ok:false, reason:'access-check'};
  }
  // Preserve the notebook guard while allowing managed lower-priced products.
  const minimumPrice=Number(expectedSrp)>0&&Number(expectedSrp)<250000?10000:250000;
  const candidates = [];
  const addCandidate = (value, source, text='') => {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    const price = Number(digits);
    if (price >= minimumPrice && price <= 7000000 && !candidates.some(x=>x.price===price && x.source===source)) {
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
      if (rect.width>0&&rect.height>0&&price>=minimumPrice&&price<=7000000) {
        positionedPrices.push({price,top:rect.top+scrollY,left:rect.left+scrollX,selector});
      }
    }
  }
  const wonMatches = bodyText.match(/(?:[0-9]{1,3},){1,2}[0-9]{3}\s*원/g) || [];
  for (const text of wonMatches.slice(0,40)) addCandidate(text,'visible-won-text',text);

  const preferred = candidates.find(x=>/price-value|prod-sale-price|total-price/.test(x.source))
    || candidates.find(x=>x.source==='json-ld')
    || candidates.find(x=>x.source.startsWith('meta'));
  const managedSrp=Number(expectedSrp);
  const plausibleBasis=price=>!Number.isFinite(managedSrp)||managedSrp<=0||managedSrp>=250000||!preferred
    ||price<=Math.max(3*managedSrp,3*preferred.price);
  const strikeCandidates=[];
  for (const selector of ['.prod-origin-price','.origin-price','[class*="origin-price"]','[class*="base-price"]']) {
    for (const node of document.querySelectorAll(selector)) {
      const style=getComputedStyle(node);
      const digits=(node.textContent||'').replace(/[^0-9]/g,'');
      const price=Number(digits);
      if (style.display!=='none'&&style.visibility!=='hidden'&&price>=minimumPrice&&price<=7000000) strikeCandidates.push({price,selector});
    }
  }
  // UnitPriceSpecification belongs to the active offer. Generic <del>/<s>
  // nodes also contain other variants and recommendations, so never use them.
  const jsonStrike=candidates.find(x=>x.source==='json-ld-unit-price'&&(!preferred||x.price>=preferred.price)&&plausibleBasis(x.price));
  const topVisiblePrice=positionedPrices
    .filter(x=>(!preferred||x.price>=preferred.price)&&plausibleBasis(x.price))
    .sort((a,b)=>a.top-b.top||a.left-b.left)[0];
  const strike=jsonStrike
    ? {price:jsonStrike.price,selector:jsonStrike.source,basisType:'crossed-out'}
    : preferred ? ((()=>{const candidate=strikeCandidates.find(x=>x.price>=preferred.price&&plausibleBasis(x.price));return candidate?{...candidate,basisType:'crossed-out'}:null;})()
      || (topVisiblePrice?{price:topVisiblePrice.price,selector:'top-visible-price',basisType:'top-visible'}:null)
      // Some Coupang layouts expose the primary price only through JSON-LD
      // and plain visible text. With no crossed-out price, that primary price
      // is the displayed-price basis, so a zero coupon total remains verifiable.
      || {price:preferred.price,selector:`primary-${preferred.source}`,basisType:'top-visible'}) : null;
  let cardDiscount=null;
  let cardRate=null;
  let cardMaxDiscount=null;
  let cardProviders=[];
  let cardBenefitText='';
  let cardBenefitStatus='none';
  let cardClickPoint=null;
  let cardClickDebug={summaryFound:false,reason:'card-summary-not-found',candidates:[]};
  if (preferred) {
    const visible=node=>{
      const style=getComputedStyle(node);
      return style.display!=='none'&&style.visibility!=='hidden'&&node.getBoundingClientRect().width>0;
    };
    const compact=node=>(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();
    const mainPriceTop=positionedPrices
      .filter(entry=>entry.price===preferred.price)
      .reduce((top,entry)=>Math.min(top,entry.top),Infinity);
    const summaryNodes=[...document.querySelectorAll('div,li,p')]
      .filter(node=>visible(node)&&/카드\s*즉시할인/.test(compact(node))&&compact(node).length<260)
      .map(node=>({node,top:node.getBoundingClientRect().top+scrollY,text:compact(node)}))
      .filter(entry=>!Number.isFinite(mainPriceTop)||(entry.top>=mainPriceTop-120&&entry.top<=mainPriceTop+700))
      .sort((a,b)=>a.top-b.top||a.text.length-b.text.length);
    const summaryRoot=summaryNodes[0]?.node||null;
    const summaryText=compact(summaryRoot);
    if (summaryRoot) {
      cardBenefitStatus='partial';
      cardClickDebug={summaryFound:true,reason:'wow-label-not-found',candidates:[]};
    }
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
      // Expand only to the compact row that still contains the exact card
      // summary and the adjacent "와우 전용" label.
      let cardRow=summaryRoot;
      for (let depth=0;depth<4&&cardRow.parentElement;depth++) {
        const parent=cardRow.parentElement;
        const text=compact(parent);
        if (text.length>420||!/카드\s*즉시할인/.test(text)||!/와우\s*전용/.test(text)) break;
        cardRow=parent;
      }
      const initialRowRect=cardRow.getBoundingClientRect();
      if (initialRowRect.top<20||initialRowRect.bottom>innerHeight-20) {
        cardRow.scrollIntoView({block:'center',inline:'nearest'});
        await new Promise(resolve=>setTimeout(resolve,350));
      }
      let wowRect=null;
      const walker=document.createTreeWalker(cardRow,NodeFilter.SHOW_TEXT);
      for (let textNode=walker.nextNode();textNode;textNode=walker.nextNode()) {
        const match=textNode.nodeValue?.match(/와우\s*전용/);
        if (!match) continue;
        const range=document.createRange();
        range.setStart(textNode,match.index);
        range.setEnd(textNode,match.index+match[0].length);
        const rect=range.getBoundingClientRect();
        if (rect.width>0&&rect.height>0) { wowRect=rect; break; }
      }
      if (wowRect) {
        const wowCenterY=wowRect.top+wowRect.height/2;
        const rowRect=cardRow.getBoundingClientRect();
        cardClickDebug.wowRect={left:Math.round(wowRect.left),right:Math.round(wowRect.right),top:Math.round(wowRect.top),bottom:Math.round(wowRect.bottom)};
        cardClickDebug.rowRect={left:Math.round(rowRect.left),right:Math.round(rowRect.right),top:Math.round(rowRect.top),bottom:Math.round(rowRect.bottom)};
        const describe=target=>{
          const rect=target.getBoundingClientRect();
          const tag=target.tagName.toLowerCase();
          const label=[target.getAttribute('aria-label'),target.getAttribute('title'),target.className?.baseVal||target.className,compact(target)].filter(Boolean).join(' ');
          const infoLike=['svg','i','button'].includes(tag)||target.getAttribute('role')==='button'||/info|tooltip|help|안내|정보|^[ⓘi?]$/i.test(label);
          const centerX=rect.left+rect.width/2,centerY=rect.top+rect.height/2;
          return {target,tag,label:label.slice(0,160),infoLike,rect,centerX,centerY,dx:centerX-wowRect.right,dy:centerY-wowCenterY};
        };
        const iconSelector='svg,i,button,[role="button"],[aria-label],[title],[data-tooltip],[class*="info"],[class*="tooltip"]';
        const direct=[...document.querySelectorAll(iconSelector)]
          .filter(visible)
          .map(describe)
          .filter(entry=>entry.rect.width>=4&&entry.rect.height>=4&&entry.rect.width<=72&&entry.rect.height<=72
            &&entry.dx>=-8&&entry.dx<=160&&Math.abs(entry.dy)<=48);
        const probed=[];
        for (const yOffset of [0,-8,8,-16,16,-28,28]) {
          for (let xOffset=4;xOffset<=140;xOffset+=4) {
            const x=wowRect.right+xOffset,y=wowCenterY+yOffset;
            for (const raw of document.elementsFromPoint(x,y)) {
              const target=raw.closest(iconSelector);
              if (!target||probed.some(entry=>entry.target===target)) continue;
              const entry=describe(target);
              if (entry.rect.width>=4&&entry.rect.height>=4&&entry.rect.width<=72&&entry.rect.height<=72&&entry.dx>=-8&&entry.dx<=160&&Math.abs(entry.dy)<=48) probed.push(entry);
            }
          }
        }
        const all=[...direct,...probed].filter((entry,index,list)=>list.findIndex(other=>other.target===entry.target)===index);
        all.sort((a,b)=>(b.infoLike-a.infoLike)||Math.abs(a.dy)-Math.abs(b.dy)||Math.abs(a.dx-12)-Math.abs(b.dx-12));
        cardClickDebug.candidates=all.slice(0,20).map(entry=>({
          tag:entry.tag,label:entry.label,infoLike:entry.infoLike,
          x:Math.round(entry.centerX),y:Math.round(entry.centerY),
          width:Math.round(entry.rect.width),height:Math.round(entry.rect.height),
          dx:Math.round(entry.dx),dy:Math.round(entry.dy)
        }));
        const hit=all.find(entry=>entry.infoLike)||null;
        if (hit) {
          cardClickPoint={x:Math.round(hit.centerX),y:Math.round(hit.centerY)};
          cardClickDebug.reason='selected';
          cardClickDebug.selected={
            tag:hit.tag,label:hit.label,infoLike:hit.infoLike,
            x:Math.round(hit.centerX),y:Math.round(hit.centerY),
            width:Math.round(hit.rect.width),height:Math.round(hit.rect.height),
            dx:Math.round(hit.dx),dy:Math.round(hit.dy)
          };
        } else {
          cardClickDebug.reason=all.length?'no-info-like-candidate':'no-nearby-icon-candidate';
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
    if (!benefitRows.length&&detailRoot) {
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
  if (preferred) return {ok:true, price:preferred.price, strikePrice:strike?.price||null, strikeSelector:strike?.selector||null, priceBasisType:strike?.basisType||null, strikeReliable:Boolean(strike), cardDiscount, cardRate, cardMaxDiscount, cardProviders, cardBenefitText, cardBenefitStatus, cardClickPoint, cardClickDebug, title:document.title, selector:preferred.source, candidates:candidates.slice(0,20)};
  return {ok:false, reason:'price-not-found', title:document.title, actualItemId, bodyLength:bodyText.length, candidates:candidates.slice(0,20), pageSample:bodyText.slice(0,500)};
}

function snapshotCardDetailText(expectedProductId,expectedItemId,expectedVendorItemId) {
  const currentUrl=new URL(location.href);
  const actualProductId=currentUrl.pathname.match(/\/vp\/products\/(\d+)/)?.[1]||null;
  const actualItemId=currentUrl.searchParams.get('itemId');
  const actualVendorItemId=currentUrl.searchParams.get('vendorItemId');
  if (actualProductId!==String(expectedProductId)||actualItemId!==String(expectedItemId)||actualVendorItemId!==String(expectedVendorItemId)) {
    return {ok:false,reason:'product-identifiers-changed',texts:[]};
  }
  const visible=node=>{
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>0&&rect.height>0;
  };
  const compact=node=>(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();
  const texts=new Set();
  for (const node of document.body?.querySelectorAll('*')||[]) {
    if (!visible(node)) continue;
    const text=compact(node);
    if (text.length<2||text.length>2500||!/(?:카드|할인|와우|한도|%|원)/.test(text)) continue;
    texts.add(text);
  }
  return {ok:true,texts:[...texts].slice(0,6000)};
}

function readCardPopup(expectedProductId,expectedItemId,expectedVendorItemId,preCardPrice,summaryText,summaryProviders,beforeTexts=[],clickPoint=null) {
  const currentUrl=new URL(location.href);
  const actualProductId=currentUrl.pathname.match(/\/vp\/products\/(\d+)/)?.[1]||null;
  const actualItemId=currentUrl.searchParams.get('itemId');
  const actualVendorItemId=currentUrl.searchParams.get('vendorItemId');
  if (actualProductId!==String(expectedProductId)||actualItemId!==String(expectedItemId)||actualVendorItemId!==String(expectedVendorItemId)) {
    return {captured:false,reason:'product-identifiers-changed'};
  }
  const visible=node=>{
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
  };
  const compact=node=>(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();
  const parseRates=text=>[...text.matchAll(/(?:최대\s*)?([0-9]+(?:\.[0-9]+)?)\s*%/g)].map(match=>Number(match[1])).filter(rate=>rate>0&&rate<=100);
  const summaryRate=parseRates(summaryText)[0]||null;
  const parseKrwAmount=raw=>{
    const normalized=raw.replace(/[\s,]/g,'');
    if (!normalized.includes('만')) return Number(normalized);
    const [tenThousands,remainder='']=normalized.split('만');
    return Number(tenThousands)*10000+Number(remainder||0);
  };
  const parseCap=text=>{
    const amountPattern=/([0-9][0-9,]*(?:\s*만\s*[0-9,]*)?)\s*원/g;
    for (const match of text.matchAll(amountPattern)) {
      const start=Math.max(0,(match.index||0)-50),end=Math.min(text.length,(match.index||0)+match[0].length+24);
      const context=text.slice(start,end);
      const prefix=text.slice(start,match.index||0);
      if (/적립|캐시|결제금액|판매가|안심케어|무상보증/.test(prefix)||/안심케어|무상보증/.test(context)) continue;
      if (!/(?:최대|한도|할인금액)/.test(context)) continue;
      return parseKrwAmount(match[1]);
    }
    return null;
  };
  const knownCards=['와우카드(KB)','KB국민','NH농협','신한','BC','우리','롯데','하나','삼성','현대','KB'];
  const before=new Set(beforeTexts);
  const selectors='[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="layer"],[class*="popover"],[class*="tooltip"],div,section,table,ul,ol';
  const roots=[...document.querySelectorAll(selectors)]
    .map(node=>{
      const text=compact(node),style=getComputedStyle(node),rect=node.getBoundingClientRect();
      const newlyVisible=!before.has(text);
      const overlayLike=node.matches('[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="layer"],[class*="popover"],[class*="tooltip"]')
        ||style.position==='fixed'||style.position==='absolute';
      const rates=parseRates(text);
      const hasExpectedRate=summaryRate!==null&&rates.includes(summaryRate);
      const hasCap=Number.isFinite(parseCap(text));
      const explicitlyUncapped=/(?:한도|제한)\s*(?:없음|없이|없|무제한)/.test(text);
      const hasCardDetail=/(?:카드|할인율|할인한도|할인금액|최대할인)/.test(text);
      const smallEnough=rect.width<=1000&&rect.height<=900;
      const nearClick=!clickPoint||overlayLike||(
        rect.right>=clickPoint.x-650&&rect.left<=clickPoint.x+650
        &&rect.bottom>=clickPoint.y-550&&rect.top<=clickPoint.y+550
      );
      const forbidden=/추천이런건|쿠팡상품번호|다른 구성 보기|CPU 모델명|상품정보에 문제가/.test(text);
      return {node,text,newlyVisible,overlayLike,hasExpectedRate,hasCap,explicitlyUncapped,hasCardDetail,smallEnough,nearClick,forbidden};
    })
    .filter(entry=>entry.newlyVisible&&visible(entry.node)&&entry.text.length>=5&&entry.text.length<5000
      &&entry.hasExpectedRate&&entry.hasCardDetail&&(entry.hasCap||entry.explicitlyUncapped)
      &&entry.smallEnough&&entry.nearClick&&!entry.forbidden)
    .sort((a,b)=>{
      const aScore=(a.hasCap?4:0)+(a.overlayLike?2:0)+(/카드사|할인한도|할인금액/.test(a.text)?1:0);
      const bScore=(b.hasCap?4:0)+(b.overlayLike?2:0)+(/카드사|할인한도|할인금액/.test(b.text)?1:0);
      return bScore-aScore||a.text.length-b.text.length;
    });
  const root=roots[0]?.node||null;
  if (!root) return {captured:false,reason:'card-popup-not-found'};
  const detailText=compact(root);
  const rows=[];
  for (const node of root.querySelectorAll('tr,li,div,p')) {
    const text=compact(node);
    if (text.length<5||text.length>900||!/%/.test(text)) continue;
    const rates=parseRates(text),cap=parseCap(text);
    if (!summaryRate||!rates.includes(summaryRate)) continue;
    const providers=knownCards.filter(card=>text.includes(card));
    if (Number.isFinite(cap)||/(?:한도|제한)\s*(?:없음|없이|없|무제한)/.test(text)) rows.push({rate:summaryRate,cap,providers});
  }
  if (!rows.length) {
    const cap=parseCap(detailText);
    const explicitlyUncapped=/(?:한도|제한)\s*(?:없음|없이|없|무제한)/.test(detailText);
    if (summaryRate&&(Number.isFinite(cap)||explicitlyUncapped)) rows.push({rate:summaryRate,cap,providers:knownCards.filter(card=>detailText.includes(card))});
  }
  const calculated=rows.map(row=>({
    ...row,
    amount:Number.isFinite(row.cap)&&row.cap>0
      ? Math.min(Math.floor(preCardPrice*row.rate/100),row.cap)
      : Math.floor(preCardPrice*row.rate/100)
  })).filter(row=>row.amount>0&&row.amount<=preCardPrice).sort((a,b)=>b.amount-a.amount);
  const best=calculated[0];
  if (!best) return {captured:false,reason:'card-popup-unparseable',cardBenefitText:[summaryText,detailText].filter(Boolean).join(' | ').slice(0,4000)};
  return {
    captured:true,
    cardBenefitStatus:'captured',
    cardBenefitText:[summaryText,detailText].filter(Boolean).join(' | ').slice(0,4000),
    cardRate:best.rate,
    cardMaxDiscount:Number.isFinite(best.cap)&&best.cap>0?best.cap:null,
    cardDiscount:best.amount,
    cardProviders:best.providers.length?best.providers:summaryProviders
  };
}

function debuggerSnapshotStrings(snapshot) {
  const strings=snapshot?.strings||[];
  const values=[],seen=new Set();
  const relevant=value=>/(?:카드|할인|한도|최대|%|원|신한|BC|우리|농협|하나|삼성|현대|롯데|국민|KB)/i.test(value);
  const add=(index,force=false)=>{
    const value=typeof index==='number'?strings[index]:null;
    if (typeof value!=='string'||!value.trim()) return;
    const compact=value.replace(/\s+/g,' ').trim();
    if (compact.length>1200||(!force&&!relevant(compact))||seen.has(compact)) return;
    seen.add(compact);
    values.push(compact);
  };
  const addRelevantWithNeighbors=indexes=>{
    for (let position=0;position<indexes.length;position++) {
      const value=strings[indexes[position]]||'';
      if (!relevant(value)) continue;
      for (let nearby=Math.max(0,position-4);nearby<=Math.min(indexes.length-1,position+4);nearby++) add(indexes[nearby],true);
    }
  };
  for (const document of snapshot?.documents||[]) {
    addRelevantWithNeighbors(document?.nodes?.nodeValue||[]);
    for (const attrs of document?.nodes?.attributes||[]) for (const index of attrs||[]) add(index);
    addRelevantWithNeighbors(document?.layout?.text||[]);
  }
  for (let index=0;index<strings.length;index++) add(index);
  return values;
}

function accessibilityStrings(tree) {
  const values=[],seen=new Set(),nodes=tree?.nodes||[],byId=new Map(nodes.map(node=>[node.nodeId,node]));
  const ownText=node=>[
    node?.name?.value,node?.value?.value,node?.description?.value,
    ...(node?.properties||[]).map(property=>property?.value?.value)
  ].filter(value=>typeof value==='string'&&value.trim()).map(value=>value.replace(/\s+/g,' ').trim());
  const add=value=>{
    if (typeof value!=='string'||!value.trim()) return;
    const compact=value.replace(/\s+/g,' ').trim();
    if (compact.length>1200||seen.has(compact)) return;
    seen.add(compact);
    values.push(compact);
  };
  for (const node of nodes) for (const value of ownText(node)) add(value);
  for (const node of nodes) {
    const text=ownText(node).join(' | ');
    if (!/(?:카드\s*혜택|카드\s*즉시할인|할인한도|할인금액)/.test(text)) continue;
    const related=[node,byId.get(node.parentId),...(node.childIds||[]).map(id=>byId.get(id))].filter(Boolean);
    const context=related.flatMap(ownText).join(' | ');
    add(context);
  }
  return values;
}

async function captureDebuggerText(target) {
  const result={
    accessibility:[],domSnapshot:[],
    status:{accessibility:'pending',domSnapshot:'pending'},
    errors:{}
  };
  try {
    const tree=await chrome.debugger.sendCommand(target,'Accessibility.getFullAXTree',{});
    result.accessibility=accessibilityStrings(tree);
    result.status.accessibility=result.accessibility.length?'captured':'empty';
  } catch (error) {
    result.status.accessibility='error';
    result.errors.accessibility=String(error).slice(0,500);
  }
  try {
    const snapshot=await chrome.debugger.sendCommand(target,'DOMSnapshot.captureSnapshot',{
      computedStyles:[],includeDOMRects:false,includePaintOrder:false
    });
    result.domSnapshot=debuggerSnapshotStrings(snapshot);
    result.status.domSnapshot=result.domSnapshot.length?'captured':'empty';
  } catch (error) {
    result.status.domSnapshot='error';
    result.errors.domSnapshot=String(error).slice(0,500);
  }
  return result;
}

async function dispatchTrustedClickAndCapture(tabId,point) {
  const target={tabId};
  let attached=false;
  try {
    await chrome.debugger.attach(target,'1.3');
    attached=true;
    await chrome.debugger.sendCommand(target,'Page.bringToFront');
    await chrome.debugger.sendCommand(target,'Accessibility.enable').catch(()=>{});
    const before=await captureDebuggerText(target);
    await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
    await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
    await chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1});
    await wait(1200);
    const after=await captureDebuggerText(target);
    return {ok:true,before,after};
  } catch (error) {
    return {ok:false,reason:String(error)};
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(()=>{});
  }
}

function parseDebuggerCardEvidence(preCardPrice,summaryText,summaryProviders,capture) {
  const parseRates=text=>[...text.matchAll(/(?:최대\s*)?([0-9]+(?:\.[0-9]+)?)\s*%/g)].map(match=>Number(match[1])).filter(rate=>rate>0&&rate<=100);
  const expectedRate=parseRates(summaryText)[0]||null;
  const relevantNew=(afterValues,beforeValues)=>{
    const before=new Set(beforeValues||[]);
    return (afterValues||[])
      .filter(value=>!before.has(value)&&/(?:카드|할인|한도|최대|%|원)/.test(value))
      .map(value=>value.slice(0,300))
      .slice(0,20);
  };
  const cardDebug={
    expectedRate,
    beforeStatus:capture?.before?.status||null,
    afterStatus:capture?.after?.status||null,
    beforeErrors:capture?.before?.errors||{},
    afterErrors:capture?.after?.errors||{},
    counts:{
      accessibilityBefore:capture?.before?.accessibility?.length||0,
      accessibilityAfter:capture?.after?.accessibility?.length||0,
      domSnapshotBefore:capture?.before?.domSnapshot?.length||0,
      domSnapshotAfter:capture?.after?.domSnapshot?.length||0
    },
    collectionMode:'relevant-with-neighbors-no-hard-cap',
    newRelevant:{
      accessibility:relevantNew(capture?.after?.accessibility,capture?.before?.accessibility),
      domSnapshot:relevantNew(capture?.after?.domSnapshot,capture?.before?.domSnapshot)
    }
  };
  if (!expectedRate) return {captured:false,reason:'card-summary-rate-missing',cardDebug};
  const parseKrwAmount=raw=>{
    const normalized=raw.replace(/[\s,]/g,'');
    if (!normalized.includes('만')) return Number(normalized);
    const [tenThousands,remainder='']=normalized.split('만');
    return Number(tenThousands)*10000+Number(remainder||0);
  };
  const parseCaps=text=>{
    const caps=[];
    const amountPattern=/([0-9][0-9,]*(?:\s*만\s*[0-9,]*)?)\s*원/g;
    for (const match of text.matchAll(amountPattern)) {
      const start=Math.max(0,(match.index||0)-60),end=Math.min(text.length,(match.index||0)+match[0].length+30);
      const context=text.slice(start,end),prefix=text.slice(start,match.index||0);
      if (/적립|캐시|결제금액|판매가|안심케어|무상보증/.test(prefix)||/안심케어|무상보증/.test(context)) continue;
      if (!/(?:최대|한도|할인금액)/.test(context)) continue;
      const cap=parseKrwAmount(match[1]);
      if (Number.isFinite(cap)&&cap>0&&cap<=preCardPrice) caps.push(cap);
    }
    return [...new Set(caps)];
  };
  const knownCards=['와우카드(KB)','KB국민','NH농협','신한','BC','우리','롯데','하나','삼성','현대','KB'];
  const candidates=[];
  for (const [source,afterValues,beforeValues] of [
    ['accessibility',capture?.after?.accessibility||[],capture?.before?.accessibility||[]],
    ['dom-snapshot',capture?.after?.domSnapshot||[],capture?.before?.domSnapshot||[]]
  ]) {
    const before=new Set(beforeValues);
    for (let index=0;index<afterValues.length;index++) {
      const anchor=afterValues[index];
      if (before.has(anchor)||!/(?:원|한도|할인|카드|%)/.test(anchor)) continue;
      const text=afterValues.slice(Math.max(0,index-10),Math.min(afterValues.length,index+11)).join(' | ');
      if (/추천이런건|쿠팡상품번호|다른 구성 보기|CPU 모델명|상품정보에 문제가/.test(text)) continue;
      const rates=parseRates(text),providers=knownCards.filter(card=>text.includes(card));
      const matchingProviders=providers.filter(card=>summaryProviders.includes(card));
      const caps=parseCaps(text),explicitlyUncapped=/(?:한도|제한)\s*(?:없음|없이|없|무제한)/.test(text);
      const rateMatches=rates.includes(expectedRate);
      const cardContext=/(?:카드|할인한도|할인금액|최대할인)/.test(text);
      if (!cardContext||(!rateMatches&&!matchingProviders.length)||(!caps.length&&!explicitlyUncapped)) continue;
      if (rates.length&&!rateMatches) continue;
      for (const cap of caps.length?caps:[null]) {
        const amount=Number.isFinite(cap)?Math.min(Math.floor(preCardPrice*expectedRate/100),cap):Math.floor(preCardPrice*expectedRate/100);
        candidates.push({source,rate:expectedRate,cap,amount,providers:matchingProviders,text});
      }
    }
  }
  cardDebug.candidateCount=candidates.length;
  if (!candidates.length) return {captured:false,reason:'debugger-card-evidence-not-found',cardDebug};
  const bestBySource=[...new Set(candidates.map(candidate=>candidate.source))].map(source=>
    candidates.filter(candidate=>candidate.source===source).sort((a,b)=>b.amount-a.amount)[0]
  );
  if (bestBySource.length>1) {
    const [first,...rest]=bestBySource;
    if (rest.some(candidate=>candidate.rate!==first.rate||candidate.cap!==first.cap||candidate.amount!==first.amount)) {
      cardDebug.conflicts=bestBySource.map(candidate=>({source:candidate.source,rate:candidate.rate,cap:candidate.cap,amount:candidate.amount}));
      return {captured:false,reason:'debugger-card-evidence-conflict',cardDebug};
    }
  }
  const best=bestBySource.sort((a,b)=>b.amount-a.amount)[0];
  return {
    captured:true,
    cardBenefitStatus:'captured',
    cardInteractionStatus:'captured',
    cardDebug,
    cardEvidenceSource:bestBySource.length>1?'accessibility+dom-snapshot':best.source,
    cardBenefitText:[summaryText,best.text].filter(Boolean).join(' | ').slice(0,4000),
    cardRate:best.rate,
    cardMaxDiscount:Number.isFinite(best.cap)?best.cap:null,
    cardDiscount:best.amount,
    cardProviders:best.providers.length?best.providers:summaryProviders
  };
}

async function scanCoupangTab(tabId,target) {
  const injected=await chrome.scripting.executeScript({
    target:{tabId},func:readDisplayedPrice,args:[target.productId,target.itemId,target.vendorItemId,target.srp]
  });
  const scan=injected?.[0]?.result;
  if (!scan||typeof scan!=='object') throw new Error('scan-script-no-result');
  if (!scan.ok||scan.cardBenefitStatus!=='partial') return scan;
  if (!scan.cardClickPoint) {
    scan.cardInteractionStatus='card-click-target-not-found';
    return scan;
  }
  const beforePopup=await chrome.scripting.executeScript({
    target:{tabId,allFrames:true},func:snapshotCardDetailText,args:[target.productId,target.itemId,target.vendorItemId]
  });
  const beforeTexts=[...new Set((beforePopup||[]).flatMap(frame=>frame?.result?.texts||[]))];
  const beforeUrl=(await chrome.tabs.get(tabId)).url;
  const click=await dispatchTrustedClickAndCapture(tabId,scan.cardClickPoint);
  scan.cardInteractionStatus=click.ok?'clicked':click.reason;
  if (!click.ok) return scan;
  const afterUrl=(await chrome.tabs.get(tabId)).url;
  const beforeLocation=new URL(beforeUrl),afterLocation=new URL(afterUrl);
  const sameProduct=beforeLocation.origin===afterLocation.origin
    &&beforeLocation.pathname===afterLocation.pathname
    &&beforeLocation.searchParams.get('itemId')===afterLocation.searchParams.get('itemId')
    &&beforeLocation.searchParams.get('vendorItemId')===afterLocation.searchParams.get('vendorItemId');
  if (!sameProduct) {
    scan.cardInteractionStatus='navigation-blocked';
    await chrome.tabs.update(tabId,{url:beforeUrl});
    await waitForComplete(tabId);
    return scan;
  }
  const popup=await chrome.scripting.executeScript({
    target:{tabId,allFrames:true},func:readCardPopup,
    args:[target.productId,target.itemId,target.vendorItemId,scan.price,scan.cardBenefitText,scan.cardProviders,beforeTexts,scan.cardClickPoint]
  });
  const card=(popup||[]).map(frame=>frame?.result).find(result=>result?.captured)
    ||(popup||[]).map(frame=>frame?.result).find(result=>result?.reason==='card-popup-unparseable')
    ||popup?.[0]?.result;
  const debuggerCard=parseDebuggerCardEvidence(scan.price,scan.cardBenefitText,scan.cardProviders,click);
  scan.cardDebug=debuggerCard?.cardDebug||null;
  if (card?.captured&&debuggerCard?.captured) {
    const same=card.cardRate===debuggerCard.cardRate&&card.cardMaxDiscount===debuggerCard.cardMaxDiscount&&card.cardDiscount===debuggerCard.cardDiscount;
    if (same) Object.assign(scan,debuggerCard,{cardEvidenceSource:`dom+${debuggerCard.cardEvidenceSource}`});
    else scan.cardInteractionStatus='card-evidence-conflict';
  } else if (debuggerCard?.captured) Object.assign(scan,debuggerCard);
  else if (card?.captured) Object.assign(scan,card,{cardInteractionStatus:'captured',cardEvidenceSource:'dom'});
  else scan.cardInteractionStatus=debuggerCard?.reason||card?.reason||'card-popup-no-result';
  if (scan.cardBenefitStatus==='captured'&&(!Array.isArray(scan.cardProviders)||!scan.cardProviders.some(Boolean))) {
    scan.cardBenefitStatus='partial';
    scan.cardInteractionStatus='card-provider-missing';
    scan.cardDiscount=null;
    scan.cardRate=null;
    scan.cardMaxDiscount=null;
  }
  return scan;
}

function readDanawaSellers(expectedMtm,expectedSrp) {
  const minimumPrice=Number(expectedSrp)>0&&Number(expectedSrp)<250000?10000:250000;
  const bodyText=document.body?.innerText||'';
  const title=document.querySelector('h1,h2,h3')?.textContent?.trim()||document.title||'';
  const excluded=/해외\s*(?:구매|직구|배송)|구매\s*대행|현금(?!\s*영수증)|무통장\s*입금|계좌\s*이체/i;
  if (excluded.test(title)) return {ok:false,reason:'excluded-product-or-payment',sellers:[],title};
  if (!bodyText.toUpperCase().includes(expectedMtm.toUpperCase())) return {ok:false,reason:'mtm-mismatch',sellers:[],title};
  const heading=[...document.querySelectorAll('h2,h3,h4,div,strong')].find(n=>n.textContent?.trim()==='쇼핑몰별 최저가');
  const root=heading?.parentElement?.parentElement || document.body;
  const sellers=[];
  for (const img of root.querySelectorAll('img[alt]')) {
    const seller=(img.getAttribute('alt')||'').replace(/^Image:\s*/,'').trim();
    if (!seller || /로딩중|상품.*이미지|다나와/i.test(seller) || excluded.test(seller)) continue;
    let node=img.parentElement;
    for (let depth=0;node&&depth<7;depth++,node=node.parentElement) {
      const text=(node.innerText||'').replace(/\s+/g,' ').trim();
      const match=text.match(/([0-9][0-9,]{4,})\s*원/);
      if (match && text.length<1800) {
        const price=Number(match[1].replace(/,/g,''));
        if (!excluded.test(text) && price>=minimumPrice&&price<=7000000&&!sellers.some(x=>x.seller===seller)) sellers.push({seller,price,label:text.slice(0,500)});
        break;
      }
    }
  }
  return {ok:sellers.length>0,reason:sellers.length?'ok':'seller-not-found',sellers:sellers.slice(0,12),title};
}

async function scanAll() {
  const lock = await chrome.storage.local.get(['running','runningStartedAt']);
  const lockAge = Date.now() - Number(lock.runningStartedAt || 0);
  // A full multi-brand pass can take well over five minutes. Keep a one-hour
  // lock so a second manual click cannot start an overlapping scan.
  if (lock.running && lock.runningStartedAt && lockAge < 60 * 60 * 1000) return;
  await chrome.storage.local.set({running:true,runningStartedAt:Date.now()});
  const scanStartedAt = new Date().toISOString();
  const results = [];
  const closeChildTabs = async (openerTabId) => {
    const childIds=(await chrome.tabs.query({}))
      .filter(candidate=>candidate.openerTabId===openerTabId)
      .map(candidate=>candidate.id)
      .filter(Number.isInteger);
    if (childIds.length) await chrome.tabs.remove(childIds).catch(()=>{});
  };
  try {
    const configuredTargets=await getTargets();
    const catalogErrors=validateProductCatalog(configuredTargets);
    if(catalogErrors.length) throw new Error(`product-catalog-invalid:${catalogErrors.join(',')}`);
    const targets=configuredTargets.filter(x=>x.enabled!==false);
    for (const target of targets) {
      let tab;
      try {
        tab = await chrome.tabs.create({url:target.url, active:true});
        await waitForComplete(tab.id);
        await wait(7000);
        const priceScan=await scanCoupangTab(tab.id,target);
        const result={...target, ...priceScan, checkedAt:new Date().toISOString()};
        if(priceScan?.ok) {
          const productPageCouponDiscount=priceScan.strikeReliable===true
            &&Number.isFinite(priceScan.strikePrice)&&Number.isFinite(priceScan.price)
            &&priceScan.strikePrice>=priceScan.price
            ? priceScan.strikePrice-priceScan.price : null;
          Object.assign(result,await collectCheckoutDiscountsForTarget(target,productPageCouponDiscount));
        }
        if (target.danawaUrl) {
          let danawaTab;
          try {
            danawaTab=await chrome.tabs.create({url:target.danawaUrl,active:true});
            await waitForComplete(danawaTab.id);
            await wait(6000);
            const sellerScan=await chrome.scripting.executeScript({target:{tabId:danawaTab.id},func:readDanawaSellers,args:[target.mtm,target.srp]});
            result.competitors=sellerScan[0].result.sellers||[];
            result.competitorReason=sellerScan[0].result.reason;
            result.competitorPageTitle=sellerScan[0].result.title||'';
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
        const retryScan=await scanCoupangTab(retryTab.id,result);
        if (retryScan?.ok) {
          Object.assign(result,retryScan,{checkedAt:new Date().toISOString(),retried:true});
          const productPageCouponDiscount=retryScan.strikeReliable===true
            &&Number.isFinite(retryScan.strikePrice)&&Number.isFinite(retryScan.price)
            &&retryScan.strikePrice>=retryScan.price
            ? retryScan.strikePrice-retryScan.price : null;
          Object.assign(result,await collectCheckoutDiscountsForTarget(result,productPageCouponDiscount));
        }
      } catch (_) {
      } finally {
        if (retryTab?.id) await closeChildTabs(retryTab.id).catch(()=>{});
        if (retryTab?.id) await chrome.tabs.remove(retryTab.id).catch(()=>{});
      }
      await wait(20000);
    }
    const completedAt=new Date().toISOString();
    const itemIds=results.map(result=>String(result.itemId||''));
    const payload = {
      version:5,
      extensionVersion:chrome.runtime.getManifest().version,
      startedAt:scanStartedAt,
      scannedAt:completedAt,
      completedAt,
      targetCount:targets.length,
      resultCount:results.length,
      complete:results.length===targets.length&&new Set(itemIds).size===targets.length,
      results
    };
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    await chrome.downloads.download({url, filename:'MarketPulse/latest-coupang-scan.json', conflictAction:'overwrite', saveAs:false});
    await chrome.storage.local.set({
      lastRunDay:localDay(),
      lastRunSlot:currentScheduledScanSlot(),
      lastResult:payload
    });
  } finally {
    await chrome.storage.local.set({running:false,runningStartedAt:null});
  }
}

const SCHEDULED_SCAN_TIMES = [
  {alarm:'daily-scan-0800',hour:8,minute:0,slot:'08:00'},
  {alarm:'daily-scan-1400',hour:14,minute:0,slot:'14:00'}
];

function kstDateTimeParts(date=new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Seoul',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
  }).formatToParts(date).map(part=>[part.type,part.value]));
}

function currentScheduledScanSlot(date=new Date()) {
  const p=kstDateTimeParts(date);
  const minuteOfDay=(+p.hour*60)+(+p.minute);
  const due=[...SCHEDULED_SCAN_TIMES].reverse().find(entry=>minuteOfDay>=(entry.hour*60+entry.minute));
  return due ? `${p.year}-${p.month}-${p.day}T${due.slot}+09:00` : null;
}

async function schedule() {
  const now=new Date();
  const p=kstDateTimeParts(now);
  const kstNowAsUtc=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  for(const entry of SCHEDULED_SCAN_TIMES){
    await chrome.alarms.clear(entry.alarm);
    let nextKst=Date.UTC(+p.year,+p.month-1,+p.day,entry.hour,entry.minute);
    if(nextKst<=kstNowAsUtc) nextKst+=86400000;
    await chrome.alarms.create(entry.alarm,{when:Date.now()+(nextKst-kstNowAsUtc),periodInMinutes:1440});
  }
}

function enterCheckoutDiagnostic(expectedProductId,expectedItemId,expectedVendorItemId,clickBuyNow=true) {
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const currentUrl=new URL(location.href);
  const actualProductId=currentUrl.pathname.match(/\/vp\/products\/(\d+)/)?.[1]||null;
  const params=currentUrl.searchParams;
  if(actualProductId!==String(expectedProductId)||params.get('itemId')!==String(expectedItemId)||params.get('vendorItemId')!==String(expectedVendorItemId)) {
    return {ok:false,reason:'product-identifiers-mismatch'};
  }
  const visible=element=>{
    const style=getComputedStyle(element),rect=element.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
  };
  const quantity=[...document.querySelectorAll('input[type="number"],input[class*="quantity"]')]
    .find(visible);
  if(quantity&&Number(quantity.value)!==1) return {ok:false,reason:'quantity-is-not-one'};
  const selectedCare=[...document.querySelectorAll('input[type="radio"]:checked')]
    .map(input=>clean(input.closest('label')?.innerText||input.parentElement?.innerText))
    .find(text=>/무상보증|안심케어/.test(text)&&!/선택안함/.test(text));
  if(selectedCare) return {ok:false,reason:'care-option-selected'};
  const button=[...document.querySelectorAll('button,a,[role="button"]')]
    .filter(visible)
    .find(element=>/^바로구매(?:\s|>|›|$)/.test(clean(element.innerText||element.textContent)));
  if(!button) return {ok:false,reason:'buy-now-button-not-found'};
  const buttonEvidence=clean([
    button.innerText||button.textContent,
    button.className,
    button.getAttribute('aria-label'),
    button.getAttribute('title')
  ].filter(Boolean).join(' '));
  const disabled=button.disabled||button.getAttribute('aria-disabled')==='true'||/disabled/i.test(button.className);
  if(disabled) return {ok:false,reason:'buy-now-button-sold-out',buttonEvidence:buttonEvidence.slice(0,240)};
  if(clickBuyNow) button.click();
  return {ok:true,buttonEvidence:buttonEvidence.slice(0,240),checkedAt:new Date().toISOString()};
}

function readCheckoutDiscounts() {
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const compact=value=>clean(value).replace(/\s+/g,'');
  const visible=element=>{
    const style=getComputedStyle(element),rect=element.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
  };
  const readAmount=(labels,excludedLabels=[])=>{
    const accepted=(Array.isArray(labels)?labels:[labels]).filter(Boolean).map(compact).sort((a,b)=>b.length-a.length);
    const excluded=(Array.isArray(excludedLabels)?excludedLabels:[excludedLabels]).filter(Boolean).map(compact);
    const allDiscountLabels=[
      '일반쿠폰할인','상품쿠폰할인','쿠폰할인','와우전용즉시할인','와우회원즉시할인','와우즉시할인',
      '와우전용쿠폰할인','와우회원쿠폰할인','와우쿠폰할인','와우회원총추가혜택','와우총추가혜택',
      '와우전용카드즉시할인'
    ];
    const mapCompact=text=>{
      const normalized=String(text||'').replace(/\r/g,'');
      let value='';
      const rawIndexes=[];
      for(let index=0;index<normalized.length;index++){
        if(/\s/.test(normalized[index])) continue;
        value+=normalized[index];
        rawIndexes.push(index);
      }
      return {raw:normalized,value,rawIndexes};
    };
    const occurrences=(value,aliases)=>{
      const found=[];
      for(const alias of aliases){
        let index=value.indexOf(alias);
        while(index>=0){
          found.push({start:index,end:index+alias.length,label:alias});
          index=value.indexOf(alias,index+1);
        }
      }
      return found.sort((a,b)=>a.start-b.start||b.label.length-a.label.length);
    };
    const parseAmounts=text=>{
      const found=[];
      const patterns=[
        /[-\u2212\u2013\u2014]?\s*([0-9][0-9,]*)\s*원/g,
        /[-\u2212\u2013\u2014]?\s*\u20a9\s*([0-9][0-9,]*)/g
      ];
      for(const pattern of patterns){
        for(const match of text.matchAll(pattern)){
          const amount=Number(match[1].replace(/,/g,''));
          if(Number.isInteger(amount)&&amount>=0&&amount<=7000000){
            found.push({amount,index:match.index,end:match.index+match[0].length});
          }
        }
      }
      return found.sort((a,b)=>a.index-b.index);
    };
    const extractFromContext=text=>{
      const mapped=mapCompact(text);
      let searchable=mapped.value;
      const excludedOccurrences=occurrences(searchable,excluded);
      if(excludedOccurrences.length){
        const chars=[...searchable];
        for(const match of excludedOccurrences) for(let i=match.start;i<match.end;i++) chars[i]=' ';
        searchable=chars.join('');
      }
      const targets=occurrences(searchable,accepted).filter((match,index,list)=>
        !list.some((other,otherIndex)=>otherIndex!==index&&other.start<=match.start&&other.end>=match.end
          &&(other.start<match.start||other.end>match.end))
      );
      if(!targets.length) return {labelSeen:false,amount:null};
      let labelSeen=false;
      for(const target of targets){
        const boundaries=occurrences(mapped.value,allDiscountLabels)
          .filter(match=>match.start!==target.start||match.end!==target.end);
        const previous=boundaries.filter(match=>match.end<=target.start).sort((a,b)=>b.end-a.end)[0];
        const next=boundaries.filter(match=>match.start>=target.end).sort((a,b)=>a.start-b.start)[0];
        const rawStart=target.start<mapped.rawIndexes.length?mapped.rawIndexes[target.start]:0;
        const rawEndIndex=Math.min(target.end-1,mapped.rawIndexes.length-1);
        const rawEnd=rawEndIndex>=0?mapped.rawIndexes[rawEndIndex]+1:rawStart;
        const beforeBoundary=previous&&previous.end<mapped.rawIndexes.length?mapped.rawIndexes[previous.end]:Math.max(0,rawStart-160);
        const afterBoundary=next&&next.start<mapped.rawIndexes.length?mapped.rawIndexes[next.start]:Math.min(mapped.raw.length,rawEnd+200);
        const after=mapped.raw.slice(rawEnd,Math.min(afterBoundary,rawEnd+160));
        const afterAmounts=parseAmounts(after);
        if(afterAmounts.length) return {labelSeen:true,amount:afterAmounts[0].amount};
        const before=mapped.raw.slice(Math.max(beforeBoundary,rawStart-120),rawStart);
        const beforeAmounts=parseAmounts(before);
        if(beforeAmounts.length) return {labelSeen:true,amount:beforeAmounts[beforeAmounts.length-1].amount};
        // Coupang always renders a plain "쿠폰할인" section heading. It is not
        // evidence of an applied regular coupon. A real generic coupon row has
        // either a readable amount or the adjacent "변경" control. More specific
        // labels such as 일반/상품 쿠폰할인 remain evidence even without a value.
        const targetTail=mapped.raw.slice(rawEnd,Math.min(afterBoundary,rawEnd+60));
        if(target.label!=='쿠폰할인'||/변경/.test(targetTail)) labelSeen=true;
      }
      return {labelSeen,amount:null};
    };
    const candidates=[...document.querySelectorAll('dt,dd,li,tr,div,span,p')]
      .filter(visible)
      .map(element=>({element,text:clean(element.innerText||element.textContent)}))
      .filter(entry=>entry.text.length<300&&accepted.some(label=>{
        let value=compact(entry.text);
        for(const excludedLabel of excluded) value=value.split(excludedLabel).join(' '.repeat(excludedLabel.length));
        return value.includes(label);
      }))
      .sort((a,b)=>a.text.length-b.text.length);
    let labelSeen=false;
    for(const entry of candidates){
      let node=entry.element;
      for(let depth=0;node&&depth<5;depth++,node=node.parentElement){
        const text=String(node.innerText||node.textContent||'');
        if(clean(text).length>800) break;
        const extracted=extractFromContext(text);
        if(!extracted.labelSeen) continue;
        labelSeen=true;
        if(Number.isFinite(extracted.amount)) return {status:'captured',amount:extracted.amount};
      }
    }
    return {status:labelSeen?'unverified':'missing',amount:null};
  };
  const bodyText=clean(document.body?.innerText);
  const discountEvidence=[...new Set([...document.querySelectorAll('dt,dd,li,tr,div,span,p')]
    .filter(visible)
    .map(element=>clean(element.innerText||element.textContent))
    .filter(text=>text.length>=3&&text.length<=120&&/(?:일반\s*쿠폰할인|상품\s*쿠폰(?:할인)?|쿠폰할인(?:\s*변경)?|와우(?:회원|\s*전용)?\s*즉시할인|와우(?:회원|\s*전용)?\s*쿠폰할인)/.test(text))
    .filter(text=>!/(?:결제수단|신용|체크카드|카드번호|쿠페이|캐시|약관|개인정보|https?:|mercury\.coupang|thumbnail|impressionLog)/i.test(text)))]
    .sort((a,b)=>a.length-b.length).slice(0,20);
  const paymentButtonPresent=[...document.querySelectorAll('button,[role="button"]')]
    .filter(visible).some(button=>clean(button.innerText||button.textContent)==='결제하기');
  if(!/주문\s*\/\s*결제/.test(bodyText)||!paymentButtonPresent){
    return {ok:false,reason:'checkout-page-not-confirmed',host:location.hostname,path:location.pathname,discountEvidence};
  }
  return {
    ok:true,host:location.hostname,path:location.pathname,capturedAt:new Date().toISOString(),
    regularCouponDiscount:readAmount(
      ['일반 쿠폰할인','상품 쿠폰할인','쿠폰할인'],
      ['와우 전용 쿠폰할인','와우전용 쿠폰할인','와우회원 쿠폰할인','와우 쿠폰할인']
    ),
    wowInstantDiscount:readAmount(['와우 전용 즉시할인','와우전용 즉시할인','와우회원 즉시할인','와우 즉시할인']),
    wowCouponDiscount:readAmount(['와우 전용 쿠폰할인','와우전용 쿠폰할인','와우회원 쿠폰할인','와우 쿠폰할인']),
    wowMemberTotal:readAmount(['와우회원 총 추가 혜택','와우 회원 총 추가 혜택','와우 총 추가 혜택']),
    paymentButtonPresent,discountEvidence
  };
}

function reconcileCheckoutDiscounts(regular,instant,coupon) {
  const inferredZeroFields=[];
  // Reaching and confirming the checkout page is the evidence boundary. If a
  // discount line is absent there, the corresponding benefit is zero, not unknown.
  if(!Number.isFinite(regular)) {
    regular=0;
    inferredZeroFields.push('checkoutCouponDiscount');
  }
  if(!Number.isFinite(instant)) {
    instant=0;
    inferredZeroFields.push('wowInstantDiscount');
  }
  if(!Number.isFinite(coupon)) {
    coupon=0;
    inferredZeroFields.push('wowCouponDiscount');
  }
  const wowTotal=instant+coupon;
  return {
    status:'captured',
    reason:inferredZeroFields.length?'checkout-confirmed-absent-discount-fields-zero':'checkout-three-discount-fields-captured',
    regular,instant,coupon,wowTotal,inferredZeroFields
  };
}

async function collectCheckoutDiscountsForTarget(target,productPageCouponDiscount=null) {
  let tab;
  try {
    tab=await chrome.tabs.create({url:target.url,active:false});
    await waitForComplete(tab.id);
    await wait(7000);
    const entered=await chrome.scripting.executeScript({
      target:{tabId:tab.id},func:enterCheckoutDiagnostic,args:[target.productId,target.itemId,target.vendorItemId]
    });
    if(!entered?.[0]?.result?.ok) {
      const reason=entered?.[0]?.result?.reason||'checkout-entry-failed';
      const soldOut=['buy-now-button-not-found','buy-now-button-sold-out'].includes(reason);
      return {
        checkoutDiscountStatus:'missing',checkoutDiscountReason:reason,
        checkoutCouponDiscount:soldOut&&Number.isFinite(productPageCouponDiscount)?productPageCouponDiscount:null,
        checkoutCouponSource:soldOut?'product-page-soldout':null,
        wowInstantDiscount:null,wowCouponDiscount:null
      };
    }
    for(let i=0;i<30;i++){
      await wait(500);
      const current=await chrome.tabs.get(tab.id);
      if(current.status==='complete'&&!String(current.url||'').includes('/vp/products/')) break;
    }
    await wait(4000);
    let page,confirmedPage,reconciled;
    let regular=null,instant=null,coupon=null,wowMemberTotal=null;
    let regularStatus='missing',instantStatus='missing',couponStatus='missing';
    for(let attempt=0;attempt<4;attempt++){
      const read=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readCheckoutDiscounts});
      page=read?.[0]?.result;
      if(page?.ok) confirmedPage=page;
      if(page?.regularCouponDiscount?.status==='captured') { regular=page.regularCouponDiscount.amount; regularStatus='captured'; }
      else if(page?.regularCouponDiscount?.status==='unverified'&&regularStatus!=='captured') regularStatus='unverified';
      if(page?.wowInstantDiscount?.status==='captured') { instant=page.wowInstantDiscount.amount; instantStatus='captured'; }
      else if(page?.wowInstantDiscount?.status==='unverified'&&instantStatus!=='captured') instantStatus='unverified';
      if(page?.wowCouponDiscount?.status==='captured') { coupon=page.wowCouponDiscount.amount; couponStatus='captured'; }
      else if(page?.wowCouponDiscount?.status==='unverified'&&couponStatus!=='captured') couponStatus='unverified';
      if(page?.wowMemberTotal?.status==='captured') wowMemberTotal=page.wowMemberTotal.amount;
      // Retry absent rows because checkout discounts can render after the page
      // shell. Only after the final read are stable absences converted to zero.
      if(page?.ok&&Number.isFinite(regular)&&Number.isFinite(instant)&&Number.isFinite(coupon)) break;
      if(attempt<3) await wait(2500);
    }
    page=confirmedPage||page;
    if(!page?.ok) {
      return {
        checkoutDiscountStatus:'missing',checkoutDiscountReason:page?.reason||'checkout-read-failed',
        checkoutCouponDiscount:null,checkoutCouponSource:null,
        wowInstantDiscount:null,wowCouponDiscount:null,checkoutDiscountEvidence:page?.discountEvidence||[]
      };
    }
    const unparsedFields=[];
    if(!Number.isFinite(regular)&&regularStatus==='unverified') unparsedFields.push('checkoutCouponDiscount');
    if(!Number.isFinite(instant)&&instantStatus==='unverified') unparsedFields.push('wowInstantDiscount');
    if(!Number.isFinite(coupon)&&couponStatus==='unverified') unparsedFields.push('wowCouponDiscount');
    if(unparsedFields.length){
      const partialRegular=Number.isFinite(regular)?regular:(regularStatus==='missing'?0:null);
      const partialInstant=Number.isFinite(instant)?instant:(instantStatus==='missing'?0:null);
      const partialCoupon=Number.isFinite(coupon)?coupon:(couponStatus==='missing'?0:null);
      return {
        checkoutDiscountStatus:'unverified',checkoutDiscountReason:'checkout-discount-label-present-amount-unparsed',
        checkoutCouponDiscount:partialRegular,checkoutCouponSource:Number.isFinite(partialRegular)?'checkout':null,
        wowInstantDiscount:partialInstant,wowCouponDiscount:partialCoupon,
        checkoutProductDiscount:productPageCouponDiscount,
        checkoutWowMemberTotal:wowMemberTotal,checkoutDiscountCapturedAt:page.capturedAt,
        checkoutUnparsedFields:unparsedFields,
        checkoutDiscountFieldStatus:{regular:regularStatus,wowInstant:instantStatus,wowCoupon:couponStatus},
        checkoutDiscountEvidence:page.discountEvidence||[]
      };
    }
    // The displayed Wow member total can include a card benefit. Only the
    // three independent checkout coupon rows affect the coupon calculation.
    reconciled=reconcileCheckoutDiscounts(regular,instant,coupon);
    if(!reconciled||reconciled.status!=='captured') {
      return {
        checkoutDiscountStatus:reconciled?.status||'missing',checkoutDiscountReason:reconciled?.reason||'checkout-discount-label-missing',
        checkoutCouponDiscount:null,checkoutCouponSource:null,wowInstantDiscount:null,wowCouponDiscount:null,
        checkoutProductDiscount:productPageCouponDiscount,
        checkoutWowMemberTotal:wowMemberTotal,checkoutDiscountCapturedAt:page.capturedAt,
        checkoutDiscountEvidence:page.discountEvidence||[]
      };
    }
    return {
      checkoutDiscountStatus:'captured',
      checkoutDiscountReason:reconciled.reason,
      checkoutCouponDiscount:reconciled.regular,checkoutCouponSource:'checkout',
      wowInstantDiscount:reconciled.instant,wowCouponDiscount:reconciled.coupon,
      checkoutDiscountTotal:reconciled.regular+reconciled.wowTotal,
      checkoutProductDiscount:productPageCouponDiscount,
      checkoutWowMemberTotal:wowMemberTotal,
      checkoutDiscountCapturedAt:page.capturedAt,checkoutInferredZeroFields:reconciled.inferredZeroFields,
      checkoutDiscountEvidence:page.discountEvidence||[]
    };
  } catch(error) {
    return {
      checkoutDiscountStatus:'missing',checkoutDiscountReason:String(error),
      checkoutCouponDiscount:null,checkoutCouponSource:null,
      wowInstantDiscount:null,wowCouponDiscount:null
    };
  } finally {
    if(tab?.id) await chrome.tabs.remove(tab.id).catch(()=>{});
  }
}

async function diagnoseCheckoutDiscounts() {
  const [activeTab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!activeTab?.url) return {ok:false,reason:'active-product-tab-not-found'};
  let activeUrl;
  try { activeUrl=new URL(activeTab.url); } catch (_) { return {ok:false,reason:'active-product-url-invalid'}; }
  if(activeUrl.hostname!=='www.coupang.com'||!activeUrl.pathname.startsWith('/vp/products/')) {
    return {ok:false,reason:'open-a-registered-coupang-product-first'};
  }
  const itemId=activeUrl.searchParams.get('itemId');
  const targets=await getTargets();
  const target=targets.find(entry=>entry.enabled!==false&&String(entry.itemId)===String(itemId));
  if(!target) return {ok:false,reason:'registered-item-id-not-found'};
  try {
    const read=await chrome.scripting.executeScript({
      target:{tabId:activeTab.id},func:readDisplayedPrice,args:[target.productId,target.itemId,target.vendorItemId,target.srp]
    });
    const priceScan=read?.[0]?.result;
    const productPageCouponDiscount=priceScan?.ok&&priceScan.strikeReliable===true
      &&Number.isFinite(priceScan.strikePrice)&&Number.isFinite(priceScan.price)&&priceScan.strikePrice>=priceScan.price
      ? priceScan.strikePrice-priceScan.price : null;
    const checkout=await collectCheckoutDiscountsForTarget(target,productPageCouponDiscount);
    if(checkout.checkoutDiscountStatus!=='captured') return {ok:false,reason:checkout.checkoutDiscountReason};
    const payload={
      diagnosticType:'checkout-three-discounts',extensionVersion:chrome.runtime.getManifest().version,
      mtm:target.mtm,itemId:String(target.itemId),capturedAt:checkout.checkoutDiscountCapturedAt,
      couponDiscount:{status:'captured',source:'checkout',amount:checkout.checkoutCouponDiscount},
      wowInstantDiscount:{status:'captured',amount:checkout.wowInstantDiscount},
      wowCouponDiscount:{status:'captured',amount:checkout.wowCouponDiscount},
      safety:{checkoutReadOnly:true,paymentButtonClicked:false,pageInteractionAfterEntry:false}
    };
    const url='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(payload,null,2));
    await chrome.downloads.download({url,filename:'MarketPulse/checkout-discount-diagnostic.json',conflictAction:'overwrite',saveAs:false});
    return {ok:true};
  } catch(error) {
    return {ok:false,reason:String(error)};
  }
}

chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.storage.local.set({running:false,runningStartedAt:null});
  await schedule();
});
chrome.runtime.onStartup.addListener(async()=>{
  await schedule();
  const state=await chrome.storage.local.get(['lastRunSlot']);
  const dueSlot=currentScheduledScanSlot();
  if(dueSlot&&state.lastRunSlot!==dueSlot) scanAll();
});
chrome.alarms.onAlarm.addListener(alarm=>{
  if(SCHEDULED_SCAN_TIMES.some(entry=>entry.alarm===alarm.name)) scanAll();
});
chrome.action.onClicked.addListener(scanAll);
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if (message?.type==='GET_PRODUCTS') {
    getTargets().then(products=>sendResponse({ok:true,products}));
    return true;
  }
  if (message?.type==='SAVE_PRODUCTS') {
    const errors=validateProductCatalog(message.products);
    if(errors.length) sendResponse({ok:false,error:`product-catalog-invalid:${errors.join(',')}`});
    else chrome.storage.local.set({products:message.products}).then(()=>sendResponse({ok:true})).catch(error=>sendResponse({ok:false,error:String(error)}));
    return true;
  }
  if (message?.type==='RUN_SCAN') {
    scanAll();
    sendResponse({ok:true});
  }
  if (message?.type==='DIAGNOSE_CHECKOUT_DISCOUNTS') {
    diagnoseCheckoutDiscounts().then(sendResponse).catch(error=>sendResponse({ok:false,reason:String(error)}));
    return true;
  }
});
