// Only the internal noon transport can admit a scheduled Whale result.
(async()=>{
  const p=new URL(location.href).searchParams;
  const products=JSON.parse(p.get('catalog')||'null');
  const result=await chrome.runtime.sendMessage({type:'RUN_PRIMARY_SCAN',products,scanSlot:p.get('slot'),requestId:p.get('requestId')});
  document.getElementById('status').textContent=result?.ok?'12시 웨일 수집 요청 확인 완료':'수집 시작 실패: '+(result?.reason||'unknown');
  if(result?.ok){const tab=await chrome.tabs.getCurrent();if(tab?.id)await chrome.tabs.remove(tab.id);}
})().catch(()=>{document.getElementById('status').textContent='12시 웨일 수집 요청 확인 실패';});
