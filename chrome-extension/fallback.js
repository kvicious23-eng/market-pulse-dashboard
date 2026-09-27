const status=document.getElementById('status');
chrome.runtime.sendMessage({type:'RUN_SCAN'}).then(result=>{
  status.textContent=result?.ok?'Chrome 접근 제한으로 Edge 수집을 시작했어. 완료 후 업로더가 결과를 확인해.':
    result?.reason==='already-running'?'Edge 수집이 이미 진행 중이야.':'Edge 수집 시작 실패: '+(result?.reason||'unknown');
}).catch(error=>{status.textContent='Edge 수집 시작 실패: '+String(error);});
