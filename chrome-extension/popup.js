document.querySelector('#manage').addEventListener('click',()=>chrome.runtime.openOptionsPage());
document.querySelector('#scan').addEventListener('click',async()=>{
  await chrome.runtime.sendMessage({type:'RUN_SCAN'});
  document.querySelector('#status').textContent='수집을 시작했어. 열린 탭을 그대로 두면 돼.';
});
