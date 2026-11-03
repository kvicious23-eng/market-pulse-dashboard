const commonPageStarted=Date.now();
async function bounded(p,ms=10000,cleanup=false){if(!cleanup&&Date.now()-commonPageStarted>=30000)throw Error('primary-api-timeout');ms=cleanup?Math.min(ms,2000):Math.min(ms,Math.max(1,30000-(Date.now()-commonPageStarted)));let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('primary-api-timeout')),ms);})]);}finally{clearTimeout(timer);}}
(async()=>{
 try{
  const p=new URLSearchParams(location.search),requestId=p.get('requestId'),nonce=p.get('nonce'),mode=p.get('mode')||'start',slot=p.get('slot');
  if(!/^[a-f0-9]{32}$/.test(requestId||'')||!/^[a-f0-9]{32}$/.test(nonce||'')||!['start','probe','retry','stop','freeze','verify'].includes(mode))throw Error('invalid-common-request');
  const browser=/Whale\//.test(navigator.userAgent)?'whale':/Edg\//.test(navigator.userAgent)?'edge':'chrome';
  const protocolId=windowsPrimaryProtocol(slot);
  if(!protocolId||scanPolicyForSlot(slot).browser!==browser)throw Error('common-browser-owner-mismatch');
  const filename='MarketPulse/common-primary-'+browser+'-'+scanSlotKey(slot)+'-'+requestId+'-'+nonce+'.json';
  const request=await bounded((await bounded(fetch(chrome.runtime.getURL('runtime/primary-request-'+requestId+'.json'),{cache:'no-store'}))).json());
  if(request.version!==1||request.requestId!==requestId||request.scanSlot!==slot||request.browser!==browser||request.primaryProtocolId!==protocolId||!Array.isArray(request.targets))throw Error('common-request-mismatch');
  const types={start:'RUN_PRIMARY_SCAN',retry:'RUN_PRIMARY_SCAN',probe:'GET_PRIMARY_STATE',stop:'STOP_PRIMARY_SCAN',freeze:'PREPARE_PRIMARY_HANDOFF',verify:'CHECK_PRIMARY_TRANSPORT'};
  const result=await bounded(chrome.runtime.sendMessage({type:types[mode],scanSlot:slot,requestId,policyId:request.policyId,primaryProtocolId:protocolId,products:request.targets,requestedAt:request.requestedAt,retry:mode==='retry'}));
  const {version:release,...state}=result||{};
  const receipt={...state,version:1,browser:state.browser||browser,scanSlot:slot,requestId,nonce,mode,verifyOnly:mode==='verify',primaryProtocolId:state.primaryProtocolId||protocolId,policyId:request.policyId,at:new Date().toISOString(),workerVersion:state.workerVersion||release||chrome.runtime.getManifest().version};
  const id=await bounded(chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(receipt)),filename,conflictAction:'overwrite',saveAs:false}));
  for(let i=0;i<20;i++){
   const [item]=await bounded(chrome.downloads.search({id}));
   if(item?.state==='complete'){if(!String(item.filename||'').replaceAll('\\','/').endsWith('/'+filename))throw Error('common-receipt-path-mismatch');return;}
   if(!item||item.state==='interrupted')throw Error('common-receipt-save-failed');
   await new Promise(r=>setTimeout(r,500));
  }
 }catch{}
 finally{try{const tab=await bounded(chrome.tabs.getCurrent(),2000,true);if(tab?.id)await bounded(chrome.tabs.remove(tab.id),2000,true);}catch{}}
})();