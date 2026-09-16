document.querySelector('#manage').addEventListener('click',()=>chrome.runtime.openOptionsPage());
document.querySelector('#scan').addEventListener('click',async()=>{
  await chrome.runtime.sendMessage({type:'RUN_SCAN'});
  document.querySelector('#status').textContent='수집을 시작했어. 열린 탭을 그대로 두면 돼.';
});
document.querySelector('#supplier').addEventListener('click',async()=>{
  const status=document.querySelector('#status');
  status.textContent='현재 Supplier Hub 화면 구조를 확인 중이야.';
  const result=await chrome.runtime.sendMessage({type:'SCAN_SUPPLIER_HUB'});
  status.textContent=result?.ok
    ? '진단 파일을 Downloads\\MarketPulse에 저장했어.'
    : (result?.reason||'Supplier Hub 진단에 실패했어.');
});
