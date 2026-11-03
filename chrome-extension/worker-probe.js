(async()=>{
const q=new URLSearchParams(location.search),nonce=q.get('nonce'),slot=q.get('slot'),runId=q.get('runId');
if(!/^[a-f0-9]{32}$/.test(nonce||'')||!/^[a-f0-9]{32}$/.test(runId||''))throw Error('bad-probe');
const result=await chrome.runtime.sendMessage({type:'FREEZE_INTERRUPTED_SCAN',scanSlot:slot,runId,nonce});
const receipt={version:1,browser:'chrome',nonce,scanSlot:slot,runId,observedAt:new Date().toISOString(),...result};
const id=await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(receipt)),filename:'MarketPulse/worker-probe-'+nonce+'.json',conflictAction:'overwrite',saveAs:false});
for(let i=0;i<20;i++){const [d]=await chrome.downloads.search({id});if(d?.state==='complete'){const tab=await chrome.tabs.getCurrent();if(tab?.id)await chrome.tabs.remove(tab.id);return;}await new Promise(r=>setTimeout(r,500));}
})().catch(()=>{document.body.textContent='Probe failed; no recovery evidence.';});