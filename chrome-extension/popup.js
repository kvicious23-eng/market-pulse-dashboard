document.querySelector('#manage').addEventListener('click',()=>chrome.runtime.openOptionsPage());
document.querySelector('#scan').addEventListener('click',async()=>{
  await chrome.runtime.sendMessage({type:'RUN_SCAN'});
  document.querySelector('#status').textContent='수집을 시작했어. 열린 탭을 그대로 두면 돼.';
});
document.querySelector('#checkout').addEventListener('click',async()=>{
  const status=document.querySelector('#status');
  status.textContent='현재 상품의 주문서 할인 항목을 읽기 전용으로 진단 중이야.';
  const result=await chrome.runtime.sendMessage({type:'DIAGNOSE_CHECKOUT_DISCOUNTS'});
  status.textContent=result?.ok
    ? '주문서 할인 진단 JSON을 저장했어. 결제 버튼은 누르지 않았어.'
    : (result?.reason||'주문서 할인 진단에 실패했어.');
});
document.querySelector('#inventory').addEventListener('click',async()=>{
  const status=document.querySelector('#status');
  status.textContent='Supplier Hub에서 전일 재고를 수집 중이야.';
  const result=await chrome.runtime.sendMessage({type:'COLLECT_SUPPLIER_INVENTORY'});
  status.textContent=result?.ok
    ? `${result.asOfDate} 재고 JSON 저장 완료 (${result.captured}/${result.total})`
    : (result?.reason||'전일 재고 수집에 실패했어. Supplier Hub 로그인 상태를 확인해줘.');
});
document.querySelector('#supplier').addEventListener('click',async()=>{
  const status=document.querySelector('#status');
  status.textContent='현재 Supplier Hub 화면 구조를 확인 중이야.';
  const result=await chrome.runtime.sendMessage({type:'SCAN_SUPPLIER_HUB'});
  status.textContent=result?.ok
    ? '진단 파일을 Downloads\\MarketPulse에 저장했어.'
    : (result?.reason||'Supplier Hub 진단에 실패했어.');
});
