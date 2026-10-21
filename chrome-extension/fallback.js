const status=document.getElementById('status');
async function fallbackTimeout(promise) {
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('edge-transport-timeout')),10000);})]);}finally{clearTimeout(timer);}
}
(async()=>{
  const p=new URL(location.href).searchParams,verify=p.get('verify')==='1';
  const response=await fallbackTimeout(fetch(chrome.runtime.getURL('runtime/edge-request.json'),{cache:'no-store'}));
  if(!response.ok)throw Error('edge-request-unavailable');
  const request=await fallbackTimeout(response.json());
  if(request.version!==1||request.browser!=='edge'||request.scanSlot!==p.get('slot')||request.runId!==p.get('runId')||!Array.isArray(request.products))throw Error('edge-request-mismatch');
  const result=await fallbackTimeout(chrome.runtime.sendMessage({type:verify?'CHECK_FALLBACK_TRANSPORT':'RUN_FALLBACK',products:request.products,scanSlot:request.scanSlot,recovery:request.recovery}));
  status.textContent=result?.ok?'Edge transport accepted':'Edge recovery rejected: '+(result?.reason||'unknown');
  if(verify) {
    const receipt={browser:'edge',at:new Date().toISOString(),scanSlot:request.scanSlot,runId:request.runId,status:result?.ok?'transport-verified':'rejected',workerVersion:result?.version||null,targetCount:request.products.length};
    const filename='MarketPulse/edge-fallback-transport-check.json';
    const id=await fallbackTimeout(chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(receipt)),filename,conflictAction:'overwrite',saveAs:false}));
    for(let i=0;i<20;i++) {
      const [item]=await fallbackTimeout(chrome.downloads.search({id}));
      if(item?.state==='complete') {
        if(!String(item.filename||'').replaceAll('\\','/').endsWith('/'+filename))throw Error('edge-receipt-path-mismatch');
        const tab=await chrome.tabs.getCurrent();if(tab?.id)await chrome.tabs.remove(tab.id);return;
      }
      if(!item||item.state==='interrupted')throw Error('edge-receipt-save-failed');
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    throw Error('edge-receipt-save-timeout');
  }
})().catch(error=>{status.textContent='Edge recovery failed: '+String(error);});
