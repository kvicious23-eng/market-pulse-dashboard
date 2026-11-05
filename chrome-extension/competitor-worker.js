// Dedicated phase: shares the tested product/card/checkout readers, never the
// primary result filename, run slot, save-retry state or product catalogue.
async function loadCompetitorRequest(nonce){
  if(!/^[a-f0-9]{32}$/.test(nonce||''))throw Error('invalid-competitor-request');
  const response=await withScanTimeout(fetch(chrome.runtime.getURL(`runtime/competitor-${nonce}.json`),{cache:'no-store'}),10000,'competitor-request-load');
  if(!response.ok)throw Error('competitor-request-missing');
  const q=await withScanTimeout(response.json(),5000,'competitor-request-json'),browser=/Edg\//.test(navigator.userAgent)?'edge':/Whale\//.test(navigator.userAgent)?'whale':'chrome';
  const times=[q.sourceStartedAt,q.deadlineAt,q.publicationDeadline,q.firstPublishedAt].map(Date.parse),cap=primaryScanDeadline(q.sourceStartedAt,q.scanSlot);
  if(q.version!==1||q.scope!=='competitors'||times.some(t=>!Number.isFinite(t))||!Number.isFinite(cap)||times[0]<Date.parse(q.scanSlot)||times[3]<times[0]||times[2]<times[1]||times[0]>Date.now()+120000||(q.browser==='edge')!==(q.attempt==='edge')||q.requestId!==nonce||q.browser!==browser||!['primary','edge'].includes(q.attempt)||q.scanSlot!==currentScheduledScanSlot()
    ||!/^[a-f0-9]{32}$/.test(q.sourceRunId||'')||!/^[a-f0-9]{40}$/.test(q.initialCommit||'')||!Array.isArray(q.targets)
    ||Date.parse(q.deadlineAt)>cap||!Number.isFinite(Date.parse(q.deadlineAt)))throw Error('competitor-request-identity');
  const keys=new Set();
  for(const t of q.targets){const id=CompetitorModels.identity(t.url);if(t.competitorKey!==id.key||t.productId!==id.productId||t.itemId!==id.itemId||t.vendorItemId!==id.vendorItemId||keys.has(id.key))throw Error('competitor-target-identity');keys.add(id.key);}
  return q;
}
async function saveCompetitorReceipt(q,kind,value){
  const filename=`MarketPulse/competitor-${q.requestId}-${kind}.json`;
  const id=await withScanTimeout(chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(value)),filename,conflictAction:'overwrite',saveAs:false}),10000,'competitor-save');
  await withScanTimeout(waitForScanDownload(id,filename),20000,'competitor-save-complete');
}
async function persistCompetitorResult(q,value){
  await chrome.storage.local.set({competitorPhaseState:{...value,saveStatus:'pending'}});
  try{await saveCompetitorReceipt(q,'result',value);await chrome.storage.local.set({competitorPhaseState:{...value,saveStatus:'saved'}});}
  catch(error){await chrome.storage.local.set({competitorPhaseState:{...value,saveStatus:'failed',saveError:String(error)}});}
}
// The start page closes after its receipt. A pending JS promise is not a
// service-worker lifetime guarantee during long page/script waits.
function startCompetitorLiveness(q){
  let stopped=false,pending=false;
  const timer=setInterval(async()=>{
    if(stopped||Date.now()>=Date.parse(q.deadlineAt)+30000){clearInterval(timer);return;}
    if(pending)return;
    pending=true;
    try{await withScanTimeout(chrome.runtime.getPlatformInfo(),10000,'competitor-liveness');}
    catch{}finally{pending=false;}
  },20000);
  return ()=>{stopped=true;clearInterval(timer);};
}
async function runCompetitorCollection(q){
  const state={version:1,scope:'competitors',requestId:q.requestId,sourceRunId:q.sourceRunId,scanSlot:q.scanSlot,browser:q.browser,attempt:q.attempt,workerInstanceId:WORKER_INSTANCE_ID,
    extensionVersion:chrome.runtime.getManifest().version,deadlineAt:q.deadlineAt,startedAt:new Date().toISOString(),running:true,completed:0,total:q.targets.length};
  const results=[],windowState={windowId:null,anchorTabIds:[]};let stoppedReason=null;
  const stopLiveness=startCompetitorLiveness(q);
  const expired=()=>Date.now()>=Date.parse(q.deadlineAt);
  try{
    await chrome.storage.local.set({competitorPhaseState:state});await saveCompetitorReceipt(q,'start',state);
    for(const t of q.targets){
      if(Date.now()+75000>=Date.parse(q.deadlineAt)){stoppedReason='budget';break;}
      let tab;
      try{
        tab=await openScanTab(t.url,`competitor-open:${t.mtm}`,windowState);
        await withScanTimeout(waitForComplete(tab.id),60000,'competitor-load');await wait(7000);
        if(expired()){stoppedReason='budget';break;}
        const row={...t,...await withScanTimeout(scanCoupangTab(tab.id,t),90000,'competitor-price'),checkedAt:new Date().toISOString()};
        if(expired()){stoppedReason='budget';break;}
        if(row.accessDiagnostic){row.accessDiagnostics=[{phase:'initial',diagnostic:row.accessDiagnostic}];delete row.accessDiagnostic;}
        if(q.browser!=='edge'&&isConfirmedAccessDenied(row)) {results.push(row);stoppedReason='access-check';break;}
        if(row.ok&&!expired()){
          const trace=createCheckoutTrace();row.checkoutDiagnostic=trace.data;
          Object.assign(row,await withScanTimeout(collectCheckoutDiscountsForTarget(t,windowState,trace,tab),90000,'competitor-checkout'));
        }
        if(expired()){stoppedReason='budget';break;}
        row.checkedAt=new Date().toISOString();results.push(row);
      }catch(error){if(expired()){stoppedReason='budget';break;}results.push({...t,ok:false,reason:String(error),checkedAt:new Date().toISOString()});}
      finally{
        if(tab?.id){accessDiagnosticTabs.delete(tab.id);await withScanTimeout(chrome.tabs.remove(tab.id),5000,'competitor-close').catch(()=>{});}
      }
      state.completed=results.length;state.updatedAt=new Date().toISOString();await chrome.storage.local.set({competitorPhaseState:{...state}});
      // Match the active primary browser's spacing; do not change its experiment.
      const delay=q.browser==='chrome'&&chromeCadencePolicy(q.scanSlot,'chrome').delayMs===40000?40000:20000;
      for(let remaining=Math.min(delay,Math.max(0,Date.parse(q.deadlineAt)-Date.now()));remaining>0;){const step=Math.min(20000,remaining);await wait(step);remaining-=step;await chrome.runtime.getPlatformInfo();}
    }
  }catch(error){state.error=String(error);state.errorSource='worker';stoppedReason='worker-error';}
  try{
    const value={...state,running:false,terminal:true,completed:results.length,completedAt:new Date().toISOString(),stoppedReason,results};
    await persistCompetitorResult(q,value);
  }
  finally{
    stopLiveness();
    for(const id of windowState.anchorTabIds)await withScanTimeout(chrome.tabs.remove(id),5000,'competitor-anchor-close').catch(()=>{});
  }
}
function handleCompetitorPhase(message,sender,reply){
  if(sender?.url?.split('?')[0]!==chrome.runtime.getURL('competitor.html')){reply({ok:false,reason:'invalid-phase-sender'});return;}
  (async()=>{
    const q=await loadCompetitorRequest(message.requestId),s=(await chrome.storage.local.get('competitorPhaseState')).competitorPhaseState;
    const busy=Boolean(activeScanPromise||primaryPendingOperations.size||fallbackCatalogPending);
    if(message.action==='status')return {ok:true,busy,sourceRunId:q.sourceRunId,scanSlot:q.scanSlot,browser:q.browser,state:s?.requestId===q.requestId?{requestId:s.requestId,workerInstanceId:s.workerInstanceId,running:s.running,terminal:s.terminal||false,error:s.error||null,resultAvailable:s.terminal===true&&Array.isArray(s.results),saveStatus:s.saveStatus||null}:null,
      workerInstanceId:WORKER_INSTANCE_ID,workerRestarted:Boolean(s?.requestId===q.requestId&&s.running&&s.workerInstanceId!==WORKER_INSTANCE_ID&&!busy)};
    if(message.action==='save-result'){
      if(busy)return {ok:false,reason:'busy'};
      if(s?.requestId!==q.requestId||s.terminal!==true||!Array.isArray(s.results)||Date.now()>=Date.parse(q.publicationDeadline))throw Error('competitor-result-unavailable');
      primaryOperationOwner=q.requestId;activeScanSlot=q.scanSlot;
      const {saveError,saveStatus,...value}=s;activeScanPromise=persistCompetitorResult(q,value);activeScanPromise.then(finishScan,finishScan);return {ok:true,saving:true};
    }
    if(message.action!=='start'||Date.now()>=Date.parse(q.deadlineAt))throw Error('competitor-request-expired');
    if(s?.requestId===q.requestId)return {ok:true,alreadyStarted:true};
    if(busy)return {ok:false,reason:'busy'};
    primaryOperationOwner=q.requestId;activeScanSlot=q.scanSlot;
    activeScanPromise=runCompetitorCollection(q);activeScanPromise.then(finishScan,finishScan);
    return {ok:true,started:true};
  })().then(reply).catch(error=>reply({ok:false,reason:String(error)}));
}
