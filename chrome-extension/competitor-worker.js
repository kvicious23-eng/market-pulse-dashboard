// Dedicated phase: shares the tested product/card/checkout readers, never the
// primary result filename, run slot, save-retry state or product catalogue.
async function loadCompetitorRequest(nonce){
  if(!/^[a-f0-9]{32}$/.test(nonce||''))throw Error('invalid-competitor-request');
  const response=await fetch(chrome.runtime.getURL(`runtime/competitor-${nonce}.json`),{cache:'no-store'});
  if(!response.ok)throw Error('competitor-request-missing');
  const q=await response.json(),browser=/Edg\//.test(navigator.userAgent)?'edge':/Whale\//.test(navigator.userAgent)?'whale':'chrome';
  if(q.version!==1||q.requestId!==nonce||q.browser!==browser||!['primary','edge'].includes(q.attempt)||q.scanSlot!==currentScheduledScanSlot()
    ||!/^[a-f0-9]{32}$/.test(q.sourceRunId||'')||!/^[a-f0-9]{40}$/.test(q.initialCommit||'')||!Array.isArray(q.targets)
    ||Date.parse(q.deadlineAt)>primaryScanDeadline(q.sourceStartedAt,q.scanSlot)||!Number.isFinite(Date.parse(q.deadlineAt)))throw Error('competitor-request-identity');
  const keys=new Set();
  for(const t of q.targets){const id=CompetitorModels.identity(t.url);if(t.competitorKey!==id.key||t.productId!==id.productId||t.itemId!==id.itemId||t.vendorItemId!==id.vendorItemId||keys.has(id.key))throw Error('competitor-target-identity');keys.add(id.key);}
  return q;
}
async function saveCompetitorReceipt(q,kind,value){
  const filename=`MarketPulse/competitor-${q.requestId}-${kind}.json`;
  const id=await withScanTimeout(chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(value)),filename,conflictAction:'overwrite',saveAs:false}),10000,'competitor-save');
  await withScanTimeout(waitForScanDownload(id,filename),20000,'competitor-save-complete');
}
async function runCompetitorCollection(q){
  const state={version:1,scope:'competitors',requestId:q.requestId,sourceRunId:q.sourceRunId,scanSlot:q.scanSlot,browser:q.browser,attempt:q.attempt,workerInstanceId:WORKER_INSTANCE_ID,
    extensionVersion:chrome.runtime.getManifest().version,deadlineAt:q.deadlineAt,startedAt:new Date().toISOString(),running:true,completed:0,total:q.targets.length};
  const results=[],windowState={windowId:null,anchorTabIds:[]};let stoppedReason=null;
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
        if(row.accessDiagnostic){row.accessDiagnostics=[{phase:'initial',diagnostic:row.accessDiagnostic}];delete row.accessDiagnostic;}
        if(q.browser!=='edge'&&isConfirmedAccessDenied(row)) {results.push(row);stoppedReason='access-check';break;}
        if(row.ok&&!expired()){
          const trace=createCheckoutTrace();row.checkoutDiagnostic=trace.data;
          Object.assign(row,await withScanTimeout(collectCheckoutDiscountsForTarget(t,windowState,trace,tab),90000,'competitor-checkout'));
        }
        if(expired()){stoppedReason='budget';break;}
        results.push(row);
      }catch(error){if(expired()){stoppedReason='budget';break;}results.push({...t,ok:false,reason:String(error),checkedAt:new Date().toISOString()});}
      finally{
        if(tab?.id){accessDiagnosticTabs.delete(tab.id);await withScanTimeout(chrome.tabs.remove(tab.id),5000,'competitor-close').catch(()=>{});}
      }
      state.completed=results.length;state.updatedAt=new Date().toISOString();await chrome.storage.local.set({competitorPhaseState:{...state}});
      // Match the active primary browser's spacing; do not change its experiment.
      const delay=q.browser==='chrome'&&chromeCadencePolicy(q.scanSlot,'chrome').delayMs===40000?40000:20000;
      for(let remaining=Math.min(delay,Math.max(0,Date.parse(q.deadlineAt)-Date.now()));remaining>0;){const step=Math.min(20000,remaining);await wait(step);remaining-=step;await chrome.runtime.getPlatformInfo();}
    }
    const value={...state,running:false,terminal:true,completed:results.length,completedAt:new Date().toISOString(),stoppedReason,results};
    await saveCompetitorReceipt(q,'result',value);await chrome.storage.local.set({competitorPhaseState:value});
  }catch(error){await chrome.storage.local.set({competitorPhaseState:{...state,running:false,error:String(error),completed:results.length}});}
  finally{for(const id of windowState.anchorTabIds)await chrome.tabs.remove(id).catch(()=>{});}
}
function handleCompetitorPhase(message,sender,reply){
  if(sender?.url?.split('?')[0]!==chrome.runtime.getURL('competitor.html')){reply({ok:false,reason:'invalid-phase-sender'});return;}
  (async()=>{
    const q=await loadCompetitorRequest(message.requestId),s=(await chrome.storage.local.get('competitorPhaseState')).competitorPhaseState;
    const busy=Boolean(activeScanPromise||primaryPendingOperations.size||fallbackCatalogPending);
    if(message.action==='status')return {ok:true,busy,state:s?.requestId===q.requestId?{requestId:s.requestId,workerInstanceId:s.workerInstanceId,running:s.running,terminal:s.terminal||false,error:s.error||null}:null,
      workerInstanceId:WORKER_INSTANCE_ID,workerRestarted:Boolean(s?.requestId===q.requestId&&s.running&&s.workerInstanceId!==WORKER_INSTANCE_ID&&!busy)};
    if(message.action!=='start'||Date.now()>=Date.parse(q.deadlineAt))throw Error('competitor-request-expired');
    if(s?.requestId===q.requestId)return {ok:true,alreadyStarted:true};
    if(busy)return {ok:false,reason:'busy'};
    primaryOperationOwner=q.requestId;activeScanSlot=q.scanSlot;
    activeScanPromise=runCompetitorCollection(q);activeScanPromise.then(finishScan,finishScan);
    return {ok:true,started:true};
  })().then(reply).catch(error=>reply({ok:false,reason:String(error)}));
}
