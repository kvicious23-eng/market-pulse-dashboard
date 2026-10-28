// Private, bounded diagnostics for enrolled checkout tabs only. Never retain URLs,
// query strings, document text, headers, request bodies or unrelated tabs.
const checkoutDiagnosticTabs=new Map();
function checkoutDiagnosticRoute(value) {
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||!['www.coupang.com','order.coupang.com','checkout.coupang.com'].includes(u.hostname))return 'other-origin';
    return /\/vp\/products\/\d+\/?$/.test(u.pathname)?'product':/login|signin/i.test(u.pathname)?'login':/captcha|denied|error/i.test(u.pathname)?'error':/order|checkout/i.test(u.pathname)?'checkout':'other-coupang';
  }catch{return 'unknown';}
}
function checkoutDiagnosticError(error) {
  const s=String(error);
  return /scan-timeout:/.test(s)?'timeout':/Tabs cannot be edited right now/i.test(s)?'tab-edit-busy':/No tab with id|tab was closed/i.test(s)?'tab-closed':/frame.*removed|frame.*not found|context.*invalidated/i.test(s)?'document-replaced':/Cannot access|Missing host permission/i.test(s)?'script-access-denied':'api-rejected';
}
function createCheckoutTrace() {
  const data={version:1,attemptId:crypto.randomUUID().replaceAll('-',''),startedAt:new Date().toISOString(),observerStatus:checkoutObserverStatus,coverage:'main-frame-only; enrollment-after-tab-create; no-checkpoint-is-not-proof-of-no-click',events:[],droppedEvents:0,pendingOperations:0};
  const trace={data,tabs:new Set(),closed:false,
    event(kind,fields={}) {if(this.closed&&!['api-resolved','api-rejected'].includes(kind))return;data.events.push({at:new Date().toISOString(),elapsedMs:Date.now()-Date.parse(data.startedAt),kind,...fields});if(data.events.length>96){data.events.splice(32,1);data.droppedEvents++;}},
    enroll(tab) {this.tabs.add(tab.id);checkoutDiagnosticTabs.set(tab.id,this);this.event('tab-enrolled',{tabId:tab.id,route:checkoutDiagnosticRoute(tab.url),status:['loading','complete'].includes(tab.status)?tab.status:'unknown'});},
    finish() {this.event('finished',{pending:data.pendingOperations});data.finishedAt=new Date().toISOString();this.closed=true;for(const id of this.tabs)if(checkoutDiagnosticTabs.get(id)===this)checkoutDiagnosticTabs.delete(id);}
  };
  return trace;
}
async function checkoutDiagnosticStep(trace,stage,operation,ms) {
  trace.event('stage-start',{stage});trace.data.pendingOperations++;
  const p=Promise.resolve().then(operation);
  // A timeout does not cancel the original API. Keep its late acknowledgement,
  // but never repeat a click based on the timeout.
  p.then(()=>{trace.data.pendingOperations--;trace.event('api-resolved',{stage});},error=>{trace.data.pendingOperations--;trace.event('api-rejected',{stage,error:checkoutDiagnosticError(error)});});
  try {return await withScanTimeout(p,ms,`checkout-${stage}`);}
  catch(error){trace.event('stage-failed',{stage,error:checkoutDiagnosticError(error)});throw error;}
}
function observeCheckoutNetwork(details,event) {
  const trace=checkoutDiagnosticTabs.get(details.tabId);
  if(!trace||details.type!=='main_frame'||details.frameId!==0)return;
  trace.event('network',{tabId:details.tabId,event,route:checkoutDiagnosticRoute(details.url),status:Number.isInteger(details.statusCode)&&details.statusCode>=100&&details.statusCode<=599?details.statusCode:null,
    ...(event==='error'?{error:/^net::ERR_[A-Z0-9_]{1,70}$/.test(details.error||'')?details.error:'network-error-unclassified'}:{})});
}
let checkoutObserverStatus='unavailable';
if(typeof chrome!=='undefined') {
  try {
    const filter={urls:['https://www.coupang.com/*','https://order.coupang.com/*','https://checkout.coupang.com/*'],types:['main_frame']};
    chrome.webRequest.onCompleted.addListener(d=>observeCheckoutNetwork(d,'complete'),filter);
    chrome.webRequest.onBeforeRedirect.addListener(d=>observeCheckoutNetwork(d,'redirect'),filter);
    chrome.webRequest.onErrorOccurred.addListener(d=>observeCheckoutNetwork(d,'error'),filter);
    checkoutObserverStatus='registered';
  }catch{checkoutObserverStatus='registration-failed';}
  chrome.tabs.onCreated?.addListener(tab=>{const trace=checkoutDiagnosticTabs.get(tab.openerTabId);if(trace)trace.enroll(tab);});
  chrome.tabs.onUpdated?.addListener((id,change,tab)=>{const trace=checkoutDiagnosticTabs.get(id);if(trace&&(change.status||change.url))trace.event('tab-updated',{tabId:id,route:checkoutDiagnosticRoute(tab.url),status:['loading','complete'].includes(tab.status)?tab.status:'unknown',discarded:tab.discarded===true});});
  chrome.tabs.onRemoved?.addListener(id=>{const trace=checkoutDiagnosticTabs.get(id);if(trace){trace.event('tab-removed',{tabId:id});checkoutDiagnosticTabs.delete(id);}});
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.type!=='CHECKOUT_DIAGNOSTIC_CHECKPOINT')return;
    const trace=checkoutDiagnosticTabs.get(sender.tab?.id);
    if(sender.id===chrome.runtime.id&&trace&&message.attemptId===trace.data.attemptId&&['script-entered','identifiers-verified','button-ready','before-click','click-returned'].includes(message.checkpoint)) {
      trace.event('page-checkpoint',{tabId:sender.tab.id,checkpoint:message.checkpoint});reply({ok:true});
    }
  });
}
async function captureCheckoutFailure(trace,rootId) {
  // A quick, read-only tab snapshot; no DOM or personal checkout information.
  try {
    const tabs=await checkoutDiagnosticStep(trace,'failure-snapshot',()=>chrome.tabs.query({}),2000);
    for(const tab of tabs.filter(t=>trace.tabs.has(t.id)||(Number.isInteger(rootId)&&t.openerTabId===rootId))) {
      if(!trace.tabs.has(tab.id))trace.enroll(tab);
      trace.event('failure-tab',{tabId:tab.id,route:checkoutDiagnosticRoute(tab.url),status:['loading','complete'].includes(tab.status)?tab.status:'unknown',active:tab.active===true,discarded:tab.discarded===true});
    }
  }catch{}
}
async function saveCheckoutDiagnosticArchive(payload) {
  const failures=payload.results.filter(r=>r.checkoutDiagnostic&&r.checkoutDiscountStatus!=='captured'&&!['buy-now-button-not-found','buy-now-button-sold-out'].includes(r.checkoutDiscountReason));
  if(!failures.length)return 'not-needed';
  const archive={version:1,browser:payload.browser,extensionVersion:payload.extensionVersion,scanSlot:payload.scanSlot,runId:payload.runId,primaryRequestId:payload.primaryRequestId||null,chromeRunId:payload.recovery?.chromeRunId||null,startedAt:payload.startedAt,completedAt:payload.completedAt,
    results:failures.map(r=>({mtm:r.mtm,productId:r.productId,itemId:r.itemId,vendorItemId:r.vendorItemId,diagnostic:r.checkoutDiagnostic}))};
  try {
    const filename=`MarketPulse/checkout-diagnostic-${payload.runId}.json`;
    const id=await withScanTimeout(chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(archive)),filename,conflictAction:'overwrite',saveAs:false}),10000,'checkout-archive-start');
    await withScanTimeout(waitForScanDownload(id,filename),20000,'checkout-archive-complete');return 'saved';
  }catch{return 'save-failed';}
}
