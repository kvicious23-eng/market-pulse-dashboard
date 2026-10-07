const query=new URL(location.href).searchParams;
const status=document.getElementById('status');
try {
  const result=await chrome.runtime.sendMessage({type:'RESUME_AFTER_EDGE',scanSlot:query.get('slot'),runId:query.get('runId'),priceId:query.get('priceId')});
  status.textContent=result?.ok?'오전 완료 신호를 확인했어. Supplier Hub 인증과 CSV 작업을 이어가고 있어.':'오전 작업을 시작하지 못했어. '+(result?.reason||'신호 미확인');
}catch{status.textContent='확장 연결을 확인해줘.';}
