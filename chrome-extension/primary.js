// Only the internal noon transport can admit a scheduled Whale result.
(async()=>{
  const p=new URL(location.href).searchParams,verify=p.get('verify')==='1';
  const receipt={browser:'whale',scanSlot:p.get('slot'),requestId:p.get('requestId'),status:'rejected',at:new Date().toISOString()};
  try {
    const response=await fetch(chrome.runtime.getURL('runtime/noon-request.json'),{cache:'no-store'});
    if(!response.ok)throw Error('request-file-unavailable');
    const request=await response.json();
    if(request.version!==1||request.browser!=='whale'||request.scanSlot!==receipt.scanSlot||request.requestId!==receipt.requestId)throw Error('request-file-mismatch');
    const result=await chrome.runtime.sendMessage({type:verify?'CHECK_PRIMARY_TRANSPORT':'RUN_PRIMARY_SCAN',products:request.targets,scanSlot:receipt.scanSlot,requestId:receipt.requestId});
    receipt.status=result?.ok?(verify?'transport-verified':'accepted'):'rejected';
    receipt.reason=result?.reason||null;
    receipt.targetCount=request.targets?.length||0;
    receipt.workerVersion=result?.version||null;
  } catch(error) {receipt.reason=String(error?.message||error);}
  document.getElementById('status').textContent=receipt.status+(receipt.reason?': '+receipt.reason:'');
  const filename=verify?'whale-primary-transport-check.json':'whale-primary-acceptance.json';
  const id=await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(receipt)),filename:'MarketPulse/'+filename,conflictAction:'overwrite',saveAs:false});
  for(let i=0;i<20;i++) {
    const [item]=await chrome.downloads.search({id});
    if(item?.state==='complete') {
      if(receipt.status!=='rejected'){const tab=await chrome.tabs.getCurrent();if(tab?.id)await chrome.tabs.remove(tab.id);}
      return;
    }
    if(!item||item.state==='interrupted')throw Error('acceptance-receipt-save-failed');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw Error('acceptance-receipt-save-timeout');
})().catch(()=>{document.getElementById('status').textContent='Whale request acknowledgement failed';});
