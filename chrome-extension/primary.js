// Only the internal noon transport can admit a scheduled Whale result.
async function primaryTimeout(promise,ms=10000) {
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('primary-api-timeout')),ms);})]);}finally{clearTimeout(timer);}
}
async function savePrimaryReceipt(receipt,verify) {
  const filename='MarketPulse/'+(verify?'whale-primary-transport-check.json':'whale-primary-acceptance.json');
  const id=await primaryTimeout(chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(receipt)),filename,conflictAction:'overwrite',saveAs:false}));
  for(let i=0;i<20;i++) {
    const [item]=await primaryTimeout(chrome.downloads.search({id}));
    if(item?.state==='complete') {
      if(!String(item.filename||'').replaceAll('\\','/').endsWith('/'+filename))throw Error('primary-receipt-path-mismatch');
      return;
    }
    if(!item||item.state==='interrupted')throw Error('primary-receipt-save-failed');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw Error('primary-receipt-save-timeout');
}
(async()=>{
  const p=new URL(location.href).searchParams,verify=p.get('verify')==='1';
  const identity={browser:'whale',scanSlot:p.get('slot'),requestId:p.get('requestId'),launchAttempt:Number(p.get('launch')||0)};
  try {
    const response=await primaryTimeout(fetch(chrome.runtime.getURL('runtime/noon-request.json'),{cache:'no-store'}));
    if(!response.ok)throw Error('request-file-unavailable');
    const request=await primaryTimeout(response.json());
    if(request.version!==1||request.browser!=='whale'||request.scanSlot!==identity.scanSlot||request.requestId!==identity.requestId||!Array.isArray(request.targets))throw Error('request-file-mismatch');
    await runPrimarySupervisor({now:()=>Date.now(),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),send:message=>primaryTimeout(chrome.runtime.sendMessage(message)),emit:async receipt=>{
      document.getElementById('status').textContent=receipt.status+(receipt.reason?': '+receipt.reason:'');
      await savePrimaryReceipt(receipt,verify);
    }},request,{verify});
    const tab=await chrome.tabs.getCurrent();if(tab?.id)await chrome.tabs.remove(tab.id);
  } catch(error) {
    await savePrimaryReceipt({...identity,version:1,status:'rejected',at:new Date().toISOString(),reason:String(error?.message||error)},verify).catch(()=>{});
    document.getElementById('status').textContent='Whale request failed: '+String(error?.message||error);
  }
})().catch(()=>{document.getElementById('status').textContent='Whale request acknowledgement failed';});
