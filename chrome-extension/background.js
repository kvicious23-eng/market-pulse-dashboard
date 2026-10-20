const TARGETS = [
  {brand:'Lenovo',category:'Notebook',mtm:'83N30037KR',productId:'9235110727',itemId:'27303279355',vendorItemId:'95415897534',srp:1109000,enabled:true,url:'https://www.coupang.com/vp/products/9235110727?itemId=27303279355&vendorItemId=95415897534',danawaUrl:'https://prod.danawa.com/info/?pcode=95845739'},
  {brand:'Lenovo',category:'Notebook',mtm:'83N3003DKR',productId:'9235110727',itemId:'27303268765',vendorItemId:'95415897535',srp:1159000,enabled:true,url:'https://www.coupang.com/vp/products/9235110727?itemId=27303268765&vendorItemId=95415897535',danawaUrl:'https://prod.danawa.com/info/?pcode=95845826'},
  {brand:'Lenovo',category:'Notebook',mtm:'83N30046KR',productId:'8708708250',itemId:'25515648568',vendorItemId:'95415897536',srp:1199000,enabled:true,url:'https://www.coupang.com/vp/products/8708708250?itemId=25515648568&vendorItemId=95415897536',danawaUrl:'https://prod.danawa.com/info/?pcode=122647414'},
  {brand:'Acer',category:'Notebook',mtm:'ANV16-I31-514Z',productId:'9573633117',itemId:'28575928128',vendorItemId:'95520178041',srp:1558000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=28575928128&vendorItemId=95520178041',danawaUrl:'https://prod.danawa.com/info/?pcode=122672194'},
  {brand:'Acer',category:'Notebook',mtm:'AG14-I71M-972S',productId:'9681715061',itemId:'28951318769',vendorItemId:'95881909514',srp:1429000,enabled:true,url:'https://www.coupang.com/vp/products/9681715061?itemId=28951318769&vendorItemId=95881909514',danawaUrl:'https://prod.danawa.com/info/?pcode=123650595'},
  {brand:'Acer',category:'Notebook',mtm:'AG14-I71M-96C5',productId:'9681715061',itemId:'28951318771',vendorItemId:'95881909515',srp:1569000,enabled:true,url:'https://www.coupang.com/vp/products/9681715061?itemId=28951318771&vendorItemId=95881909515',danawaUrl:'https://prod.danawa.com/info/?pcode=123763381'},
  {brand:'Acer',category:'Notebook',mtm:'PHN16S-71-949J',productId:'9573633117',itemId:'26004597899',vendorItemId:'92986675922',srp:4099000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=26004597899&vendorItemId=92986675922',danawaUrl:'https://prod.danawa.com/info/?pcode=93445997'},
  {brand:'Acer',category:'Notebook',mtm:'SFG14-I71-57P5',productId:'9616664363',itemId:'28714706385',vendorItemId:'95655361667',srp:1689000,enabled:true,url:'https://www.coupang.com/vp/products/9616664363?itemId=28714706385&vendorItemId=95655361667',danawaUrl:'https://prod.danawa.com/info/?pcode=122719782'},
  {brand:'Acer',category:'Notebook',mtm:'SFG14-75-508U',productId:'9428079675',itemId:'28287192873',vendorItemId:'95240133006',srp:1229000,enabled:true,url:'https://www.coupang.com/vp/products/9428079675?itemId=28287192873&vendorItemId=95240133006',danawaUrl:'https://prod.danawa.com/info/?pcode=122636128'},
  {brand:'Acer',category:'Notebook',mtm:'SFG16-74-7412',productId:'9573633117',itemId:'28029585486',vendorItemId:'94986693706',srp:1659000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=28029585486&vendorItemId=94986693706',danawaUrl:'https://prod.danawa.com/info/?pcode=122702450'},
  {brand:'Acer',category:'Notebook',mtm:'SFG16-I71-75Y2',productId:'9483273252',itemId:'28237319655',vendorItemId:'95190959758',srp:1829000,enabled:true,url:'https://www.coupang.com/vp/products/9483273252?itemId=28237319655&vendorItemId=95190959758',danawaUrl:'https://prod.danawa.com/info/?pcode=122636236'},
  {brand:'Acer',category:'Notebook',mtm:'SFG16-74-70E9',productId:'9573633117',itemId:'28714706401',vendorItemId:'95655361668',srp:1439000,enabled:true,url:'https://www.coupang.com/vp/products/9573633117?itemId=28714706401&vendorItemId=95655361668',danawaUrl:'https://prod.danawa.com/info/?pcode=122719720'},
  {brand:'Acer',category:'Notebook',mtm:'SF16-71T-7475',productId:'9437677217',itemId:'28067081535',vendorItemId:'95023756227',srp:2369000,enabled:true,url:'https://www.coupang.com/vp/products/9437677217?itemId=28067081535&vendorItemId=95023756227',danawaUrl:'https://prod.danawa.com/info/?pcode=107769113'},
  {"mtm":"SFG14-75-749N","productId":"9738841025","itemId":"29147260106","vendorItemId":"96070559959","category":"Notebook","srp":2299000,"brand":"Acer","enabled":true,"url":"https://www.coupang.com/vp/products/9738841025?itemId=29147260106&vendorItemId=96070559959"},
  {brand:'Godox',category:'Camera',mtm:'C100',productId:'9738958594',itemId:'29147698397',vendorItemId:'96070924334',srp:42000,enabled:true,url:'https://www.coupang.com/vp/products/9738958594?itemId=29147698397&vendorItemId=96070924334',enuriUrl:'https://price.enuri.com/catalog/148559067'}
];

async function getTargets() {
  const state=await chrome.storage.local.get(['products']);
  if (!Array.isArray(state.products)) return TARGETS;
  return state.products.map(product=>{
    const fallback=TARGETS.find(target=>String(target.itemId)===String(product.itemId));
    const target={...fallback,...product};
    if(!target.danawaUrl&&fallback?.danawaUrl) target.danawaUrl=fallback.danawaUrl;
    delete target.naverUrl;
    if(String(target.itemId)==='29147698397' && !target.enuriUrl)
      target.enuriUrl='https://price.enuri.com/catalog/148559067';
    return target;
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

async function withScanTimeout(promise,ms,stage) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`scan-timeout:${stage}`)),ms);})
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function withTabEditRetry(operation) {
  const deadline=Date.now()+12000;
  // Only an explicit rejected tab edit is safe to repeat; never retry timeouts.
  for(let attempt=0;;attempt++) {
    try { return await operation(); }
    catch(error) {
      if(attempt>=2||!/Tabs cannot be edited right now/i.test(String(error))) throw error;
      const delay=1000*(attempt+1);
      if(Date.now()+delay>=deadline) throw error;
      await wait(delay);
      if(Date.now()>=deadline) throw error;
    }
  }
}

// Whale can initialize a newly created tab at 0x0 inside a minimized window.
// These windows/tabs belong to this collection; never resize unrelated user windows.
async function prepareWhaleScanWindow(windowState) {
  if(!/Whale\//.test(navigator.userAgent))return;
  if(!Number.isInteger(windowState.windowId)) {
    const w=await withScanTimeout(withTabEditRetry(()=>chrome.windows.create({url:'about:blank',type:'normal',width:1280,height:900,focused:true})),15000,'whale-scan-window');
    if(!Number.isInteger(w?.id))throw Error('whale-scan-window-id-missing');
    windowState.windowId=w.id;
    const anchor=w.tabs?.[0]?.id;
    if(Number.isInteger(anchor))windowState.anchorTabIds.push(anchor);
  }
  const w=await withScanTimeout(chrome.windows.get(windowState.windowId),10000,'whale-window-state');
  if(w.state==='minimized')await withScanTimeout(withTabEditRetry(()=>chrome.windows.update(w.id,{state:'normal',focused:true})),10000,'whale-window-restore');
}
async function ensureWhaleTabViewport(tabId) {
  if(!/Whale\//.test(navigator.userAgent))return null;
  const tab=await withScanTimeout(chrome.tabs.get(tabId),10000,'whale-viewport-tab');
  const w=await withScanTimeout(chrome.windows.get(tab.windowId),10000,'whale-viewport-window');
  if(w.state==='minimized')await withScanTimeout(withTabEditRetry(()=>chrome.windows.update(w.id,{state:'normal',focused:true})),10000,'whale-viewport-restore');
  for(let attempt=0;attempt<5;attempt++) {
    const frames=await withScanTimeout(chrome.scripting.executeScript({target:{tabId},func:()=>({width:innerWidth,height:innerHeight})}),10000,'whale-viewport-read');
    const viewport=frames?.[0]?.result;
    if(viewport?.width>0&&viewport?.height>0)return viewport;
    if(attempt<4)await wait(250);
  }
  throw Error('whale-viewport-unavailable');
}

async function openScanTab(url,stage,windowState) {
  if(/Whale\//.test(globalThis.navigator?.userAgent||''))await prepareWhaleScanWindow(windowState);
  const create=async()=>{
    const tab=await withScanTimeout(withTabEditRetry(()=>chrome.tabs.create({
    url,active:true,...(Number.isInteger(windowState.windowId)?{windowId:windowState.windowId}:{})
  })),15000,stage);
    accessDiagnosticTabs.set(tab.id,{openedAt:new Date().toISOString(),responses:[]});
    return tab;
  };
  try {
    return await create();
  } catch(error) {
    if(!/No current window|No window with id/i.test(String(error))) throw error;
    // Alarm-triggered service workers can run before Chrome has a current window.
    const scanWindow=await withScanTimeout(chrome.windows.create({url:'about:blank',focused:true}),15000,'scan-window-create');
    if(!Number.isInteger(scanWindow?.id)) throw new Error('scan-window-id-missing');
    windowState.windowId=scanWindow.id;
    const anchorId=scanWindow.tabs?.[0]?.id
      ?? (await withScanTimeout(chrome.tabs.query({windowId:scanWindow.id}),15000,'scan-window-tabs'))[0]?.id;
    if(Number.isInteger(anchorId)) windowState.anchorTabIds.push(anchorId);
    return await create();
  }
}

// Observe only enrolled product tabs; never request, block or modify traffic.
const accessDiagnosticTabs=new Map();
function safeAccessRoute(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.hostname!=='www.coupang.com')return null;
    return /^\/vp\/products\/\d+\/?$/.test(url.pathname)?'product':/error|denied|captcha/i.test(url.pathname)?'error':'other';
  }catch{return null;}
}
function safeAccessHeaders(headers) {
  const safe={};
  for(const header of Array.isArray(headers)?headers:[]) {
    const name=String(header.name||'').toLowerCase(),value=String(header.value||'').trim();
    if(name==='server'&&/^(?:AkamaiGHost|nginx|cloudfront|cloudflare|envoy|Apache)(?:\/[\d.]+)?$/i.test(value))safe.server=value;
    if(name==='retry-after') {
      if(/^\d{1,6}$/.test(value))safe.retryAfterSeconds=Number(value);
      else if(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)&&Number.isFinite(Date.parse(value)))safe.retryAfterDate=new Date(value).toISOString();
    }
    if(name==='x-cache'&&/^(?:Hit|Miss|Error|RefreshHit) from cloudfront$/i.test(value))safe.cache=value;
    if(name==='content-type'&&/^(?:text\/html|text\/plain|application\/json)(?:\s*;\s*charset=[a-z0-9-]+)?$/i.test(value))safe.contentType=value;
  }
  return safe;
}
function observeAccessResponse(details,event) {
  const state=accessDiagnosticTabs.get(details.tabId),route=safeAccessRoute(details.url);
  if(!state||details.type!=='main_frame'||details.frameId!==0||!route)return;
  const row={event,route,at:Number.isFinite(details.timeStamp)?new Date(details.timeStamp).toISOString():new Date().toISOString(),
    status:Number.isInteger(details.statusCode)&&details.statusCode>=100&&details.statusCode<=599?details.statusCode:null,
    fromCache:details.fromCache===true,headers:safeAccessHeaders(details.responseHeaders)};
  if(event==='error')row.error=/^net::ERR_[A-Z0-9_]{1,70}$/.test(details.error||'')?details.error:'network-error-unclassified';
  state.responses.push(row);state.responses=state.responses.slice(-6);
}
let accessObserverStatus='unavailable';
if(typeof chrome!=='undefined'&&chrome.webRequest) {
 try {
  const filter={urls:['https://www.coupang.com/*'],types:['main_frame']};
  chrome.webRequest.onCompleted.addListener(details=>observeAccessResponse(details,'complete'),filter,['responseHeaders']);
  chrome.webRequest.onBeforeRedirect.addListener(details=>observeAccessResponse(details,'redirect'),filter,['responseHeaders']);
  chrome.webRequest.onErrorOccurred.addListener(details=>observeAccessResponse(details,'error'),filter);
  accessObserverStatus='registered';
 }catch{accessObserverStatus='registration-failed';}
}
if(typeof chrome!=='undefined')chrome.tabs.onRemoved?.addListener(tabId=>accessDiagnosticTabs.delete(tabId));
function readAccessPageDiagnostic() {
  const text=document.body?.innerText||'';
  const marker=(text.match(/Access Denied|비정상적인 접근|잠시 후 다시 시도|로봇이 아닙니다|captcha/i)
    ||(text.length<2000?text.match(/사용권한이 없습니다|사용권한이 제한된 페이지/):null))?.[0]||'';
  const reference=text.match(/Reference\s*#?\s*(\d{1,3}\.[a-f0-9]{1,32}\.\d{1,16}\.[a-f0-9]{1,32})(?![a-z0-9.])/i)?.[1]
    ||text.match(/Ref:\s*([a-z0-9]{8}_[a-z0-9]{8}_\d{13})(?![a-z0-9_])/i)?.[1]||null;
  const nav=typeof performance!=='undefined'?performance.getEntriesByType('navigation')[0]:null;
  return {marker:marker.toLowerCase(),reference:marker?reference:null,
    navigationStatus:Number.isInteger(nav?.responseStatus)&&nav.responseStatus>=100&&nav.responseStatus<=599?nav.responseStatus:null,
    navigationType:['navigate','reload','back_forward'].includes(nav?.type)?nav.type:null};
}
async function captureAccessDiagnostic(tabId) {
  const state=accessDiagnosticTabs.get(tabId);
  let page=null;
  try {page=(await withScanTimeout(chrome.scripting.executeScript({target:{tabId},func:readAccessPageDiagnostic}),5000,'access-diagnostic'))[0]?.result||null;}catch{}
  return {version:1,observedAt:new Date().toISOString(),openedAt:state?.openedAt||null,
    observerStatus:accessObserverStatus,networkObservation:state?.responses.length?'observed':'not-observed',responses:state?.responses.slice()||[],page};
}
function classifyAccessFailure(scan) {
  // Identity mismatches and a verified price are never overridden by network history.
  if(scan?.ok||scan?.reason!=='price-not-found')return scan;
  const diagnostic=scan.accessDiagnostic;
  const response=(diagnostic?.responses||[]).filter(r=>r.route==='product'&&r.event==='complete').at(-1);
  const status=response?.status??diagnostic?.page?.navigationStatus;
  if(status===403||status===429) {
    scan.reason='access-check';
    scan.accessCheckDetail=status===403?'http-403':'http-429';
  }
  return scan;
}
async function saveAccessDiagnosticArchive(payload) {
  const relevant=payload.results.some(row=>row.accessDiagnostics?.some(attempt=>attempt.reason==='access-check'||attempt.diagnostic?.page?.marker||attempt.diagnostic?.responses?.some(response=>response.event==='error'||response.status===403||response.status===429||response.status>=500)))
    ||payload.recovery?.reason==='access-check';
  if(!relevant)return 'not-needed';
  const archive={version:1,browser:payload.browser,extensionVersion:payload.extensionVersion,runId:payload.runId,
    scanSlot:payload.scanSlot,startedAt:payload.startedAt,completedAt:payload.completedAt,
    chromeRunId:payload.recovery?.chromeRunId||null,primaryBrowser:payload.recovery?.primaryBrowser||null,primaryRequestId:payload.primaryRequestId||null,
    results:payload.results.map(row=>({mtm:row.mtm,ok:row.ok===true,attempts:row.accessDiagnostics||[]}))};
  try {
    const filename=`MarketPulse/${payload.browser==='whale'?'whale-access-diagnostic':'access-diagnostic'}-${payload.runId}.json`;
    const id=await withScanTimeout(chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(archive)),filename,conflictAction:'overwrite',saveAs:false}),10000,'access-archive-start');
    await withScanTimeout(waitForScanDownload(id,filename),20000,'access-archive-complete');
    return 'saved';
  }catch{return 'save-failed';}
}

async function waitForScanDownload(downloadId, expectedFilename) {
  if(!Number.isInteger(downloadId)) throw new Error('scan-download-id-missing');
  if(!expectedFilename||!/^MarketPulse\/[a-z0-9-]+\.json$/.test(expectedFilename)) throw new Error('scan-download-expected-path-missing');
  for(let attempt=0;attempt<60;attempt++) {
    const [item]=await withScanTimeout(chrome.downloads.search({id:downloadId}),10000,'scan-download-status');
    if(item?.state==='complete') {
      const actual=String(item.filename||'').replaceAll('\\','/');
      if(!actual.endsWith('/'+expectedFilename)) throw new Error('scan-download-path-mismatch:'+expectedFilename);
      return item;
    }
    if(item?.state==='interrupted') throw new Error(`scan-download-interrupted:${item.error||'unknown'}`);
    if(!item) throw new Error('scan-download-disappeared');
    await wait(1000);
  }
  throw new Error('scan-download-completion-timeout');
}

function scanSaveTargets(results) {
  const keys=['brand','mtm','category','srp','productId','itemId','vendorItemId','url','danawaUrl','enuriUrl'];
  return results.map(row=>Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,row[key]])));
}
function scanSaveDeadline(startedAt,slot) {
  const start=Date.parse(startedAt),base=Date.parse(slot);
  const hour=Number(slot?.match(/T(08|12|16|20):00\+09:00$/)?.[1]);
  const next=base+(hour===20?12:4)*3600000;
  return Math.min(start+120*60000,next);
}
async function downloadScanPayload(payload,filename) {
  const id=await withScanTimeout(chrome.downloads.download({
    url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(payload,null,2)),
    filename,conflictAction:'overwrite',saveAs:false}),30000,'scan-download-start');
  await withScanTimeout(waitForScanDownload(id,filename),30000,'scan-download-complete');
}
async function saveCompletedScan(payload) {
  // Persist the complete source before attempting any filesystem write.
  const retained=(await chrome.storage.local.get('pendingScanResults')).pendingScanResults||[];
  await chrome.storage.local.set({pendingScanResult:payload,pendingScanResults:[...retained.filter(row=>row.scanSlot===payload.scanSlot),payload].slice(-2)});
  const filename=payload.browser==='whale'?`MarketPulse/${payload.primaryRequestId?'whale-scan':'whale-validation'}-${payload.runId}.json`:payload.recovery?`MarketPulse/edge-recovery-${payload.runId}.json`:'MarketPulse/latest-coupang-scan.json';
  let originalError;
  let savedFilename=filename;
  try {await downloadScanPayload(payload,filename);}
  catch(error) {
    if(!String(error).includes('FILE_ACCESS_DENIED'))throw error;
    originalError=error;
    const unique=payload.browser==='whale'?`MarketPulse/${payload.primaryRequestId?'whale-scan':'whale-validation'}-${payload.runId}-saved.json`:payload.recovery?`MarketPulse/edge-recovery-${payload.runId}-saved.json`:`MarketPulse/latest-coupang-scan-${payload.runId}.json`;
    try {await downloadScanPayload(payload,unique);savedFilename=unique;}
    catch {
      if((payload.browser!=='chrome'&&!(payload.browser==='whale'&&payload.primaryRequestId))||payload.recovery||!payload.scanSlot)throw originalError;
      const old=(await chrome.storage.local.get('scanSaveRecovery')).scanSaveRecovery;
      const same=old?.scanSlot===payload.scanSlot;
      const firstStartedAt=same?old.firstStartedAt:payload.startedAt;
      const deadlineAt=new Date(scanSaveDeadline(firstStartedAt,payload.scanSlot)).toISOString();
      const chromeRetries=same?old.chromeRetries:0;
      const canRetry=chromeRetries<1&&Date.now()<Date.parse(deadlineAt);
      const proof={version:1,browser:payload.browser,primaryRequestId:payload.primaryRequestId,reason:'file-save-error',error:'FILE_ACCESS_DENIED',saveAttempts:2,
        stage:canRetry?'chrome-retry-queued':Date.now()<Date.parse(deadlineAt)?'edge-ready':'deadline-exhausted',
        chromeRetries:canRetry?1:chromeRetries,scanSlot:payload.scanSlot,runId:payload.runId,
        firstStartedAt,startedAt:payload.startedAt,completedAt:payload.completedAt,
        deadlineAt,extensionVersion:payload.extensionVersion,targetCount:payload.targetCount,targets:scanSaveTargets(payload.results)};
      await chrome.storage.local.set({scanSaveRecovery:proof});
      // A unique proof avoids overwriting another recovery signal. Failure to
      // save this evidence never authorizes Windows to guess the cause.
      await downloadScanPayload(proof,`MarketPulse/scan-save-recovery-${payload.runId}.json`).catch(()=>{});
      if(canRetry)queuedSaveRetry={slot:payload.scanSlot,deadlineAt,primaryRequestId:payload.primaryRequestId};
      throw originalError;
    }
  }
  const prior=(await chrome.storage.local.get('scanSaveRecovery')).scanSaveRecovery;
  await chrome.storage.local.set({pendingScanResult:null,pendingScanResults:[],
    lastScanSave:{scanSlot:payload.scanSlot,runId:payload.runId,filename:savedFilename,method:originalError?'unique-file':'canonical',originalError:originalError?'FILE_ACCESS_DENIED':null},
    scanSaveRecovery:prior?.scanSlot===payload.scanSlot?{...prior,stage:'complete'}:null});
}

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
  const accessMarker=bodyText.match(/Access Denied|비정상적인 접근|잠시 후 다시 시도|로봇이 아닙니다|captcha/i)
    ||(bodyText.length<2000?bodyText.match(/사용권한이 없습니다|사용권한이 제한된 페이지/):null);
  if (accessMarker) {
    const marker=accessMarker[0].toLowerCase();
    const accessCheckDetail=/잠시 후 다시 시도/.test(marker)?'temporary-message':
      /로봇이 아닙니다|captcha/.test(marker)?'verification-message':'access-denied-message';
    return {ok:false,reason:'access-check',accessCheckDetail};
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
  // Only the on-screen order in the selected product's price block selects a basis.
  const visibleRect=node=>{
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity??1)!==0&&rect.width>0&&rect.height>0?rect:null;
  };
  const title=[...document.querySelectorAll('h1,.prod-buy-header__title,[class*="prod-buy-header__title"]')]
    .map(node=>({node,rect:visibleRect(node)}))
    .find(entry=>entry.rect&&!entry.node.closest?.('[class*="recommend"],[class*="related"],[class*="carousel"]'));
  const priceNodes=[];
  if (title) for (const node of document.querySelectorAll('strong,span,em,b,del,s,p,div,[data-price]')) {
    const rect=visibleRect(node);
    if (!rect||node===title.node) continue;
    const top=rect.top+scrollY,left=rect.left+scrollX,titleTop=title.rect.top+scrollY,titleLeft=title.rect.left+scrollX;
    if (top<titleTop-12||top>titleTop+460||left<titleLeft-100||left>titleLeft+540) continue;
    if (node.closest?.('[class*="recommend"],[class*="related"],[class*="carousel"],[class*="option"],[class*="delivery"],[class*="shipping"]')) continue;
    const raw=(node.textContent||'').trim().replace(/\s+/g,' ');
    const match=raw.match(/^(?:₩\s*)?([0-9][0-9,]*)(?:\s*원)?$/);
    if (!match) continue;
    const price=Number(match[1].replace(/,/g,''));
    if (price<minimumPrice||price>7000000) continue;
    const context=`${node.className||''} ${node.parentElement?.className||''}`;
    if (!raw.includes('원')&&!raw.includes('₩')&&!/price|amount|total|cost/i.test(context)) continue;
    priceNodes.push({node,price,top,left,text:raw});
  }
  const primary=preferred?priceNodes.filter(entry=>entry.price===preferred.price)
    .sort((a,b)=>a.top-b.top||a.left-b.left)[0]:null;
  const priceBlock=primary?priceNodes.filter(entry=>
    entry.top>=primary.top-125&&entry.top<=primary.top+105&&Math.abs(entry.left-primary.left)<=260
  ).sort((a,b)=>a.top-b.top||a.left-b.left):[];
  const uppermost=priceBlock[0]||null;
  const crossedOut=uppermost&&(/^(DEL|S)$/i.test(uppermost.node.tagName||'')||
    /line-through/i.test(getComputedStyle(uppermost.node).textDecorationLine||'')||
    /line-through/i.test(getComputedStyle(uppermost.node.parentElement||uppermost.node).textDecorationLine||''));
  const strike=uppermost?{price:uppermost.price,selector:'visible-product-price',basisType:crossedOut?'crossed-out':'top-visible'}:null;
  const basisEvidence=uppermost?{top:uppermost.top,left:uppermost.left,text:uppermost.text,
    activePriceTop:primary.top,titleTop:title.rect.top+scrollY,priceBlockCount:priceBlock.length}:null;
  async function locateCardBenefitControl(mainPriceTop) {
    const textOf=node=>(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();
    const shown=node=>{
      const r=node.getBoundingClientRect(),s=getComputedStyle(node);
      return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';
    };
    const mixed=text=>/쿠팡\s*캐시|쿠페이|적립|무이자|배송|장바구니|바로\s*구매|구매하기/.test(text);
    const box=r=>({left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom)});
    // Use each rendered line fragment, never the union of wrapped text lines.
    const phraseRects=(root,pattern)=>{
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
      let raw='';
      for(let n=walker.nextNode();n;n=walker.nextNode()) {
        if(!n.parentElement||!shown(n.parentElement)||/^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentElement.tagName))continue;
        nodes.push({node:n,start:raw.length,end:raw.length+(n.nodeValue||'').length});raw+=n.nodeValue||'';
      }
      const match=raw.match(pattern);if(!match)return [];
      const start=match.index,end=start+match[0].length;
      const first=nodes.find(n=>n.end>start),last=nodes.find(n=>n.end>=end);
      if(!first||!last)return [];
      const range=document.createRange();range.setStart(first.node,start-first.start);range.setEnd(last.node,end-last.start);
      return [...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
    };
    const possible=[...document.querySelectorAll('div,li,p,span,strong')]
      .filter(n=>shown(n)&&/카드\s*즉시할인/.test(textOf(n))&&textOf(n).length<260);
    const debug={summaryFound:possible.length>0,reason:possible.length?'card-row-not-isolated':'card-summary-not-found',candidates:[]};
    const seeds=possible.filter(n=>!mixed(textOf(n))&&n.getBoundingClientRect().height<=180)
      .map(node=>({node,rects:phraseRects(node,/카드\s*즉시할인/)}))
      .filter(e=>e.rects.length)
      .map(e=>({...e,top:Math.min(...e.rects.map(r=>r.top))+scrollY}))
      .filter(e=>!Number.isFinite(mainPriceTop)||(e.top>=mainPriceTop-120&&e.top<=mainPriceTop+700))
      .sort((a,b)=>a.top-b.top||textOf(a.node).length-textOf(b.node).length||a.node.getBoundingClientRect().height-b.node.getBoundingClientRect().height);
    let row=seeds[0]?.node;
    if(!row)return {summaryText:possible.length?textOf(possible[0]).slice(0,260):'',point:null,debug};
    // Expand only within this one compact benefit. Never absorb the whole panel.
    for(let depth=0;depth<6&&row.parentElement;depth++) {
      const parent=row.parentElement,t=textOf(parent),r=parent.getBoundingClientRect();
      if(!shown(parent)||r.height>180||t.length>360||mixed(t)||(t.match(/카드\s*즉시할인/g)||[]).length!==1)break;
      row=parent;
    }
    const before=row.getBoundingClientRect();
    if(before.top<20||before.bottom>innerHeight-20) {
      row.scrollIntoView({block:'center',inline:'nearest'});
      await new Promise(resolve=>setTimeout(resolve,350));
    }
    const rowRect=row.getBoundingClientRect();
    const cardRects=phraseRects(row,/카드\s*즉시할인/),wowRects=phraseRects(row,/와우\s*전용/);
    const anchors=[...cardRects,...wowRects];
    debug.rowRect=box(rowRect);debug.cardTextRects=cardRects.map(box);debug.wowRects=wowRects.map(box);
    debug.scope='isolated-card-benefit-row';debug.reason='no-row-info-candidate';
    const selector='svg,i,button,a,[role="button"],[aria-label],[title],[data-tooltip],[class*="info"],[class*="tooltip"],[class*="icon"],[onclick]';
    const normalize=raw=>{
      const clickable=raw.closest('button,a,[role="button"],[onclick]');
      if(clickable&&row.contains(clickable)) {
        const r=clickable.getBoundingClientRect();if(r.width<=96&&r.height<=96)return clickable;
      }
      return raw;
    };
    const describe=raw=>{
      const target=normalize(raw);
      if(!row.contains(target)||!shown(target))return null;
      const rect=target.getBoundingClientRect(),tag=target.tagName.toLowerCase();
      const label=[target.getAttribute('aria-label'),target.getAttribute('title'),target.className?.baseVal||target.className,textOf(target)].filter(Boolean).join(' ');
      if(rect.width<4||rect.height<4||rect.width>96||rect.height>96||mixed(label)||/arrow|chevron|close|닫기|공유|좋아요|찜/i.test(label))return null;
      const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
      if(x<rowRect.left-8||x>rowRect.right+8||y<rowRect.top-8||y>rowRect.bottom+8)return null;
      const distance=Math.min(...anchors.map(a=>Math.hypot(Math.max(a.left-x,0,x-a.right),Math.max(a.top-y,0,y-a.bottom))));
      if(distance>240)return null;
      const explicit=/info|tooltip|help|안내|정보|상세|ⓘ/i.test(label)||/^[i?]$/i.test(textOf(target));
      const icon=explicit||['svg','i'].includes(tag)||Boolean(target.querySelector('svg,i'));
      return icon?{target,tag,label:label.slice(0,160),explicit,x,y,rect,distance}:null;
    };
    const raw=[...row.querySelectorAll(selector)];
    // Probe both sides and below every actual text fragment, but accept only
    // controls belonging to this row. Other benefits cannot supply a target.
    for(const a of anchors)for(const y of [(a.top+a.bottom)/2,a.bottom+12,a.bottom+32,a.bottom+64]) {
      for(const x of [a.left-96,a.left-48,a.left-16,a.right+8,a.right+24,a.right+64,a.right+128,a.right+224]) {
        if(x<rowRect.left-8||x>rowRect.right+8||y<rowRect.top-8||y>rowRect.bottom+8)continue;
        for(const n of document.elementsFromPoint(x,y)) {
          const target=n.closest(selector);if(target&&row.contains(target))raw.push(target);
        }
      }
    }
    const candidates=[];
    for(const node of raw) {
      const entry=describe(node);if(!entry||candidates.some(c=>c.target===entry.target))continue;
      candidates.push(entry);
    }
    // A nested SVG and its one clickable wrapper describe one control.
    const controls=candidates.filter(a=>!candidates.some(b=>b!==a&&b.target.contains(a.target)));
    const explicit=controls.filter(c=>c.explicit),choices=explicit.length?explicit:controls;
    debug.candidates=controls.slice(0,20).map(c=>({tag:c.tag,label:c.label,infoLike:true,explicitInfo:c.explicit,x:Math.round(c.x),y:Math.round(c.y),width:Math.round(c.rect.width),height:Math.round(c.rect.height),distance:Math.round(c.distance)}));
    if(choices.length!==1) {
      if(choices.length>1)debug.reason='ambiguous-row-info-candidates';
      return {summaryText:textOf(row),point:null,debug};
    }
    const hit=choices[0],point={x:Math.round(hit.x),y:Math.round(hit.y)};
    const front=document.elementsFromPoint(point.x,point.y)[0];
    const visibleHit=Boolean(front&&(front===hit.target||hit.target.contains(front)));
    if(!visibleHit){debug.reason='row-info-candidate-obscured';return {summaryText:textOf(row),point:null,debug};}
    debug.reason='selected';debug.selected=debug.candidates.find(c=>c.x===point.x&&c.y===point.y);
    return {summaryText:textOf(row),point,debug};
  }

  let cardDiscount=null;
  let cardRate=null;
  let cardMaxDiscount=null;
  let cardProviders=[];
  let cardBenefitText='';
  let cardBenefitStatus='none';
  let cardClickPoint=null;
  let cardClickDebug={summaryFound:false,reason:'card-summary-not-found',candidates:[]};
  if (preferred) {
    const mainPriceTop=positionedPrices.filter(entry=>entry.price===preferred.price)
      .reduce((top,entry)=>Math.min(top,entry.top),Infinity);
    const located=await locateCardBenefitControl(mainPriceTop);
    const summaryText=located.summaryText;
    const compact=node=>(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();
    cardClickDebug=located.debug;
    cardClickPoint=located.point;
    if(located.debug.summaryFound)cardBenefitStatus='partial';
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
  if (preferred) return {ok:true, price:preferred.price, basisPrice:strike?.price||null, priceBasisSource:strike?.selector||null, basisEvidence, strikePrice:strike?.price||null, strikeSelector:strike?.selector||null, priceBasisType:strike?.basisType||null, strikeReliable:Boolean(strike), strikeAnchorVerified:Boolean(strike), cardDiscount, cardRate, cardMaxDiscount, cardProviders, cardBenefitText, cardBenefitStatus, cardClickPoint, cardClickDebug, title:document.title, selector:preferred.source, candidates:candidates.slice(0,20)};
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
     if (rates.length!==1) continue;
    const providers=knownCards.filter(card=>text.includes(card));
     if (Number.isFinite(cap)||/(?:한도|제한)\s*(?:없음|없이|없|무제한)/.test(text)) rows.push({rate:rates[0],cap,providers});
  }
  if (!rows.length) {
    const cap=parseCap(detailText);
    const explicitlyUncapped=/(?:한도|제한)\s*(?:없음|없이|없|무제한)/.test(detailText);
    if (summaryRate&&(Number.isFinite(cap)||explicitlyUncapped)) rows.push({rate:summaryRate,cap,providers:knownCards.filter(card=>detailText.includes(card))});
  }
   const observedRates=[...new Set(parseRates(detailText))];
   const cardTerms=rows.filter(row=>row.providers.length||observedRates.length===1)
     .map(row=>({rate:row.rate,maxDiscount:Number.isFinite(row.cap)&&row.cap>0?row.cap:null,providers:row.providers.length?row.providers:summaryProviders}))
     .filter((term,index,all)=>term.providers.length&&all.findIndex(other=>other.rate===term.rate&&other.maxDiscount===term.maxDiscount&&JSON.stringify(other.providers)===JSON.stringify(term.providers))===index);
   if (!observedRates.length||observedRates.some(rate=>!cardTerms.some(term=>term.rate===rate))) {
     return {captured:false,reason:'card-popup-unparseable',cardBenefitText:[summaryText,detailText].filter(Boolean).join(' | ').slice(0,4000)};
   }
   const calculated=cardTerms.map(row=>({
    ...row,
     amount:Number.isFinite(row.maxDiscount)&&row.maxDiscount>0
       ? Math.min(Math.floor(preCardPrice*row.rate/100),row.maxDiscount)
      : Math.floor(preCardPrice*row.rate/100)
  })).filter(row=>row.amount>0&&row.amount<=preCardPrice).sort((a,b)=>b.amount-a.amount);
  const best=calculated[0];
  if (!best) return {captured:false,reason:'card-popup-unparseable',cardBenefitText:[summaryText,detailText].filter(Boolean).join(' | ').slice(0,4000)};
  return {
    captured:true,
    cardBenefitStatus:'captured',
    cardBenefitText:[summaryText,detailText].filter(Boolean).join(' | ').slice(0,4000),
    cardRate:best.rate,
     cardMaxDiscount:best.maxDiscount,
     cardTerms,
    cardDiscount:best.amount,
     cardProviders:best.providers
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
    if(/https?:\/\/|^(?:blob:|data:)|[{}]|\b(?:width|height|table-layout|font-size|display|position)\s*:/i.test(compact))return;
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
    // layout.text contains rendered text; nodeValue/attributes/the global string
    // table also contain script bodies, CSS declarations and tracking URLs.
    addRelevantWithNeighbors(document?.layout?.text||[]);
  }
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
    if(/https?:\/\/|^(?:blob:|data:)|[{}]|\b(?:width|height|table-layout|font-size|display|position)\s*:/i.test(compact))return;
    if (compact.length>1200||seen.has(compact)) return;
    seen.add(compact);
    values.push(compact);
  };
  for (const node of nodes.filter(node=>!node.ignored)) for (const value of ownText(node)) add(value);
  for (const node of nodes) {
    const text=ownText(node).join(' | ');
    if (!/(?:카드\s*혜택|카드\s*즉시할인|할인한도|할인금액)/.test(text)) continue;
    if(node.ignored)continue;
    const related=[node,byId.get(node.parentId),...(node.childIds||[]).map(id=>byId.get(id))].filter(node=>node&&!node.ignored);
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
    const tree=await withScanTimeout(chrome.debugger.sendCommand(target,'Accessibility.getFullAXTree',{}),15000,'card-accessibility');
    result.accessibility=accessibilityStrings(tree);
    result.status.accessibility=result.accessibility.length?'captured':'empty';
  } catch (error) {
    result.status.accessibility='error';
    result.errors.accessibility=String(error).slice(0,500);
  }
  try {
    const snapshot=await withScanTimeout(chrome.debugger.sendCommand(target,'DOMSnapshot.captureSnapshot',{
      computedStyles:[],includeDOMRects:false,includePaintOrder:false
    }),15000,'card-dom-snapshot');
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
    await withScanTimeout(chrome.debugger.attach(target,'1.3'),15000,'card-debugger-attach');
    attached=true;
    await withScanTimeout(chrome.debugger.sendCommand(target,'Page.bringToFront'),15000,'card-bring-to-front');
    await withScanTimeout(chrome.debugger.sendCommand(target,'Accessibility.enable'),15000,'card-accessibility-enable').catch(()=>{});
    const before=await captureDebuggerText(target);
    await withScanTimeout(chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y}),15000,'card-mouse-move');
    await withScanTimeout(chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1}),15000,'card-mouse-press');
    await withScanTimeout(chrome.debugger.sendCommand(target,'Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1}),15000,'card-mouse-release');
    await wait(1200);
    const after=await captureDebuggerText(target);
    return {ok:true,before,after};
  } catch (error) {
    return {ok:false,reason:String(error)};
  } finally {
    if (attached) await withScanTimeout(chrome.debugger.detach(target),15000,'card-debugger-detach').catch(()=>{});
  }
}

function parseDebuggerCardEvidence(preCardPrice,summaryText,summaryProviders,capture) {
  const cleanValues=values=>(values||[]).filter(value=>typeof value==='string'&&!/https?:\/\/|^(?:blob:|data:)|[{}]|\b(?:width|height|table-layout|font-size|display|position)\s*:/i.test(value));
  const parseRates=text=>[...text.matchAll(/(?:최대\s*)?([0-9]+(?:\.[0-9]+)?)\s*%/g)].map(match=>Number(match[1])).filter(rate=>rate>0&&rate<=100);
  const expectedRate=parseRates(summaryText)[0]||null;
  const relevantNew=(afterValues,beforeValues)=>{
    const before=new Set(beforeValues||[]);
    return cleanValues(afterValues)
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
    ['accessibility',cleanValues(capture?.after?.accessibility),cleanValues(capture?.before?.accessibility)],
    ['dom-snapshot',cleanValues(capture?.after?.domSnapshot),cleanValues(capture?.before?.domSnapshot)]
  ]) {
    const before=new Set(beforeValues);
    // Anchor on the newly opened instant-discount section, not page-wide
    // neighbors (coupon amounts, rewards and annual fees are unrelated).
    const opened=afterValues.filter(value=>!before.has(value));
    for (let index=0;index<opened.length;index++) {
      if (!/^카드\s*즉시할인$/.test(opened[index])) continue;
      const section=[];
      for (let next=index+1;next<opened.length;next++) {
        const value=opened[next];
        if (/와우카드\s*혜택\s*자세히|카드사\s*및\s*당사|카드\s*즉시할인의\s*적용|유의사항|연회비|추천이런건|쿠팡상품번호/.test(value)) break;
        if (/적립|캐시|캐시백|연회비|결제금액|판매가/.test(value)) continue;
        section.push(value);
      }
      const text=['카드즉시할인',...section].join(' | ');
      const rates=[...new Set(parseRates(text))],caps=parseCaps(text);
      const providers=knownCards.filter(card=>text.includes(card)&&summaryProviders.includes(card));
      const explicitlyUncapped=/(?:한도|제한)\s*(?:없음|없이|없|무제한)/.test(text);
      cardDebug.scopedConditions ||= [];
      cardDebug.scopedConditions.push({source,rates,caps,providers,text:text.slice(0,1600)});
      // The fallback confirms one common condition; complete per-card DOM
      // terms handle multiple alternatives without picking a representative.
      if (rates.length!==1||rates[0]!==expectedRate||caps.length>1) {
        return {captured:false,reason:'debugger-card-terms-ambiguous',cardDebug};
      }
      if (!caps.length&&!explicitlyUncapped) continue;
      const cap=caps.length?caps[0]:null;
      const amount=Number.isFinite(cap)?Math.min(Math.floor(preCardPrice*expectedRate/100),cap):Math.floor(preCardPrice*expectedRate/100);
      candidates.push({source,rate:expectedRate,cap,amount,providers,text});
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
  const providers=best.providers.length?best.providers:summaryProviders;
  // A debugger fallback may confirm a single shared rate/cap, never select a
  // representative option from multiple rates or limits it cannot attribute.
  const rates=[...new Set(parseRates(best.text))];
  const distinctCaps=[...new Set(candidates.map(candidate=>candidate.cap))];
  if(rates.length!==1||rates[0]!==best.rate||distinctCaps.length!==1||!providers?.length) {
    return {captured:false,reason:'debugger-card-terms-ambiguous',cardDebug};
  }
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
    cardProviders:providers,
    cardTerms:[{rate:best.rate,maxDiscount:Number.isFinite(best.cap)?best.cap:null,providers}]
  };
}

async function scanCoupangTab(tabId,target) {
  const viewport=/Whale\//.test(globalThis.navigator?.userAgent||'')?await ensureWhaleTabViewport(tabId):null;
  const injected=await chrome.scripting.executeScript({
    target:{tabId},func:readDisplayedPrice,args:[target.productId,target.itemId,target.vendorItemId,target.srp]
  });
  const scan=injected?.[0]?.result;
  if (!scan||typeof scan!=='object') throw new Error('scan-script-no-result');
  if(viewport)scan.viewport=viewport;
  if(accessDiagnosticTabs.has(tabId))scan.accessDiagnostic=await captureAccessDiagnostic(tabId);
  classifyAccessFailure(scan);
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
    await withTabEditRetry(()=>chrome.tabs.update(tabId,{url:beforeUrl}));
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
     if (same) Object.assign(scan,card,{cardInteractionStatus:'captured',cardEvidenceSource:`dom+${debuggerCard.cardEvidenceSource}`});
     else if (card.cardTerms.length>1) Object.assign(scan,card,{cardInteractionStatus:'captured',cardEvidenceSource:'dom'});
     else scan.cardInteractionStatus='card-evidence-conflict';
   } else if (card?.reason==='card-popup-unparseable') scan.cardInteractionStatus=card.reason;
   else if (debuggerCard?.captured) Object.assign(scan,debuggerCard);
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
  const identity=String(expectedMtm).toUpperCase();
  const titles=[document.querySelector('h1,h2,h3')?.textContent,document.title].filter(Boolean);
  const title=String(titles.find(t=>t.toUpperCase().includes(identity))||titles[0]||'').trim();
  const excluded=/해외\s*(?:구매|직구|배송)|구매\s*대행|현금(?!\s*영수증)|무통장\s*입금|계좌\s*이체/i;
  if (excluded.test(title)) return {ok:false,reason:'excluded-product-or-payment',sellers:[],title};
  if (!title.toUpperCase().includes(identity)) return {ok:false,reason:'mtm-mismatch',sellers:[],title};
  const heading=[...document.querySelectorAll('h2,h3,h4,div,strong')].find(n=>n.textContent?.trim()==='쇼핑몰별 최저가');
  const root=heading?.parentElement?.parentElement;
  if(!root||root===document.body) return {ok:false,reason:'seller-section-not-found',sellers:[],title};
  const sellers=[];

  const delivery = label => {
    if (/착불|조건부|배송비\s*(?:별도|미정)|배송료\s*별도/.test(label)) return null;
    if (/무료\s*배송|배송비\s*무료/.test(label)) return 0;
    const explicit=label.match(/배송(?:비|료)\s*[:：]?\s*([\d,]+)\s*원/);
    if(explicit) return Number(explicit[1].replace(/,/g,''));
    const small=[...label.matchAll(/([\d,]+)\s*원/g)]
      .map(m=>Number(m[1].replace(/,/g,''))).filter(n=>n>0&&n<=10000);
    return small.length===1?small[0]:null;
  };

  for(const row of root.querySelectorAll('tr')) {
    const label=(row.innerText||'').replace(/\s+/g,' ').trim();
    if(!label||label.length>850||excluded.test(label)||/이런 상품|추천상품|관심상품|광고/.test(label)) continue;
    if(row.closest?.('[class*="recommend"],[class*="related"],[class*="ad_"],[class*="banner"]')) continue;
    const logo=[...row.querySelectorAll('img[alt]')].find(img=>{
      const alt=(img.getAttribute('alt')||'').trim();
      return alt&&alt.length<=40&&!/광고|로딩|상품|이미지|다나와|노트북|맥북|SSD|GB|삼성 NT|레노버|애플/i.test(alt);
    });
    const seller=(logo?.getAttribute('alt')||'').replace(/\s로고$/,'').trim();
    if(!seller) continue;
    const priceNode=row.querySelector?.('.price a,.price_sect a,.price,.prc_t');
    const amount=(priceNode?.innerText||label).match(/([0-9][0-9,]{3,})\s*원/);
    if(!amount) continue;
    const price=Number(amount[1].replace(/,/g,'')),shipping=delivery(label);
    if(price<minimumPrice||price>7000000||shipping===null||shipping>100000) continue;
    if(!sellers.some(x=>x.seller===seller&&x.price===price&&x.shipping===shipping))
      sellers.push({seller,price,shipping,shippingStatus:'verified',sellerRowVerified:true,matchedMtm:expectedMtm,productTitle:title,label:label.slice(0,850)});
  }
  return {ok:sellers.length>0,reason:sellers.length?'ok':'verified-listings-not-found',sellers:sellers.slice(0,30),title};
}

// Inspect visible listing rows only. A search result, points-adjusted headline
// or entire-page price never qualifies as evidence for an individual seller.
function readEnuriSellers(expectedBrand,expectedMtm,expectedSrp) {
  const title=document.querySelector('h1')?.textContent?.trim()||document.title||'';
  const bodyText=document.body?.innerText||'';
  const excluded=/해외\s*(?:구매|직구|배송)|구매\s*대행|현금(?!\s*영수증)|무통장\s*입금|계좌\s*이체/i;
  if(/captcha|접근이 제한|비정상적인 접근|로봇이 아닙니다/i.test(bodyText.slice(0,2000)))
    return {ok:false,reason:'access-check',title,sellers:[]};
  const mtm=String(expectedMtm).toLowerCase();
  if(!title.toLowerCase().includes(mtm) || excluded.test(title))
    return {ok:false,reason:'product-mismatch-or-excluded',title,sellers:[]};
  const minimum=Number(expectedSrp)>0&&Number(expectedSrp)<250000?10000:250000;

  const delivery = label => {
    if (/착불|조건부|배송비\s*(?:별도|미정)|배송료\s*별도/.test(label)) return null;
    if (/무료\s*배송|배송비\s*무료/.test(label)) return 0;
    const explicit=label.match(/배송(?:비|료)\s*[:：]?\s*([\d,]+)\s*원/);
    if(explicit) return Number(explicit[1].replace(/,/g,''));
    const small=[...label.matchAll(/([\d,]+)\s*원/g)]
      .map(m=>Number(m[1].replace(/,/g,''))).filter(n=>n>0&&n<=10000);
    return small.length===1?small[0]:null;
  };
  const sellers=[];
  const candidates=[...document.querySelectorAll('tr')];
  for(const node of candidates) {
    const label=(node.innerText||'').replace(/\s+/g,' ').trim();
    if(!label || label.length>850 || excluded.test(label)) continue;
    const productImage=[...node.querySelectorAll('img[alt]')]
      .find(img=>img.alt?.toLowerCase().includes(mtm) &&
        (img.alt.toLowerCase().includes(String(expectedBrand).toLowerCase()) ||
         label.toLowerCase().includes(String(expectedBrand).toLowerCase())));
    const productTitle=productImage?.alt?.trim()||'';
    if(!productTitle || !label.toLowerCase().includes(mtm)) continue;
    const logo=[...node.querySelectorAll('img[alt]')].find(img=>/\s로고$/.test(img.alt||''));
    const seller=(logo?.alt||'').replace(/\s로고$/,'').trim() ||
      node.querySelector('[class*="mall"],[class*="seller"],[class*="store"]')?.textContent?.trim()||'';
    if(!seller || seller.length>60 || excluded.test(seller)) continue;
    // The amount must be a visible sale price in this individual listing.
    // Membership rewards, card rates and coupon headlines are not deducted.
    const priceMatches=[...label.matchAll(/([0-9][0-9,]{3,})\s*원/g)]
      .map(match=>Number(match[1].replace(/,/g,'')))
      .filter(price=>price>=minimum&&price<=7000000);
    if(!priceMatches.length) continue;
    const price=priceMatches[0];
    const shipping=delivery(label);
    if(shipping===null||shipping>100000) continue;
    if(!sellers.some(row=>row.seller===seller&&row.price===price&&row.shipping===shipping))
      sellers.push({seller,price,shipping,shippingStatus:'verified',sellerRowVerified:true,matchedMtm:expectedMtm,label:label.slice(0,850),productTitle});
  }
  return {ok:sellers.length>0,reason:sellers.length?'ok':'verified-listings-not-found',title,sellers:sellers.slice(0,30)};
}

async function scanAll(scanSlot, recovery=null, primaryRequestId=null) {
  const lock = await chrome.storage.local.get('running');
  // An active scan in this worker is guarded synchronously by requestScan.
  // A persisted lock without an active promise belongs to a terminated worker.
  if(lock.running) await chrome.storage.local.set({running:false,runningStartedAt:null,lastScanError:'scan-interrupted-by-worker-restart',lastScanErrorAt:new Date().toISOString()});
  await chrome.storage.local.set({running:true,runningStartedAt:Date.now(),scanProgress:null,lastScanError:null});
  const saveRecovery=(await chrome.storage.local.get('scanSaveRecovery')).scanSaveRecovery;
  const recoveryDeadline=!recovery&&saveRecovery?.scanSlot===scanSlot&&saveRecovery.chromeRetries===1&&['chrome-retry-queued','chrome-retry-running'].includes(saveRecovery.stage)?Date.parse(saveRecovery.deadlineAt):Infinity;
  const checkRecoveryBudget=()=>{if(Date.now()>=recoveryDeadline)throw Error('scan-save-recovery-budget-exhausted');};
  if(!recovery&&saveRecovery?.scanSlot===scanSlot&&saveRecovery.stage==='chrome-retry-queued')await chrome.storage.local.set({scanSaveRecovery:{...saveRecovery,stage:'chrome-retry-running'}});
  const scanStartedAt = new Date().toISOString();
  const runId=recovery?.runId||crypto.randomUUID().replaceAll('-','');
  const results = [];
  const scanWindowState={windowId:null,anchorTabIds:[]};
  const progress=async (mtm,stage,total)=>{
    await withScanTimeout(chrome.storage.local.set({scanProgress:{mtm,stage,completed:results.length,total,startedAt:scanStartedAt,updatedAt:new Date().toISOString()}}),10000,'scan-progress').catch(()=>{});
  };
  const closeChildTabs = async (openerTabId) => {
    const childIds=(await chrome.tabs.query({}))
      .filter(candidate=>candidate.openerTabId===openerTabId)
      .map(candidate=>candidate.id)
      .filter(Number.isInteger);
    if (childIds.length) await chrome.tabs.remove(childIds).catch(()=>{});
  };
  try {
    const configuredTargets=await withScanTimeout(getTargets(),15000,'scan-targets');
    const catalogErrors=validateProductCatalog(configuredTargets);
    if(catalogErrors.length) throw new Error(`product-catalog-invalid:${catalogErrors.join(',')}`);
    const targets=configuredTargets.filter(x=>x.enabled!==false).map(product=>Object.fromEntries(Object.entries(product).filter(([key])=>!['skuid','productcode','상품코드'].includes(key.replace(/[\s_]/g,'').toLowerCase()))));
    // A start witness contains the pinned catalogue, never partial prices or SKUIDs.
    // Download completion precedes the first product so the Windows watchdog can
    // distinguish a started collection from an absent/disabled extension.
    if((!isEdgeBrowser&&!/Whale\//.test(globalThis.navigator?.userAgent||'')&&scanSlot)||primaryRequestId) {
      const witness={version:1,browser:primaryRequestId?'whale':'chrome',primaryRequestId,extensionVersion:chrome.runtime.getManifest().version,
        runId,scanSlot,startedAt:scanStartedAt,targetCount:targets.length,targets};
      const witnessUrl='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(witness));
      const witnessDownload=await withScanTimeout(chrome.downloads.download({url:witnessUrl,
        filename:primaryRequestId?'MarketPulse/whale-scan-start.json':'MarketPulse/scan-start.json',conflictAction:'overwrite',saveAs:false}),30000,'scan-start-witness');
      await waitForScanDownload(witnessDownload,primaryRequestId?'MarketPulse/whale-scan-start.json':'MarketPulse/scan-start.json');
    }
    for (const target of targets) {
      checkRecoveryBudget();
      let tab;
      await progress(target.mtm,'coupang-load',targets.length);
      try {
        tab = await openScanTab(target.url,`coupang-open:${target.mtm}`,scanWindowState);
        await withScanTimeout(waitForComplete(tab.id),60000,`coupang-load:${target.mtm}`);
        await wait(7000);
        await progress(target.mtm,'coupang-price',targets.length);
        const priceScan=await withScanTimeout(scanCoupangTab(tab.id,target),90000,`coupang-price:${target.mtm}`);
        const result={...target, ...priceScan, checkedAt:new Date().toISOString()};
        if(priceScan.accessDiagnostic){result.accessDiagnostics=[{phase:'initial',reason:priceScan.reason||'ok',diagnostic:priceScan.accessDiagnostic}];delete result.accessDiagnostic;}
        if(priceScan?.ok) {
          try {
            await progress(target.mtm,'checkout',targets.length);
            Object.assign(result,await withScanTimeout(collectCheckoutDiscountsForTarget(target,scanWindowState),90000,`checkout:${target.mtm}`));
          } catch(error) {
            Object.assign(result,{checkoutDiscountStatus:'missing',checkoutDiscountReason:String(error),checkoutCouponDiscount:null,checkoutCouponSource:null,wowInstantDiscount:null,wowCouponDiscount:null});
          }
        }
        result.competitorPages=[];
        const pages=[
          {source:'다나와',url:target.danawaUrl,host:'prod.danawa.com'},
          {source:'에누리',url:target.enuriUrl,host:'price.enuri.com'}
        ];
        for(const page of pages) {
          if(!page.url) continue;
          let externalTab;
          try {
            await progress(target.mtm,`competitor-${page.source}`,targets.length);
            const parsed=new URL(page.url);
            if(parsed.protocol!=='https:'||parsed.hostname!==page.host) throw new Error('unsupported-competitor-url');
            externalTab=await withScanTimeout(withTabEditRetry(()=>chrome.tabs.create({url:page.url,active:true})),15000,`competitor-open:${target.mtm}`);
            await withScanTimeout(waitForComplete(externalTab.id),60000,`competitor-load:${target.mtm}`);
            await wait(6000);
            const scan=await withScanTimeout(chrome.scripting.executeScript({target:{tabId:externalTab.id},func:page.source==='다나와'?readDanawaSellers:readEnuriSellers,args:page.source==='다나와'?[target.mtm,target.srp]:[target.brand,target.mtm,target.srp]}),30000,`competitor-read:${target.mtm}`);
            result.competitorPages.push({source:page.source,url:page.url,title:scan[0].result.title||'',reason:scan[0].result.reason,sellers:scan[0].result.sellers||[]});
          } catch(error) {
            result.competitorPages.push({source:page.source,url:page.url,reason:String(error),sellers:[]});
          } finally {
            if(externalTab?.id) await withScanTimeout(chrome.tabs.remove(externalTab.id),15000,`competitor-close:${target.mtm}`).catch(()=>{});
          }
        }
        results.push(result);
      } catch (error) {
        const failed={...target,ok:false,reason:String(error),checkedAt:new Date().toISOString()};
        if(tab?.id&&accessDiagnosticTabs.has(tab.id))failed.accessDiagnostics=[{phase:'initial',reason:'browser-error',diagnostic:await captureAccessDiagnostic(tab.id)}];
        results.push(failed);
      } finally {
        if (tab?.id) accessDiagnosticTabs.delete(tab.id);
        if (tab?.id) await withScanTimeout(closeChildTabs(tab.id),15000,`child-close:${target.mtm}`).catch(()=>{});
        if (tab?.id) await withScanTimeout(chrome.tabs.remove(tab.id),15000,`coupang-close:${target.mtm}`).catch(()=>{});
      }
      await progress(target.mtm,'completed',targets.length);
      // A slower cadence reduces Coupang's temporary access-check response.
      await wait(20000);
    }
    // Retry blocked pages after the full pass. Processing the other targets
    // creates cooldown time without a long idle timer that Chrome may stop.
    for (const result of results.filter(x=>!x.ok && x.reason==='access-check')) {
      checkRecoveryBudget();
      let retryTab;
      try {
        await progress(result.mtm,'coupang-retry',targets.length);
        retryTab=await openScanTab(result.url,`retry-open:${result.mtm}`,scanWindowState);
        await withScanTimeout(waitForComplete(retryTab.id),60000,`retry-load:${result.mtm}`);
        await wait(10000);
        const retryScan=await withScanTimeout(scanCoupangTab(retryTab.id,result),90000,`retry-price:${result.mtm}`);
         const attempts=[...(result.accessDiagnostics||[])];
         if(retryScan?.accessDiagnostic)attempts.push({phase:'retry',reason:retryScan.reason||'ok',diagnostic:retryScan.accessDiagnostic});
         result.retryStatus=retryScan?.ok?'recovered':retryScan?.reason==='access-check'?'access-check':'other-failure';
         result.retryCheckedAt=new Date().toISOString();
         if (retryScan?.ok) {
           Object.assign(result,retryScan,{checkedAt:new Date().toISOString(),retried:true});
           delete result.reason;
           delete result.accessCheckDetail;
         } else if (retryScan?.reason==='access-check') {
           result.accessCheckDetail=retryScan.accessCheckDetail||result.accessCheckDetail;
         }
         if(attempts.length)result.accessDiagnostics=attempts.slice(-2);
         delete result.accessDiagnostic;
         if (retryScan?.ok) {
           Object.assign(result,await withScanTimeout(collectCheckoutDiscountsForTarget(result,scanWindowState),90000,`retry-checkout:${result.mtm}`));
         }
       } catch (error) {
         if(retryTab?.id&&accessDiagnosticTabs.has(retryTab.id))result.accessDiagnostics=[...(result.accessDiagnostics||[]),{phase:'retry',reason:'browser-error',diagnostic:await captureAccessDiagnostic(retryTab.id)}].slice(-2);
         result.retryStatus='browser-error';
         result.retryCheckedAt=new Date().toISOString();
         result.retryError=error?.name||'unknown';
      } finally {
        if (retryTab?.id) accessDiagnosticTabs.delete(retryTab.id);
        if (retryTab?.id) await withScanTimeout(closeChildTabs(retryTab.id),15000,`retry-child-close:${result.mtm}`).catch(()=>{});
        if (retryTab?.id) await withScanTimeout(chrome.tabs.remove(retryTab.id),15000,`retry-close:${result.mtm}`).catch(()=>{});
      }
      await wait(20000);
    }
    const completedAt=new Date().toISOString();
    const itemIds=results.map(result=>String(result.itemId||''));
    const payload = {
      version:5,
      extensionVersion:chrome.runtime.getManifest().version,
      browser:/Whale\//.test(navigator.userAgent)?'whale':/Edg\//.test(navigator.userAgent)?'edge':'chrome',
      scanSlot,
      runId,
      recovery,
      primaryRequestId,
      startedAt:scanStartedAt,
      scannedAt:completedAt,
      completedAt,
      targetCount:targets.length,
      resultCount:results.length,
      complete:results.length===targets.length&&new Set(itemIds).size===targets.length,
      results
    };
    payload.diagnosticArchiveStatus=await saveAccessDiagnosticArchive(payload);
    await progress(null,'download',targets.length);
    await saveCompletedScan(payload);
    await chrome.storage.local.set({
      lastRunDay:localDay(),
      lastRunSlot:scanSlot,
      lastResult:payload,
      scanProgress:{mtm:null,stage:'complete',completed:targets.length,total:targets.length,startedAt:scanStartedAt,updatedAt:new Date().toISOString()}
    });
  } catch(error) {
    await chrome.storage.local.set({lastScanError:String(error),lastScanErrorAt:new Date().toISOString()});
    throw error;
  } finally {
    for(const anchorId of scanWindowState.anchorTabIds) {
      await chrome.tabs.remove(anchorId).catch(()=>{});
    }
    await chrome.storage.local.set({running:false,runningStartedAt:null});
  }
}

const SCHEDULED_SCAN_TIMES = [
  {alarm:'daily-scan-0800',hour:8,minute:0,slot:'08:00'},
  {alarm:'daily-scan-1200',hour:12,minute:0,slot:'12:00'},
  {alarm:'daily-scan-1600',hour:16,minute:0,slot:'16:00'},
  {alarm:'daily-scan-2000',hour:20,minute:0,slot:'20:00'}
];
const isEdgeBrowser=/Edg\//.test(navigator.userAgent);

// First production noon is 2026-10-21. Whale is launched by Windows with a pinned catalog.
function kstDateTimeParts(date=new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Seoul',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
  }).formatToParts(date).map(part=>[part.type,part.value]));
}

function chromeOwnsSlot(slot) {return !(slot?.slice(0,10)>='2026-10-21'&&slot.endsWith('T12:00+09:00'));}

function currentScheduledScanSlot(date=new Date()) {
  const p=kstDateTimeParts(date);
  const minuteOfDay=(+p.hour*60)+(+p.minute);
  const due=[...SCHEDULED_SCAN_TIMES].reverse().find(entry=>minuteOfDay>=(entry.hour*60+entry.minute));
  return due ? `${p.year}-${p.month}-${p.day}T${due.slot}+09:00` : null;
}

async function scheduleEntry(entry) {
  const now=new Date();
  const p=kstDateTimeParts(now);
  await chrome.alarms.clear(entry.alarm);
  let next=Date.parse(`${p.year}-${p.month}-${p.day}T${String(entry.hour).padStart(2,'0')}:${String(entry.minute).padStart(2,'0')}:00+09:00`);
  if(next<=now.getTime()) next+=86400000;
  if(!chromeOwnsSlot(new Date(next).toISOString().slice(0,10)+'T'+entry.slot+'+09:00'))return;
  await chrome.alarms.create(entry.alarm,{when:next});
}

async function schedule() {
  await chrome.alarms.clear('daily-scan-1400');
  for(const entry of SCHEDULED_SCAN_TIMES) await scheduleEntry(entry);
}

function recentScanSlot(slot,now=Date.now()) {
  if(!slot) return false;
  const due=Date.parse(slot);
  return Number.isFinite(due)&&now>=due&&now-due<=75*60*1000;
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

async function collectCheckoutDiscountsForTarget(target,windowState=null) {
  const ownsWindow=!windowState&&/Whale\//.test(navigator.userAgent);
  windowState=windowState||{windowId:null,anchorTabIds:[]};
  let tab,checkoutTab,entryButtonEvidence=null,childTabCount=0,checkoutViewport=null;
  const route=source=>{
    try { const url=new URL(source||''); return {host:url.hostname,path:url.pathname.slice(0,120)}; }
    catch (_) { return {host:null,path:null}; }
  };
  const checkoutTabEvidence=(page)=>({
    checkoutPageHost:page?.host||route(checkoutTab?.url).host,
    checkoutPagePath:page?.path||route(checkoutTab?.url).path,
    checkoutTabKind:checkoutTab?.id!==tab?.id?'opened-child':'original',
    checkoutChildTabCount:childTabCount,
    checkoutEntryButtonEvidence:entryButtonEvidence,checkoutViewport
  });
  try {
    // Coupang's buy-now flow can depend on a foreground tab and can open a
    // child tab. The product and checkout pages are both read in Chrome.
    if(/Whale\//.test(globalThis.navigator?.userAgent||''))await prepareWhaleScanWindow(windowState);
    tab=await withScanTimeout(withTabEditRetry(()=>chrome.tabs.create({url:target.url,active:true,...(Number.isInteger(windowState.windowId)?{windowId:windowState.windowId}:{})})),15000,`checkout-open:${target.mtm}`);
    checkoutTab=tab;
    await withScanTimeout(waitForComplete(tab.id),60000,`checkout-load:${target.mtm}`);
    await wait(7000);
    if(/Whale\//.test(globalThis.navigator?.userAgent||''))await ensureWhaleTabViewport(tab.id);
    const entered=await withScanTimeout(chrome.scripting.executeScript({
      target:{tabId:tab.id},func:enterCheckoutDiagnostic,args:[target.productId,target.itemId,target.vendorItemId]
    }),30000,`checkout-entry:${target.mtm}`);
    entryButtonEvidence=entered?.[0]?.result?.buttonEvidence||null;
    if(!entered?.[0]?.result?.ok) {
      const reason=entered?.[0]?.result?.reason||'checkout-entry-failed';
      return {
        checkoutDiscountStatus:'missing',checkoutDiscountReason:reason,
        checkoutCouponDiscount:null,checkoutCouponSource:null,
        wowInstantDiscount:null,wowCouponDiscount:null,
        ...checkoutTabEvidence()
      };
    }
    for(let i=0;i<30;i++){
      await wait(500);
      const current=await withScanTimeout(chrome.tabs.get(tab.id),15000,`checkout-tab:${target.mtm}`);
      checkoutTab=current;
      // openerTabId belongs to the returned Tab, not the tabs.query filter.
      // Query all tabs and filter locally; tolerate a transient tab query error
      // so the original tab can still be read if it reached checkout.
      const allTabs=await withScanTimeout(Promise.resolve().then(()=>chrome.tabs.query({})),15000,`checkout-children:${target.mtm}`).catch(()=>[]);
      const children=allTabs.filter(candidate=>candidate.openerTabId===tab.id);
      childTabCount=Math.max(childTabCount,children.length);
      const child=children.find(candidate=>{
        const {host,path}=route(candidate.url);
        return candidate.status==='complete'
          && ['www.coupang.com','order.coupang.com','checkout.coupang.com'].includes(host)
          && path&&!path.startsWith('/vp/products/');
      });
      if(child){ checkoutTab=child; break; }
      if(current.status==='complete'&&!String(current.url||'').includes('/vp/products/')) break;
    }
    await wait(4000);
    let page,confirmedPage,reconciled;
    let regular=null,instant=null,coupon=null,wowMemberTotal=null;
    let regularStatus='missing',instantStatus='missing',couponStatus='missing';
    for(let attempt=0;attempt<4;attempt++){
      if(/Whale\//.test(globalThis.navigator?.userAgent||''))checkoutViewport=await ensureWhaleTabViewport(checkoutTab.id);
      const read=await withScanTimeout(chrome.scripting.executeScript({target:{tabId:checkoutTab.id},func:readCheckoutDiscounts}),15000,`checkout-read:${target.mtm}`);
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
        wowInstantDiscount:null,wowCouponDiscount:null,checkoutDiscountEvidence:page?.discountEvidence||[],
        ...checkoutTabEvidence(page)
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
      checkoutWowMemberTotal:wowMemberTotal,
      checkoutDiscountCapturedAt:page.capturedAt,checkoutInferredZeroFields:reconciled.inferredZeroFields,
      checkoutDiscountEvidence:page.discountEvidence||[],checkoutViewport
    };
  } catch(error) {
    return {
      checkoutDiscountStatus:'missing',checkoutDiscountReason:String(error),
      checkoutCouponDiscount:null,checkoutCouponSource:null,
      wowInstantDiscount:null,wowCouponDiscount:null,
      ...checkoutTabEvidence()
    };
  } finally {
    if(ownsWindow)for(const id of windowState.anchorTabIds)await chrome.tabs.remove(id).catch(()=>{});
    if(checkoutTab?.id&&checkoutTab.id!==tab?.id) await withScanTimeout(chrome.tabs.remove(checkoutTab.id),15000,`checkout-child-close:${target.mtm}`).catch(()=>{});
    if(tab?.id) await withScanTimeout(chrome.tabs.remove(tab.id),15000,`checkout-close:${target.mtm}`).catch(()=>{});
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
    const checkout=await collectCheckoutDiscountsForTarget(target);
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

let activeScanPromise=null;
let activeScanSlot=null;
let pendingScanSlot=null;
let queuedSaveRetry=null;

function requestScan(slot=currentScheduledScanSlot(), recovery=null, primaryRequestId=null) {
  if(activeScanPromise) {
    if(slot&&slot!==activeScanSlot) pendingScanSlot=slot;
    return false;
  }
  activeScanSlot=slot;
  activeScanPromise=scanAll(slot,recovery,primaryRequestId);
  activeScanPromise.then(finishScan,finishScan);
  return true;
}

function finishScan() {
  activeScanPromise=null;
  activeScanSlot=null;
  const pending=pendingScanSlot;
  pendingScanSlot=null;
  const saveRetry=queuedSaveRetry;
  queuedSaveRetry=null;
  if(recentScanSlot(pending)&&pending===currentScheduledScanSlot()) requestScan(pending);
  else if(saveRetry?.slot===currentScheduledScanSlot()&&Date.now()<Date.parse(saveRetry.deadlineAt))requestScan(saveRetry.slot,null,saveRetry.primaryRequestId);
}

const SUPPLIER_EXTENSION_ID='djmlkkflbncanonpjhkdhghjmcompjnp';
async function acknowledgeRecoveredMorning(message,sender) {
  if(isEdgeBrowser||/Whale\//.test(globalThis.navigator?.userAgent||'')||sender.id!==SUPPLIER_EXTENSION_ID||!sender.url?.startsWith(`chrome-extension://${SUPPLIER_EXTENSION_ID}/daily-resume.html?`)||
    message?.type!=='MARK_MORNING_RECOVERED'||message.source!=='edge'||message.version!==2||
    !/^[a-f0-9]{32}$/.test(message.runId||'')||message.scanSlot!==`${localDay()}T08:00+09:00`||
    !Number.isFinite(Date.parse(message.completedAt))||Date.parse(message.completedAt)<Date.parse(message.scanSlot)||Date.parse(message.completedAt)>Date.now()+60000) return {ok:false,reason:'invalid-recovery-acknowledgement'};
  if(activeScanPromise)return {ok:false,reason:'price-scan-active'};
  await chrome.storage.local.set({lastRunSlot:message.scanSlot,lastRunDay:localDay(),morningRecoveryAcknowledgement:{runId:message.runId,scanSlot:message.scanSlot,completedAt:message.completedAt}});
  return {ok:true};
}
chrome.runtime.onMessageExternal.addListener((message,sender,reply)=>{
  acknowledgeRecoveredMorning(message,sender).then(reply).catch(()=>reply({ok:false,reason:'recovery-acknowledgement-error'}));return true;
});
async function waitForSupplierResume(slot) {
  if(!slot?.endsWith('T08:00+09:00'))return;
  let pending=false;
  // Chrome may emit startup before its requested internal tab is registered.
  for(let i=0;i<3;i++) {
    const tabs=await chrome.tabs.query({});
    pending=tabs.some(tab=>{
      try {const u=new URL(tab.pendingUrl||tab.url);return u.hostname===SUPPLIER_EXTENSION_ID&&u.pathname==='/daily-resume.html'&&u.searchParams.get('slot')===slot;}catch{return false;}
    });
    if(pending)break;
    if(i<2)await wait(500);
  }
  if(!pending)return;
  for(let i=0;i<40;i++) {
    if((await chrome.storage.local.get('lastRunSlot')).lastRunSlot===slot)return;
    await wait(500);
  }
}

chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.storage.local.set({running:false,runningStartedAt:null});
  if(isEdgeBrowser||/Whale\//.test(globalThis.navigator?.userAgent||'')) {
    for(const name of ['daily-scan-1400',...SCHEDULED_SCAN_TIMES.map(entry=>entry.alarm)]) await chrome.alarms.clear(name);
  } else await schedule();
});
chrome.runtime.onStartup.addListener(async()=>{
  // A browser restart stops the previous service worker and its scan.
  const previous=await chrome.storage.local.get('running');
  if(previous.running) await chrome.storage.local.set({running:false,runningStartedAt:null,lastScanError:'scan-interrupted-by-browser-restart',lastScanErrorAt:new Date().toISOString()});
  if(isEdgeBrowser||/Whale\//.test(globalThis.navigator?.userAgent||'')) {
    for(const name of ['daily-scan-1400',...SCHEDULED_SCAN_TIMES.map(entry=>entry.alarm)]) await chrome.alarms.clear(name);
    return;
  }
  await schedule();
  const dueSlot=currentScheduledScanSlot();
  if(!chromeOwnsSlot(dueSlot))return;
  await waitForSupplierResume(dueSlot);
  const state=await chrome.storage.local.get(['lastRunSlot','scanSaveRecovery']);
  const retry=state.scanSaveRecovery;
  if(retry?.scanSlot===dueSlot&&retry.chromeRetries===1&&['chrome-retry-queued','chrome-retry-running','edge-ready','deadline-exhausted'].includes(retry.stage)) {
    if(retry.stage==='chrome-retry-queued'&&Date.now()<Date.parse(retry.deadlineAt))requestScan(dueSlot);
    return;
  }
  if(recentScanSlot(dueSlot)&&state.lastRunSlot!==dueSlot) requestScan(dueSlot);
});
chrome.alarms.onAlarm.addListener(async alarm=>{
  if(isEdgeBrowser||/Whale\//.test(globalThis.navigator?.userAgent||'')) return;
  const entry=SCHEDULED_SCAN_TIMES.find(candidate=>candidate.alarm===alarm.name);
  if(!entry) return;
  scheduleEntry(entry).catch(()=>{});
  const p=kstDateTimeParts(new Date(alarm.scheduledTime));
  const slot=`${p.year}-${p.month}-${p.day}T${entry.slot}+09:00`;
  if(!chromeOwnsSlot(slot)||!recentScanSlot(slot)||slot!==currentScheduledScanSlot()) return;
  await waitForSupplierResume(slot);
  chrome.storage.local.get('lastRunSlot').then(state=>{
    if(state.lastRunSlot!==slot) requestScan(slot);
  }).catch(()=>{});
});
chrome.action.onClicked.addListener(()=>requestScan(/Whale\//.test(navigator.userAgent)?null:undefined));
let fallbackCatalogPending=false;
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if (message?.type==='GET_EXTENSION_HEALTH') {
    sendResponse({version:chrome.runtime.getManifest().version,observerStatus:accessObserverStatus});
    return;
  }
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
  if(message?.type==='RUN_PRIMARY_SCAN') {
    const slot=message.scanSlot,requestId=message.requestId;
    if(!/Whale\//.test(navigator.userAgent)||_sender.url?.split('?')[0]!==chrome.runtime.getURL('primary.html')||
      !/^[a-f0-9]{32}$/.test(requestId||'')||!/^\d{4}-\d{2}-\d{2}T12:00\+09:00$/.test(slot||'')||
      slot.slice(0,10)<'2026-10-21'||slot!==currentScheduledScanSlot()||!recentScanSlot(slot)||
      !message.products?.length||validateProductCatalog(message.products).length) {
      sendResponse({ok:false,reason:'invalid-primary-request'});return;
    }
    if(activeScanPromise||fallbackCatalogPending){sendResponse({ok:false,reason:'already-running'});return;}
    fallbackCatalogPending=true;
    chrome.storage.local.get(['primaryRequest','lastResult']).then(async state=>{
      if(state.primaryRequest?.scanSlot===slot)return {ok:true,reason:'already-requested'};
      await chrome.storage.local.set({products:message.products,primaryRequest:{scanSlot:slot,requestId}});
      return requestScan(slot,null,requestId)?{ok:true}:{ok:false,reason:'already-running'};
    }).then(sendResponse).catch(error=>sendResponse({ok:false,reason:String(error)})).finally(()=>{fallbackCatalogPending=false;});
    return true;
  }
  if (message?.type==='RUN_FALLBACK') {
    const errors=validateProductCatalog(message.products);
    if(!isEdgeBrowser||errors.length||!message.products?.length) { sendResponse({ok:false,reason:'invalid-fallback-catalog'});return; }
    if(activeScanPromise||fallbackCatalogPending) {sendResponse({ok:false,reason:'already-running'});return;}
    fallbackCatalogPending=true;
    const recovery=message.recovery||null;
    if(recovery&&(!/^[a-f0-9]{32}$/.test(recovery.runId||'')||
      !['chrome-process-exit','whale-process-exit','access-check','file-save-error'].includes(recovery.reason)||
      !/^\d{4}-\d{2}-\d{2}T(08|12|16|20):00\+09:00$/.test(message.scanSlot||'')||
      !Number.isFinite(Date.parse(recovery.triggeredAt)))) {
      fallbackCatalogPending=false;sendResponse({ok:false,reason:'invalid-recovery-context'});return;
    }
    chrome.storage.local.set({products:message.products}).then(()=>sendResponse(requestScan(message.scanSlot||null,recovery)?{ok:true}:{ok:false,reason:'already-running'}))
      .catch(error=>sendResponse({ok:false,reason:String(error)})).finally(()=>{fallbackCatalogPending=false;});
    return true;
  }
  if (message?.type==='RUN_SCAN') {
    sendResponse(requestScan(/Whale\//.test(navigator.userAgent)?null:undefined)?{ok:true}:{ok:false,reason:'already-running'});
    return;
  }
  if (message?.type==='GET_SCAN_STATUS') {
    chrome.storage.local.get(['running','scanProgress','lastScanError','lastScanErrorAt','lastResult']).then(async state=>{
      if(state.running&&!activeScanPromise) {
        state.running=false;
        state.lastScanError='scan-interrupted-by-worker-restart';
        state.lastScanErrorAt=new Date().toISOString();
        await chrome.storage.local.set({running:false,runningStartedAt:null,lastScanError:state.lastScanError,lastScanErrorAt:state.lastScanErrorAt});
      }
      sendResponse({...state,running:Boolean(activeScanPromise)});
    }).catch(error=>sendResponse({lastScanError:String(error)}));
    return true;
  }
  if (message?.type==='DIAGNOSE_CHECKOUT_DISCOUNTS') {
    diagnoseCheckoutDiscounts().then(sendResponse).catch(error=>sendResponse({ok:false,reason:String(error)}));
    return true;
  }
});
