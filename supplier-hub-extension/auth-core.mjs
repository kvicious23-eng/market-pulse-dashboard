export const ENTRY = 'https://supplier.coupang.com/';
export const CHECK_ALARM = 'supplier-session-check';
export const RETRY_INTERVAL = 60 * 60 * 1000;
export const DEFAULT_STATE = {enabled:false,status:'not_checked',reason:'',tabId:null,checkedAt:'',lastAutoAt:0,blockedVersion:'',pendingAttempt:false,events:[],diagnostic:null};

// Allow only fixed labels, boolean observations and bounded counts into saved diagnostics.
export function safeDiagnostic(raw={}) {
  const out={extensionVersion:/^\d+\.\d+\.\d+$/.test(raw.extensionVersion||'')?raw.extensionVersion:'',probe:['inspected','loading','tab_missing','unsupported_page','script_error','unavailable'].includes(raw.probe)?raw.probe:'unavailable',host:['supplier','seller_auth','other'].includes(raw.host)?raw.host:'other',view:['dashboard','login','password-reminder','other'].includes(raw.view)?raw.view:'other'};
  for(const key of ['visiblePassword','logoutPresent','logoutVisible','requiredTasks','deliveryRate','receivingIssues','myshop']) out[key]=raw[key]===true;
  out.scheme=['https','http','about','chrome','chrome-error','chrome-extension','none','other'].includes(raw.scheme)?raw.scheme:'none';
  out.tabStatus=['loading','complete','unknown'].includes(raw.tabStatus)?raw.tabStatus:'unknown';
  out.pendingOfficial=raw.pendingOfficial===true;
  out.frameCount=Number.isInteger(raw.frameCount)?Math.max(0,Math.min(raw.frameCount,50)):0;
  return out;
}

export function permittedUrl(url) {
  try {
    const u=new URL(url);
    return u.protocol==='https:' && !u.username && !u.password && !u.port &&
      (u.hostname==='supplier.coupang.com' || (u.hostname==='xauth.coupang.com' && u.pathname.startsWith('/auth/realms/seller/')));
  } catch { return false; }
}

export function officialOrPending(tab) { return !!tab && permittedUrl(tab.pendingUrl||tab.url); }

function tabDiagnostic(tab,extensionVersion) {
  let u;try{u=new URL(tab?.url);}catch{}
  return {extensionVersion,host:u?.hostname==='supplier.coupang.com'?'supplier':u?.hostname==='xauth.coupang.com'?'seller_auth':'other',view:u && /^\/dashboard\/KR\/?$/.test(u.pathname)?'dashboard':u && /\/login(?:\/|$)|\/login-actions\//.test(u.pathname)?'login':'other',scheme:u?u.protocol.slice(0,-1):'none',tabStatus:tab?.status==='loading'?'loading':tab?.status==='complete'?'complete':'unknown',pendingOfficial:permittedUrl(tab?.pendingUrl)};
}

// Read only an allowed, loaded document. A new tab may still expose about:blank
// or no URL while its official pendingUrl is navigating; never inspect that placeholder.
export async function probeSupplierTab(io,id) {
  let last={state:'unverified',diagnostic:{extensionVersion:io.extensionVersion,probe:'loading'}};
  for(let i=0;i<20;i++) {
    const tab=await io.tab(id);const diagnostic=tabDiagnostic(tab,io.extensionVersion);
    if(!tab) return {state:'unverified',diagnostic:{...diagnostic,probe:'tab_missing'}};
    if(tab.pendingUrl && !permittedUrl(tab.pendingUrl)) return {state:'unverified',diagnostic:{...diagnostic,probe:'unsupported_page'}};
    if(!permittedUrl(tab.url)) {
      const placeholder=!tab.url || tab.url==='about:blank' || /^chrome:\/\/(newtab|new-tab-page)\/?$/.test(tab.url);
      if(!diagnostic.pendingOfficial && !placeholder) return {state:'unverified',diagnostic:{...diagnostic,probe:'unsupported_page'}};
      last={state:'unverified',diagnostic:{...diagnostic,probe:'loading'}};
    } else if(tab.status==='complete' && !tab.pendingUrl) {
      try {
        const result=await io.inspect(id);
        if(result) last={...result,diagnostic:{...diagnostic,...result.diagnostic,extensionVersion:io.extensionVersion}};
        if(result && result.state!=='unverified') return last;
      } catch {last={state:'unverified',diagnostic:{...diagnostic,probe:'script_error'}};}
    } else last={state:'unverified',diagnostic:{...diagnostic,probe:'loading'}};
    await io.sleep(750);
  }
  return last;
}

// Never persist page text, account names, URLs, cookies, tokens, or credentials.
export class SupplierConnector {
  constructor(io) { this.io=io; this.running=false; }
  async read() { return {...DEFAULT_STATE,...await this.io.load()}; }
  async noteProbe(p) { await this.io.save({...await this.read(),diagnostic:safeDiagnostic(p.diagnostic)}); }
  async state(status,reason,extra={}) {
    const old=await this.read(); const at=new Date(this.io.now()).toISOString();
    const next={...old,...extra,status,reason,checkedAt:at};
    next.events=[...(old.events||[]),{at,status,reason}].slice(-50);
    await this.io.save(next); return next;
  }
  async check({manualRetry=false}={}) {
    if(this.running) return this.read();
    this.running=true;
    let attemptArmed=false,submissionPossible=false;
    try {
      let s=await this.read();
      let tab=await this.io.tab(s.tabId);
      let opened=false;
      // A replaced or navigated tab is not used as a credential destination.
      if(!officialOrPending(tab)) {
        tab=await this.io.open(ENTRY);
        opened=true;
        s=await this.state('checking','opening_supplier',{tabId:tab.id});
      }
      // Verify a fresh Supplier response, rather than an old authenticated DOM.
      // Only the connector's own tab is refreshed; xauth challenge/login pages are left in place.
      if(!opened && !tab.pendingUrl && tab.status!=='loading' && permittedUrl(tab.url) && new URL(tab.url).hostname==='supplier.coupang.com') await this.io.refresh(tab.id);
      // One optional reminder action per check, including the post-login loop.
      // Dismissal is never positive authentication evidence by itself.
      let reminderAttempted=false;
      const probe=async()=>{
        let result=await this.io.probe(tab.id);
        if(result.state!=='password_reminder')return result;
        await this.noteProbe(result);
        if(reminderAttempted)return {...result,state:'password_reminder_unresolved'};
        reminderAttempted=true;
        const action=await this.io.postponePassword?.(tab.id);
        if(action?.clicked!==true)return {...result,state:'password_reminder_unresolved'};
        await this.state('checking','password_reminder_postponed');
        await this.io.sleep(750);
        result=await this.io.probe(tab.id);
        return result.state==='password_reminder'?{...result,state:'password_reminder_unresolved'}:result;
      };
      let p=await probe();
      await this.noteProbe(p);
      if(p.state==='password_reminder_unresolved')return this.state('unverified','password_reminder_not_confirmed');
      if(p.state==='authenticated') return this.state('connected',p.evidence==='supplier_dashboard_widgets'?'supplier_dashboard_confirmed':'supplier_session_confirmed',{pendingAttempt:false,blockedVersion:''});
      if(p.state==='verification') return this.state('verification_required','additional_verification');
      if(p.state==='access_blocked') return this.state('access_blocked','access_message');
      if(p.state==='credential_error') return this.state('login_failed','credential_error');
      if(p.state!=='login_form') return this.state('unverified',({loading:'page_still_loading',unsupported_page:'unsupported_target_page',script_error:'page_probe_error',tab_missing:'target_tab_closed'})[p.diagnostic?.probe]||'page_not_confirmed');
      if(s.pendingAttempt) return this.state('login_failed','interrupted_attempt_requires_review',{pendingAttempt:false});
      const info=await this.io.native('status');
      if(info?.ok===false) return this.state('connection_error','local_host_or_browser_error');
      if(!info?.configured) return this.state('credentials_required','local_credentials_missing');
      if(!s.enabled) return this.state('login_required','automatic_login_disabled');
      // Only an explicit options-page action can authorize one more submission.
      // Current challenge/error evidence above and an interrupted attempt still stop it.
      if(s.blockedVersion===info.version && !manualRetry) return this.state('login_failed','retry_blocked_until_credentials_updated');
      if(s.lastAutoAt && this.io.now()-s.lastAutoAt<RETRY_INTERVAL && !manualRetry) return this.state('login_required','retry_cooldown');
      // Block before requesting the secret. An interrupted worker cannot resubmit it.
      await this.state('logging_in',manualRetry?'manual_attempt_started':'attempt_started',{lastAutoAt:this.io.now(),blockedVersion:info.version,pendingAttempt:true,submission:null});
      attemptArmed=true;
      let credential=null;
      try {
        credential=await this.io.native('read');
        if(!credential?.configured || credential.version!==info.version) return this.state('credentials_required','credentials_changed_during_attempt',{pendingAttempt:false,blockedVersion:''});
        submissionPossible=true;
        const result=await this.io.submit(tab.id,credential.username,credential.password);
        const reason=['login_input_changed','login_form_invalid','login_submit_not_observed'].includes(result?.reason)?result.reason:'login_form_changed';
        const submission={accountMatched:result?.accountMatched===true,submitObserved:result?.submitObserved===true};
        if(!result?.submitted) return this.state('login_failed',reason,{pendingAttempt:false,submission});
        await this.io.save({...await this.read(),submission});
      } finally { if(credential) { credential.password=''; credential.username=''; } credential=null; }
      for(let i=0;i<15;i++) {
        await this.io.sleep(2000); p=await probe();
        await this.noteProbe(p);
        if(p.state==='password_reminder_unresolved')return this.state('unverified','password_reminder_not_confirmed',{pendingAttempt:false});
        if(p.state==='authenticated') return this.state('connected',p.evidence==='supplier_dashboard_widgets'?'relogin_dashboard_confirmed':'relogin_confirmed',{blockedVersion:'',pendingAttempt:false});
        if(p.state==='verification') return this.state('verification_required','additional_verification',{pendingAttempt:false});
        if(p.state==='access_blocked') return this.state('access_blocked','access_message',{pendingAttempt:false});
        if(p.state==='credential_error') return this.state('login_failed','credential_error',{pendingAttempt:false});
      }
      return this.state('login_failed','login_not_confirmed',{pendingAttempt:false});
    } catch {
      return this.state('connection_error','local_host_or_browser_error',{pendingAttempt:false,...attemptArmed&&!submissionPossible?{blockedVersion:''}:{}});
    } finally { this.running=false; }
  }
}

// Serialized into the top-level official page. Positive authenticated evidence is required.
export function inspectSupplierPage() {
  const visible=e=>e && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && getComputedStyle(e).display!=='none';
  const text=(document.body?.innerText||'').replace(/\s+/g,' ');
  const compact=text.replace(/[\s\u200b-\u200d\ufeff]/g,'');
  const u=new URL(location.href);
  const password=[...document.querySelectorAll('input[type="password"]')].find(visible);
  const logoutElements=[...document.querySelectorAll('a,button,[role="button"]')].filter(e=>/^(로그아웃|logout|log out)$/i.test((e.innerText||e.getAttribute('aria-label')||'').trim()));
  const diagnostic={probe:'inspected',host:u.hostname==='supplier.coupang.com'?'supplier':u.hostname==='xauth.coupang.com'?'seller_auth':'other',view:/^\/dashboard\/KR\/?$/.test(u.pathname)?'dashboard':/\/login(?:\/|$)|\/login-actions\//.test(u.pathname)?'login':'other',visiblePassword:!!password,logoutPresent:logoutElements.length>0,logoutVisible:logoutElements.some(visible),requiredTasks:compact.includes('필수진행사항'),deliveryRate:compact.includes('납품률'),receivingIssues:compact.includes('입고기준미준수'),myshop:compact.includes('마이샵'),frameCount:document.querySelectorAll('iframe').length};
  const finish=(state,evidence)=>({state,...evidence?{evidence}:{},diagnostic});
  if(u.protocol!=='https:' || u.port || u.username || u.password) return finish('unverified');
  if(!['supplier.coupang.com','xauth.coupang.com'].includes(u.hostname)) return finish('unverified');
  if(/접근이 제한|접근이 차단|Access Denied|접속이 차단/i.test(text)) return finish('access_blocked');
  if(/자동.?입력.?방지|로봇이 아닙|보안.?문자|인증번호.{0,20}(입력|전송)|본인.?인증|Verify you are human/i.test(text) || [...document.querySelectorAll('iframe')].some(e=>visible(e)&&/captcha|challenge/i.test(e.src))) return finish('verification');
  if(/아이디.{0,20}비밀번호.{0,30}(일치하지|확인해|잘못)|Invalid username or password|비밀번호가.{0,15}(올바르지|틀렸|잘못)/i.test(text)) return finish('credential_error');
  if(u.origin==='https://supplier.coupang.com' && u.pathname==='/password-expiring' && !password &&
      compact.includes('90일간격으로비밀번호를변경하실것을권장합니다')) {
    diagnostic.view='password-reminder';
    return finish('password_reminder');
  }
  if(u.hostname==='xauth.coupang.com' && u.pathname.startsWith('/auth/realms/seller/') && password) {
    const form=password.form;
    const action=form?new URL(form.action||location.href):null;
    const username=form && [...form.querySelectorAll('input')].find(e=>visible(e)&&e!==password&&(/username|email|login/i.test(e.name||e.id)||e.autocomplete==='username'));
    const client=u.searchParams.get('client_id')||action?.searchParams.get('client_id');
    if(username && client==='supplier-hub' && action?.origin===u.origin && action.pathname.startsWith('/auth/realms/seller/')) return finish('login_form');
  }
  if(u.hostname==='supplier.coupang.com' && !password && !/\/login(?:\/|$)/.test(u.pathname)) {
    if(diagnostic.logoutVisible) return finish('authenticated','logout_control');
    // Observed Korean Supplier Hub dashboard: the account menu can hide Logout.
    // Require several rendered dashboard sections together, never the URL alone.
    const dashboard=/^\/dashboard\/KR\/?$/.test(u.pathname);
    if(dashboard && diagnostic.requiredTasks && diagnostic.deliveryRate && diagnostic.receivingIssues && diagnostic.myshop) return finish('authenticated','supplier_dashboard_widgets');
  }
  return finish('unverified');
}

// Serialized into the exact optional reminder page. Do not change passwords or
// follow arbitrary links, and do not dismiss mandatory verification screens.
export function postponeSupplierPasswordReminder() {
  const u=new URL(location.href);
  const visible=e=>e && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && getComputedStyle(e).display!=='none';
  const text=(document.body?.innerText||'').replace(/\s+/g,' '),compact=text.replace(/[\s\u200b-\u200d\ufeff]/g,'');
  if(u.origin!=='https://supplier.coupang.com'||u.username||u.password||u.pathname!=='/password-expiring'||
      !compact.includes('90일간격으로비밀번호를변경하실것을권장합니다')||
      [...document.querySelectorAll('input[type="password"]')].some(visible)||
      /접근이 제한|접근이 차단|Access Denied|접속이 차단|자동.?입력.?방지|로봇이 아닙|보안.?문자|인증번호.{0,20}(입력|전송)|본인.?인증|Verify you are human/i.test(text)||
      [...document.querySelectorAll('iframe')].some(e=>visible(e)&&/captcha|challenge/i.test(e.src)))return {clicked:false,reason:'reminder_not_verified'};
  const buttons=[...document.querySelectorAll('button')].filter(e=>visible(e)&&(e.innerText||'').trim()==='나중에 변경하기');
  if(buttons.length!==1||buttons[0].disabled||buttons[0].getAttribute?.('aria-disabled')==='true')return {clicked:false,reason:'reminder_button_unconfirmed'};
  buttons[0].click();return {clicked:true,reason:'password_reminder_postponed'};
}

export async function submitSupplierLogin(username,password) {
  const u=new URL(location.href);
  if(u.protocol!=='https:' || u.hostname!=='xauth.coupang.com' || u.port || !u.pathname.startsWith('/auth/realms/seller/')) return {submitted:false};
  const visible=e=>e && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && getComputedStyle(e).display!=='none';
  const text=(document.body?.innerText||'').replace(/\s+/g,' ');
  if(/접근이 제한|접근이 차단|Access Denied|자동.?입력.?방지|로봇이 아닙|보안.?문자|인증번호.{0,20}(입력|전송)|본인.?인증|Verify you are human/i.test(text) || [...document.querySelectorAll('iframe')].some(e=>visible(e)&&/captcha|challenge/i.test(e.src))) return {submitted:false};
  const pw=[...document.querySelectorAll('input[type="password"]')].find(visible);
  const form=pw?.form; if(!form) return {submitted:false};
  const action=new URL(form.action||location.href);
  if(action.origin!==u.origin || !action.pathname.startsWith('/auth/realms/seller/')) return {submitted:false};
  if((u.searchParams.get('client_id')||action.searchParams.get('client_id'))!=='supplier-hub') return {submitted:false};
  const accounts=[...form.querySelectorAll('input')].filter(e=>visible(e)&&e!==pw&&/username|email|login/i.test([e.name,e.id,e.autocomplete].join(' ')));
  const buttons=[...form.querySelectorAll('button,input[type="submit"]')].filter(e=>visible(e)&&!e.disabled&&e.type==='submit'&&/^(로그인|sign\s?in|log\s?in)$/i.test((e.innerText||e.value||'').trim()));
  if(accounts.length!==1 || buttons.length!==1 || !username || !password) return {submitted:false};
  const account=accounts[0],button=buttons[0];
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  for(const [element,value] of [[account,username],[pw,password]]) {
    setter.call(element,value); element.dispatchEvent(new Event('input',{bubbles:true})); element.dispatchEvent(new Event('change',{bubbles:true}));
  }
  // Allow framework input handlers and autofill to settle before trusting the DOM.
  await new Promise(resolve=>setTimeout(resolve,100));
  const accountMatched=account.value===username;
  const valuesMatched=accountMatched&&pw.value===password;
  username='';password='';
  if(!valuesMatched) return {submitted:false,reason:'login_input_changed',accountMatched,submitObserved:false};
  const currentAction=new URL(form.action||location.href);
  if(currentAction.origin!==action.origin||!currentAction.pathname.startsWith('/auth/realms/seller/')||(u.searchParams.get('client_id')||currentAction.searchParams.get('client_id'))!=='supplier-hub')return {submitted:false,reason:'login_form_invalid',accountMatched,submitObserved:false};
  // Observed official handlers use exactly one blank as the empty-input error.
  // A stale empty marker can survive synthetic events. Mirror only that rule,
  // after value equality, and preserve every other browser/custom constraint.
  for(const element of [account,pw]) {
    if(element.value.trim()&&element.validity?.customError&&element.validationMessage===' ')element.setCustomValidity('');
  }
  if(account.form!==form||pw.form!==form||button.form!==form||!visible(account)||!visible(pw)||!visible(button)||button.disabled||!form.checkValidity()) return {submitted:false,reason:'login_form_invalid',accountMatched,submitObserved:false};
  let submitObserved=false;
  const observe=()=>{submitObserved=true;};
  form.addEventListener('submit',observe,true);
  try {
    // Use the validated native form submission; a button click alone is not evidence.
    HTMLFormElement.prototype.requestSubmit.call(form,button);
  } finally {form.removeEventListener('submit',observe,true);}
  return {submitted:submitObserved,reason:submitObserved?'login_submit_dispatched':'login_submit_not_observed',accountMatched,submitObserved};
}
