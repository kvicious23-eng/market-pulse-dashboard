// The installed package is the single release authority; never pin an old patch.
const PRIMARY_RELEASE=chrome.runtime.getManifest().version;
// Only the internal noon transport can admit a scheduled Whale result.
async function primaryTimeout(promise,ms=10000) {
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('primary-api-timeout')),ms);})]);}finally{clearTimeout(timer);}
}
// Receipt I/O must never become a worker/start rejection. Every event has one
// bounded canonical attempt and one unique fallback; no scan is started here.
function createPrimaryReceiptWriter({download,search,now,wait,timeout,pageId}) {
  let sequence=0;
  return async(receipt,verify)=>{
    const event={...receipt,receiptVersion:2,receiptProducerVersion:PRIMARY_RELEASE,pageId,sequence:++sequence};
    const base=primaryReceiptBase(receipt,verify);
    const names=[`MarketPulse/${base}.json`];
    if(/^[a-f0-9]{32}$/.test(receipt.requestId)&&/^[a-f0-9]{32}$/.test(pageId))names.push(`MarketPulse/${base}-${pageId}-${String(sequence).padStart(6,'0')}.json`);
    for(const [attempt,filename] of names.entries()) {
      const end=now()+15000;
      const call=promise=>timeout(promise,Math.max(1,end-now()));
      try {
        const payload={...event,receiptDelivery:attempt?'unique-fallback':'canonical'};
        const id=await call(download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(payload)),filename,conflictAction:'overwrite',saveAs:false}));
        for(let i=0;i<20&&now()<end;i++) {
          const [item]=await call(search({id}));
          if(item?.state==='complete') {
            if(!String(item.filename||'').replaceAll('\\','/').endsWith('/'+filename))throw Error('primary-receipt-path-mismatch');
            return {ok:true,fallback:attempt===1};
          }
          if(!item||item.state==='interrupted')throw Error('primary-receipt-save-failed');
          await wait(Math.min(500,Math.max(0,end-now())));
        }
      } catch { /* Try the unique path once; keep supervising if both fail. */ }
    }
    return {ok:false};
  };
}
const savePrimaryReceipt=createPrimaryReceiptWriter({download:options=>chrome.downloads.download(options),search:query=>chrome.downloads.search(query),
  now:()=>Date.now(),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeout:primaryTimeout,pageId:crypto.randomUUID().replaceAll('-','')});
(async()=>{
  const p=new URL(location.href).searchParams,verify=p.get('verify')==='1';
  const identity={browser:'whale',scanSlot:p.get('slot'),requestId:p.get('requestId'),launchAttempt:Number(p.get('launch')||0)};
  try {
    if(!/^[a-f0-9]{32}$/.test(identity.requestId||''))throw Error('invalid-primary-id');
    const response=await primaryTimeout(fetch(chrome.runtime.getURL(`runtime/primary-request-${identity.requestId}.json`),{cache:'no-store'}));
    if(!response.ok)throw Error('request-file-unavailable');
    const request=await primaryTimeout(response.json());
    if(request.version!==1||request.browser!=='whale'||request.scanSlot!==identity.scanSlot||request.requestId!==identity.requestId||!Array.isArray(request.targets)||scanPolicyForSlot(identity.scanSlot).browser!=='whale'||(request.policyId!==scanPolicyForSlot(identity.scanSlot).id&&identity.scanSlot>='2026-10-26T20:00+09:00'))throw Error('request-file-mismatch');
    const health=await primaryTimeout(chrome.runtime.sendMessage({type:'GET_EXTENSION_HEALTH'}));
    if(health?.version!==PRIMARY_RELEASE||chrome.runtime.getManifest().version!==PRIMARY_RELEASE)throw Error('primary-worker-version-mismatch');
    await runPrimarySupervisor({now:()=>Date.now(),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),send:message=>primaryTimeout(chrome.runtime.sendMessage(message)),emit:async receipt=>{
      document.getElementById('status').textContent=receipt.status+(receipt.reason?': '+receipt.reason:'');
      const saved=await savePrimaryReceipt(receipt,verify);
      if(!saved.ok)document.getElementById('status').textContent=receipt.status+': receipt-save-degraded';
    }},request,{verify,release:PRIMARY_RELEASE});
    const tab=await chrome.tabs.getCurrent();if(tab?.id)await chrome.tabs.remove(tab.id);
  } catch(error) {
    await savePrimaryReceipt({...identity,version:1,status:'rejected',at:new Date().toISOString(),reason:String(error?.message||error)},verify).catch(()=>{});
    document.getElementById('status').textContent='Whale request failed: '+String(error?.message||error);
  }
})().catch(()=>{document.getElementById('status').textContent='Whale request acknowledgement failed';});
