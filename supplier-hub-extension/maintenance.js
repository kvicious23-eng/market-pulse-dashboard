// Local maintenance only; no authentication, credential reads or CSV requests.
(async()=>{
  const p=new URLSearchParams(location.search),mode=p.get('mode'),nonce=p.get('nonce'),expected=p.get('version');
  if(!['reload','verify'].includes(mode)||!/^[a-f0-9]{32}$/.test(nonce||'')||!/^\d+\.\d+\.\d+$/.test(expected||''))throw Error('invalid-request');
  let timer;
  const health=await Promise.race([chrome.runtime.sendMessage({type:'SUPPLIER_MAINTENANCE_HEALTH'}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('health-timeout')),10000);})]).finally(()=>clearTimeout(timer));
  if(typeof health?.busy!=='boolean')throw Error('health-unavailable');
  const version=chrome.runtime.getManifest().version;
  const receipt={nonce,mode,expected,version,workerVersion:health.version,at:new Date().toISOString(),dailyDay:health.dailyDay,dailyStage:health.dailyStage,status:health.busy?'busy':mode==='reload'?'reload-requested':version===expected&&health.version===expected?'verified':'verification-failed'};
  receipt.alarms=(await chrome.alarms.getAll()).map(x=>x.name).sort();
  const filename='MarketPulse/supplier-maintenance-'+mode+'.json';
  const id=await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(receipt)),filename,conflictAction:'overwrite',saveAs:false});
  for(let i=0;i<20;i++){
    const [item]=await chrome.downloads.search({id});
    if(item?.state==='complete'){
      if(!String(item.filename||'').replaceAll('\\','/').endsWith('/'+filename))throw Error('receipt-path-mismatch');
      document.querySelector('#status').textContent=receipt.status;
      if(receipt.status==='reload-requested')chrome.runtime.reload();
      else if(receipt.status==='verified'){const t=await chrome.tabs.getCurrent();if(t?.id)await chrome.tabs.remove(t.id);}
      return;
    }
    if(!item||item.state==='interrupted')throw Error('receipt-failed');
    await new Promise(r=>setTimeout(r,500));
  }
  throw Error('receipt-timeout');
})().catch(()=>{document.querySelector('#status').textContent='Maintenance could not be verified.';});
