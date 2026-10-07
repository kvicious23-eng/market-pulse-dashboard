export const ENTRY = 'https://supplier.coupang.com/';
export const CHECK_ALARM = 'supplier-session-check';
export const RETRY_INTERVAL = 60 * 60 * 1000;
export const DEFAULT_STATE = {enabled:false,status:'not_checked',reason:'',tabId:null,checkedAt:'',lastAutoAt:0,blockedVersion:'',pendingAttempt:false,events:[]};

export function permittedUrl(url) {
  try {
    const u=new URL(url);
    return u.protocol==='https:' && !u.username && !u.password && !u.port &&
      (u.hostname==='supplier.coupang.com' || (u.hostname==='xauth.coupang.com' && u.pathname.startsWith('/auth/realms/seller/')));
  } catch { return false; }
}

// Never persist page text, account names, URLs, cookies, tokens, or credentials.
export class SupplierConnector {
  constructor(io) { this.io=io; this.running=false; }
  async read() { return {...DEFAULT_STATE,...await this.io.load()}; }
  async state(status,reason,extra={}) {
    const old=await this.read(); const at=new Date(this.io.now()).toISOString();
    const next={...old,...extra,status,reason,checkedAt:at};
    next.events=[...(old.events||[]),{at,status,reason}].slice(-50);
    await this.io.save(next); return next;
  }
  async check() {
    if(this.running) return this.read();
    this.running=true;
    try {
      let s=await this.read();
      let tab=await this.io.tab(s.tabId);
      let opened=false;
      // A replaced or navigated tab is not used as a credential destination.
      if(!tab || !permittedUrl(tab.url)) {
        tab=await this.io.open(ENTRY);
        opened=true;
        s=await this.state('checking','opening_supplier',{tabId:tab.id});
      }
      // Verify a fresh Supplier response, rather than an old authenticated DOM.
      // Only the connector's own tab is refreshed; xauth challenge/login pages are left in place.
      if(!opened && new URL(tab.url||ENTRY).hostname==='supplier.coupang.com') await this.io.refresh(tab.id);
      let p=await this.io.probe(tab.id);
      if(p.state==='authenticated') return this.state('connected','supplier_session_confirmed',{pendingAttempt:false,blockedVersion:''});
      if(p.state==='verification') return this.state('verification_required','additional_verification');
      if(p.state==='access_blocked') return this.state('access_blocked','access_message');
      if(p.state==='credential_error') return this.state('login_failed','credential_error');
      if(p.state!=='login_form') return this.state('unverified','page_not_confirmed');
      if(s.pendingAttempt) return this.state('login_failed','interrupted_attempt_requires_review',{pendingAttempt:false});
      const info=await this.io.native('status');
      if(info?.ok===false) return this.state('connection_error','local_host_or_browser_error');
      if(!info?.configured) return this.state('credentials_required','local_credentials_missing');
      if(!s.enabled) return this.state('login_required','automatic_login_disabled');
      if(s.blockedVersion===info.version) return this.state('login_failed','retry_blocked_until_credentials_updated');
      if(s.lastAutoAt && this.io.now()-s.lastAutoAt<RETRY_INTERVAL) return this.state('login_required','retry_cooldown');
      // Block before requesting the secret. An interrupted worker cannot resubmit it.
      await this.state('logging_in','attempt_started',{lastAutoAt:this.io.now(),blockedVersion:info.version,pendingAttempt:true});
      let credential=null;
      try {
        credential=await this.io.native('read');
        if(!credential?.configured || credential.version!==info.version) return this.state('credentials_required','credentials_changed_during_attempt',{pendingAttempt:false});
        const result=await this.io.submit(tab.id,credential.username,credential.password);
        if(!result?.submitted) return this.state('login_failed','login_form_changed',{pendingAttempt:false});
      } finally { if(credential) { credential.password=''; credential.username=''; } credential=null; }
      for(let i=0;i<15;i++) {
        await this.io.sleep(2000); p=await this.io.probe(tab.id);
        if(p.state==='authenticated') return this.state('connected','relogin_confirmed',{blockedVersion:'',pendingAttempt:false});
        if(p.state==='verification') return this.state('verification_required','additional_verification',{pendingAttempt:false});
        if(p.state==='access_blocked') return this.state('access_blocked','access_message',{pendingAttempt:false});
        if(p.state==='credential_error') return this.state('login_failed','credential_error',{pendingAttempt:false});
      }
      return this.state('login_failed','login_not_confirmed',{pendingAttempt:false});
    } catch {
      return this.state('connection_error','local_host_or_browser_error',{pendingAttempt:false});
    } finally { this.running=false; }
  }
}

// Serialized into the top-level official page. Positive authenticated evidence is required.
export function inspectSupplierPage() {
  const visible=e=>e && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && getComputedStyle(e).display!=='none';
  const text=(document.body?.innerText||'').replace(/\s+/g,' ');
  const u=new URL(location.href);
  if(u.protocol!=='https:' || u.port || u.username || u.password) return {state:'unverified'};
  if(!['supplier.coupang.com','xauth.coupang.com'].includes(u.hostname)) return {state:'unverified'};
  if(/접근이 제한|접근이 차단|Access Denied|접속이 차단/i.test(text)) return {state:'access_blocked'};
  if(/자동.?입력.?방지|로봇이 아닙|보안.?문자|인증번호.{0,20}(입력|전송)|본인.?인증|Verify you are human/i.test(text) || [...document.querySelectorAll('iframe')].some(e=>visible(e)&&/captcha|challenge/i.test(e.src))) return {state:'verification'};
  if(/아이디.{0,20}비밀번호.{0,30}(일치하지|확인해|잘못)|Invalid username or password|비밀번호가.{0,15}(올바르지|틀렸|잘못)/i.test(text)) return {state:'credential_error'};
  const password=[...document.querySelectorAll('input[type="password"]')].find(visible);
  if(u.hostname==='xauth.coupang.com' && u.pathname.startsWith('/auth/realms/seller/') && password) {
    const form=password.form;
    const action=form?new URL(form.action||location.href):null;
    const username=form && [...form.querySelectorAll('input')].find(e=>visible(e)&&e!==password&&(/username|email|login/i.test(e.name||e.id)||e.autocomplete==='username'));
    const client=u.searchParams.get('client_id')||action?.searchParams.get('client_id');
    if(username && client==='supplier-hub' && action?.origin===u.origin && action.pathname.startsWith('/auth/realms/seller/')) return {state:'login_form'};
  }
  if(u.hostname==='supplier.coupang.com' && !password && !/\/login(?:\/|$)/.test(u.pathname)) {
    const logout=[...document.querySelectorAll('a,button,[role="button"]')].some(e=>visible(e)&&/^(로그아웃|logout|log out)$/i.test((e.innerText||e.getAttribute('aria-label')||'').trim()));
    if(logout) return {state:'authenticated'};
  }
  return {state:'unverified'};
}

export function submitSupplierLogin(username,password) {
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
  const account=[...form.querySelectorAll('input')].find(e=>visible(e)&&e!==pw&&(/username|email|login/i.test(e.name||e.id)||e.autocomplete==='username'));
  const button=[...form.querySelectorAll('button,input[type="submit"]')].find(e=>visible(e)&&!e.disabled&&/로그인|sign.?in|log.?in/i.test(e.innerText||e.value||e.id||''));
  if(!account || !button || !username || !password) return {submitted:false};
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  for(const [element,value] of [[account,username],[pw,password]]) {
    setter.call(element,value); element.dispatchEvent(new Event('input',{bubbles:true})); element.dispatchEvent(new Event('change',{bubbles:true}));
  }
  username=''; password=''; button.click(); return {submitted:true};
}
