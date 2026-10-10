// Local extension page only: no external messaging, product requests or browser restart.
async function maintenanceTimeout(promise) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('maintenance-timeout')),10000);})]);}
  finally {clearTimeout(timer);}
}
async function maintainExtension() {
  const params=new URLSearchParams(location.search),mode=params.get('mode'),nonce=params.get('nonce'),expected=params.get('version');
  if(!['reload','verify'].includes(mode)||!/^[a-f0-9]{32}$/.test(nonce||'')||!/^\d+\.\d+\.\d+$/.test(expected||''))throw Error('invalid-maintenance-request');
  const state=await maintenanceTimeout(chrome.runtime.sendMessage({type:'GET_SCAN_STATUS'}));
  if(!state||typeof state.running!=='boolean')throw Error('scan-state-unavailable');
  const browser=/Edg\//.test(navigator.userAgent)?'edge':'chrome';
  const version=chrome.runtime.getManifest().version;
  const receipt={nonce,browser,mode,expected,version,at:new Date().toISOString(),status:state.running?'busy':mode==='reload'?'reload-requested':'verification-failed'};
  if(mode==='verify'&&!state.running) {
    const health=await maintenanceTimeout(chrome.runtime.sendMessage({type:'GET_EXTENSION_HEALTH'}));
    const permission=await maintenanceTimeout(chrome.permissions.contains({permissions:['webRequest']}));
    receipt.workerVersion=health?.version||null;
    receipt.observerStatus=health?.observerStatus||null;
    receipt.webRequestGranted=permission;
    receipt.scheduledAlarms=(await maintenanceTimeout(chrome.alarms.getAll())).map(alarm=>alarm.name).filter(name=>/^daily-scan-\d{4}$/.test(name)).sort();
    if(version===expected&&health?.version===expected&&health?.observerStatus==='registered'&&permission)receipt.status='verified';
  }
  const filename=`MarketPulse/extension-maintenance-${browser}.json`;
  const id=await maintenanceTimeout(chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(receipt)),filename,conflictAction:'overwrite',saveAs:false}));
  let saved=false;
  for(let i=0;i<20;i++) {
    const [item]=await maintenanceTimeout(chrome.downloads.search({id}));
    if(item?.state==='complete') {
      if(!String(item.filename||'').replaceAll('\\','/').endsWith('/'+filename))throw Error('maintenance-receipt-path-mismatch');
      saved=true;break;
    }
    if(!item||item.state==='interrupted')throw Error('maintenance-receipt-failed');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!saved)throw Error('maintenance-receipt-timeout');
  document.querySelector('#status').textContent=receipt.status;
  if(receipt.status==='reload-requested')chrome.runtime.reload();
  if(receipt.status==='verified') {
    const tab=await chrome.tabs.getCurrent();
    if(tab?.id)await chrome.tabs.remove(tab.id);
  }
  return receipt;
}
maintainExtension().catch(()=>{document.querySelector('#status').textContent='업데이트 상태 확인 실패. 수집은 시작하지 않았습니다.';});
