async function probeTimeout(p) {
  let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('worker-probe-timeout')),10000);})]);}finally{clearTimeout(timer);}
}
(async()=>{
  try {
    const q=new URLSearchParams(location.search),nonce=q.get('nonce'),slot=q.get('slot'),runId=q.get('runId');
    if(!/^[a-f0-9]{32}$/.test(nonce||'')||!/^[a-f0-9]{32}$/.test(runId||''))throw Error('bad-probe');
    const result=await probeTimeout(chrome.runtime.sendMessage({type:'FREEZE_INTERRUPTED_SCAN',scanSlot:slot,runId,nonce}));
    const receipt={version:1,browser:'chrome',nonce,scanSlot:slot,runId,observedAt:new Date().toISOString(),...result};
    const filename='MarketPulse/worker-probe-'+nonce+'.json';
    const id=await probeTimeout(chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(receipt)),filename,conflictAction:'overwrite',saveAs:false}));
    for(let i=0;i<20;i++){
      const [d]=await probeTimeout(chrome.downloads.search({id}));
      if(d?.state==='complete'){
        if(!String(d.filename||'').replaceAll('\\','/').endsWith('/'+filename))throw Error('worker-probe-path-mismatch');
        return;
      }
      if(!d||d.state==='interrupted')throw Error('worker-probe-save-failed');
      await new Promise(r=>setTimeout(r,500));
    }
    throw Error('worker-probe-save-timeout');
  } catch { /* No fresh validated receipt means no inferred handoff. */ }
  finally {try{const tab=await probeTimeout(chrome.tabs.getCurrent());if(tab?.id)await probeTimeout(chrome.tabs.remove(tab.id));}catch{}}
})();