export const ENTRY = 'https://supplier.coupang.com/';
export const CHECK_ALARM = 'supplier-session-check';
export const RETRY_INTERVAL = 60 * 60 * 1000;
export const DEFAULT_STATE = {enabled:false,status:'not_checked',reason:'',tabId:null,checkedAt:'',lastAutoAt:0,blockedVersion:'',pendingAttempt:false,events:[],diagnostic:null};

// Allow only fixed labels, boolean observations and bounded counts into saved diagnostics.
export function safeDiagnostic(raw={}) {
  const out={extensionVersion:/^\d+\.\d+\.\d+$/.test(raw.extensionVersion||'')?raw.extensionVersion:'',probe:['inspected','loading','tab_missing','unsupported_page','script_error','unavailable'].includes(raw.probe)?raw.probe:'unavailable',host:['supplier','seller_auth','other'].includes(raw.host)?raw.host:'other',view:['dashboard','login','other'].includes(raw.view)?raw.view:'other'};
  for(const key of ['visiblePassword','logoutPresent','logoutVisible','requiredTasks','deliveryRate','receivingIssues','myshop']) out[key]=raw[key]===true;
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
      await this.noteProbe(p);
      if(p.state==='authenticated') return this.state('connected',p.evidence==='supplier_dashboard_widgets'?'supplier_dashboard_confirmed':'supplier_session_confirmed',{pendingAttempt:false,blockedVersion:''});
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
        await this.noteProbe(p);
        if(p.state==='authenticated') return this.state('connected',p.evidence==='supplier_dashboard_widgets'?'relogin_dashboard_confirmed':'relogin_confirmed',{blockedVersion:'',pendingAttempt:false});
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
