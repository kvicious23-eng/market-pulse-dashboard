const status=document.getElementById('status');
let products;
try { products=JSON.parse(new URL(location.href).searchParams.get('catalog')||'null'); }
catch { products=null; }
if(!Array.isArray(products)||!products.length) status.textContent='Edge 수집 시작 실패: Chrome 상품 목록이 없어.';
else chrome.runtime.sendMessage({type:'RUN_FALLBACK',products,scanSlot:new URL(location.href).searchParams.get('slot'),recovery:JSON.parse(new URL(location.href).searchParams.get('recovery')||'null')}).then(result=>{
  status.textContent=result?.ok?'같은 전체 상품 목록의 Edge 복구 수집을 시작했어. 완료 후 업로더가 결과를 확인해.':
    'Edge 수집 시작 실패: '+(result?.reason||'unknown');
}).catch(error=>{status.textContent='Edge 수집 시작 실패: '+String(error);});

