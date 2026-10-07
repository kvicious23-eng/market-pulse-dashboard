import {safeDiagnostic} from './auth-core.mjs';
import {premiumReport} from './premium-core.mjs';
document.querySelector('#version').textContent='v'+chrome.runtime.getManifest().version;
let diagnosticReport={};
let premiumDiagnostic=null;
const labels={not_checked:'아직 확인 전',checking:'연결 확인 중',connected:'로그인 연결 정상',verification_required:'사용자 인증 필요',access_blocked:'접근 제한 표시',unverified:'화면 확인 필요',credentials_required:'계정 등록 필요',login_required:'로그인 필요',logging_in:'재로그인 중',login_failed:'재로그인 확인 실패',connection_error:'PC 연결 오류'};
const reasons={opening_supplier:'Supplier Hub 화면을 여는 중이야.',supplier_session_confirmed:'로그인된 Supplier Hub 화면을 확인했어.',relogin_confirmed:'재로그인 후 Supplier Hub 화면을 확인했어.',additional_verification:'Supplier Hub를 열어 추가 인증을 완료해줘.',access_message:'접근 제한 문구가 보여. 실제 원인은 별도 확인이 필요해.',credential_error:'아이디·비밀번호 오류 문구가 보여. 저장 계정을 확인해줘.',page_not_confirmed:'로그인 여부를 확정할 화면 근거가 없어. Supplier Hub를 열어 확인해줘.',interrupted_attempt_requires_review:'이전 로그인 시도가 중단됐어. 화면을 확인하고 필요한 경우 저장 계정을 갱신해줘.',local_credentials_missing:'계정 등록 버튼으로 PC 설정 창에서 입력해줘.',automatic_login_disabled:'직접 로그인하거나 자동 연결을 켜줘.',retry_blocked_until_credentials_updated:'이전 시도의 성공이 확인되지 않아 반복 제출을 멈췄어. 직접 로그인하거나 저장 정보를 갱신해줘.',retry_cooldown:'최근 로그인 시도가 있어 잠시 기다려.',attempt_started:'공식 로그인 화면에 저장 계정으로 접속하는 중이야.',credentials_changed_during_attempt:'계정 정보가 바뀌었어. 다시 연결을 확인해줘.',login_form_changed:'로그인 화면 구조가 달라 입력하지 않았어.',login_not_confirmed:'로그인 후 연결이 확인되지 않았어. 화면을 직접 확인해줘.',local_host_or_browser_error:'PC 연결 프로그램 설치와 Chrome 탭 상태를 확인해줘.',credentials_removed:'저장된 계정을 삭제했어.'};
Object.assign(reasons,{supplier_dashboard_confirmed:'Supplier Hub 대시보드의 필수진행사항·납품률·입고기준 미준수·마이샵을 함께 확인했어.',relogin_dashboard_confirmed:'재로그인 후 Supplier Hub 대시보드의 필수진행사항·납품률·입고기준 미준수·마이샵을 함께 확인했어.'});
Object.assign(reasons,{page_still_loading:'Supplier Hub로 이동하거나 화면을 불러오는 중이야. 잠시 뒤 연결 확인을 눌러줘.',unsupported_target_page:'확인이 허용된 Supplier Hub 주소에 도착하지 않았어. 판독 진단을 확인해줘.',page_probe_error:'Supplier Hub 화면을 읽지 못했어. 탭을 열고 판독 진단을 확인해줘.',target_tab_closed:'확인 대상 탭이 닫혔어. Supplier Hub 열기를 눌러줘.'});
const send=message=>chrome.runtime.sendMessage(message);
function render(s,vault) {
  document.querySelector('#status').textContent=labels[s.status]||'화면 확인 필요';
  document.querySelector('#reason').textContent=reasons[s.reason]||'';
  document.querySelector('#checked').textContent=s.checkedAt?'확인 시각: '+new Date(s.checkedAt).toLocaleString('ko-KR'):'';
  document.querySelector('#enabled').checked=s.enabled;
  diagnosticReport={extensionVersion:chrome.runtime.getManifest().version,checkedAt:s.checkedAt,status:s.status,reason:s.reason,observation:safeDiagnostic(s.diagnostic||{})};
  document.querySelector('#diagnostic').textContent=JSON.stringify(diagnosticReport,null,2);
  document.querySelector('#diagnostic-panel').open=s.status==='unverified'||s.status==='connection_error';
  if(vault) document.querySelector('#vault').textContent=vault.ok===false?'PC 연결 프로그램 설치가 필요해.':vault.configured?'PC에 계정이 저장돼 있어.':'PC에 저장된 계정이 없어.';
  const list=document.querySelector('#events');list.replaceChildren();
  for(const e of [...(s.events||[])].reverse()){const li=document.createElement('li');li.textContent=new Date(e.at).toLocaleString('ko-KR')+' · '+(labels[e.status]||e.status)+' · '+(reasons[e.reason]||e.reason);list.append(li);}
}
function renderPremium(report) {
  if(!report)return;
  premiumDiagnostic=premiumReport({state:report.status,diagnostic:report.observation},report.extensionVersion,report.checkedAt);
  const messages={premium_route_opened:'지정한 주소를 열고 화면 읽기까지 확인했어. 업무 데이터 확인·수집은 별도 단계야.',premium_login_required:'로그인이 필요해. 기존 연결 확인으로 로그인 상태를 복구한 뒤 다시 열어줘.',premium_verification_required:'추가 인증이 보여. 공식 화면에서 인증을 완료해줘.',premium_access_message:'접근 제한 문구가 보여. 실제 원인은 별도 확인이 필요해.',premium_page_not_confirmed:'지정한 주소의 로딩과 화면 읽기를 확인하지 못했어. 열린 페이지와 진단을 확인해줘.'};
  document.querySelector('#premium-status').textContent=messages[premiumDiagnostic.reason]||reasons[premiumDiagnostic.reason]||'화면 확인 필요';
  document.querySelector('#premium-diagnostic').textContent=JSON.stringify(premiumDiagnostic,null,2);
}
async function refresh(){const r=await send({type:'STATUS'});render(r.state,r.vault);renderPremium(r.premium);}
for(const [id,type] of [['open-premium','OPEN_PREMIUM'],['check-premium','CHECK_PREMIUM']]) document.querySelector('#'+id).addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;document.querySelector('#premium-status').textContent='화면을 확인하는 중이야.';
  try{renderPremium(await send({type}));}catch{document.querySelector('#premium-status').textContent='연결 관리 화면을 다시 열어줘.';}finally{button.disabled=false;}
});
document.querySelector('#copy-premium').addEventListener('click',async()=>{if(!premiumDiagnostic){document.querySelector('#notice').textContent='먼저 프리미엄 데이터 2.0 화면을 확인해줘.';return;}try{await navigator.clipboard.writeText(JSON.stringify(premiumDiagnostic,null,2));document.querySelector('#notice').textContent='화면 진단을 복사했어. 업무 데이터·계정·인증 URL은 포함하지 않아.';}catch{document.querySelector('#notice').textContent='화면 진단을 캡처해줘.';}});
for(const [id,type] of [['open','OPEN'],['check','CHECK'],['configure','CONFIGURE'],['forget','FORGET']]) document.querySelector('#'+id).addEventListener('click',async event=>{
  if(type==='FORGET'&&!confirm('PC에 저장된 Supplier Hub 계정을 삭제하고 자동 연결을 끌까?'))return;
  const button=event.currentTarget;button.disabled=true;
  try{const r=await send({type});document.querySelector('#notice').textContent=r?.ok===false?'PC 연결 프로그램과 설치 상태를 확인해줘.':type==='CONFIGURE'?'PC 계정 설정 창을 열었어. 저장한 뒤 연결 확인을 눌러줘.':'';await refresh();}catch{document.querySelector('#notice').textContent='연결 관리 화면을 다시 열어줘.';}finally{button.disabled=false;}
});
document.querySelector('#copy-diagnostic').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(diagnosticReport,null,2));document.querySelector('#notice').textContent='진단 정보를 복사했어. 계정·비밀번호·페이지 본문·인증 URL은 포함하지 않아.';}catch{document.querySelector('#notice').textContent='복사하지 못했어. 판독 진단 화면을 캡처해줘.';}});
document.querySelector('#enabled').addEventListener('change',async event=>{await send({type:'ENABLE',enabled:event.target.checked});await refresh();});
refresh();
