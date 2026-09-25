document.querySelector('#manage').addEventListener('click',()=>chrome.runtime.openOptionsPage());
const status=document.querySelector('#status');
chrome.runtime.sendMessage({type:'GET_SCAN_STATUS'}).then(state=>{
  if(state?.running){
    const progress=state.scanProgress;
    status.textContent=progress
      ? `수집 중: ${progress.completed}/${progress.total}개 완료, ${progress.mtm||'JSON 저장'} · ${progress.stage||'준비'} (마지막 진행 ${new Date(progress.updatedAt).toLocaleTimeString('ko-KR')})`
      : '수집을 시작하는 중이야.';
  } else if(state?.lastScanError) {
    status.textContent=`마지막 수집 오류: ${state.lastScanError}`;
  } else if(state?.lastResult?.completedAt) {
    const failed=(state.lastResult.results||[]).filter(result=>!result.ok).length;
    status.textContent=`마지막 JSON 저장: ${new Date(state.lastResult.completedAt).toLocaleString('ko-KR')} · ${state.lastResult.resultCount}/${state.lastResult.targetCount}개 기록${failed?` (가격 수집 실패 ${failed}개)`:''}`;
  }
}).catch(()=>{});
document.querySelector('#scan').addEventListener('click',async()=>{
  const response=await chrome.runtime.sendMessage({type:'RUN_SCAN'});
  status.textContent=response?.ok
    ? '수집을 시작했어. 열린 탭을 그대로 두면 돼.'
    : response?.reason==='already-running'
      ? '이미 수집 중이야. 진행이 멈췄다면 확장 프로그램을 새로고침한 뒤 다시 시작해.'
      : `수집을 시작하지 못했어: ${response?.reason||'원인 미확인'}`;
});
document.querySelector('#checkout').addEventListener('click',async()=>{
  const status=document.querySelector('#status');
  status.textContent='현재 상품의 주문서 할인 항목을 읽기 전용으로 진단 중이야.';
  const result=await chrome.runtime.sendMessage({type:'DIAGNOSE_CHECKOUT_DISCOUNTS'});
  status.textContent=result?.ok
    ? '주문서 할인 진단 JSON을 저장했어. 결제 버튼은 누르지 않았어.'
    : (result?.reason||'주문서 할인 진단에 실패했어.');
});
