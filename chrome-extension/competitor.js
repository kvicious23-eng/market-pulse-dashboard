(async()=>{
  const params=new URLSearchParams(location.search),requestId=params.get('request'),action=params.get('action');
  if(!/^[a-f0-9]{32}$/.test(requestId||'')||!['start','status'].includes(action))throw Error('invalid-phase-page');
  const result=await chrome.runtime.sendMessage({type:'COMPETITOR_PHASE',requestId,action});
  const filename=`MarketPulse/competitor-${requestId}-${action}-ack.json`;
  const id=await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({requestId,action,at:new Date().toISOString(),...result})),filename,conflictAction:'overwrite',saveAs:false});
  for(let i=0;i<20;i++){
    const [item]=await chrome.downloads.search({id});
    if(item?.state==='complete'&&String(item.filename).replaceAll('\\','/').endsWith('/'+filename)){const tab=await chrome.tabs.getCurrent();if(tab?.id)await chrome.tabs.remove(tab.id);return;}
    if(item?.state==='interrupted')throw Error('receipt-failed');await new Promise(r=>setTimeout(r,500));
  }
  throw Error('receipt-timeout');
})().catch(()=>{document.querySelector('#status').textContent='경쟁모델 수집 요청을 확인하지 못했어. 실행 기록을 확인해.';});
