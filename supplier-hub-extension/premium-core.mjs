import {probeSupplierTab, safeDiagnostic} from './auth-core.mjs';

export const PREMIUM_URL='https://supplier.coupang.com/rpd/web-v2/basic/rocket';
export function premiumUrl(url) {
  try {const u=new URL(url);return u.origin==='https://supplier.coupang.com' && !u.username && !u.password && /^\/rpd\/web-v2\/basic\/rocket\/?$/.test(u.pathname);} catch {return false;}
}

// Serialized into an official page. Return fixed observations, never business data.
export function inspectPremiumPage() {
  const visible=e=>!!(e && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && getComputedStyle(e).display!=='none');
  const compact=s=>(s||'').replace(/[\s\u200b-\u200d\ufeff]/g,'');
  const u=new URL(location.href),text=document.body?.innerText||'';
  const password=[...document.querySelectorAll('input[type="password"]')].some(visible);
  const marker=s=>/프리미엄데이터2\.0|premiumdata2\.0/i.test(compact(s));
  const heading=[...document.querySelectorAll('h1,h2,h3,[role="heading"]')].some(e=>visible(e) && !e.closest('nav,header,aside,[role="navigation"]') && marker(e.innerText));
  const routeMatch=u.protocol==='https:' && u.hostname==='supplier.coupang.com' && !u.port && !u.username && !u.password && /^\/rpd\/web-v2\/basic\/rocket\/?$/.test(u.pathname);
  const diagnostic={probe:'inspected',host:u.hostname==='supplier.coupang.com'?'supplier':u.hostname==='xauth.coupang.com'?'seller_auth':'other',view:'other',visiblePassword:password,routeMatch,premiumHeading:heading,premiumLabel:marker(text),frameCount:document.querySelectorAll('iframe').length};
  const finish=state=>({state,diagnostic});
  if(u.protocol!=='https:' || u.port || u.username || u.password || !['supplier.coupang.com','xauth.coupang.com'].includes(u.hostname)) return finish('unverified');
  if(/접근이 제한|접근이 차단|Access Denied|접속이 차단/i.test(text)) return finish('access_blocked');
  if(/자동.?입력.?방지|로봇이 아닙|보안.?문자|인증번호.{0,20}(입력|전송)|본인.?인증|Verify you are human/i.test(text) || [...document.querySelectorAll('iframe')].some(e=>visible(e)&&/captcha|challenge/i.test(e.src))) return finish('verification');
  if(password || u.hostname==='xauth.coupang.com' || /\/login(?:\/|$)/.test(u.pathname)) return finish('login_required');
  // The address or navigation label alone does not prove the page has rendered.
  return finish(routeMatch && heading?'page_confirmed':'unverified');
}

export function premiumReport(p,extensionVersion,checkedAt) {
  const diagnostic={...safeDiagnostic({...p?.diagnostic,extensionVersion})};
  for(const key of ['routeMatch','premiumHeading','premiumLabel']) diagnostic[key]=p?.diagnostic?.[key]===true;
  let status=['page_confirmed','login_required','verification','access_blocked'].includes(p?.state)?p.state:'unverified';
  if(status==='page_confirmed' && !(diagnostic.routeMatch && diagnostic.premiumHeading && diagnostic.host==='supplier' && diagnostic.probe==='inspected' && diagnostic.scheme==='https' && diagnostic.tabStatus==='complete' && !diagnostic.pendingOfficial && !diagnostic.visiblePassword)) status='unverified';
  const reason=status==='page_confirmed'?'premium_page_visible':status==='login_required'?'premium_login_required':status==='verification'?'premium_verification_required':status==='access_blocked'?'premium_access_message':({loading:'page_still_loading',unsupported_page:'unsupported_target_page',script_error:'page_probe_error',tab_missing:'target_tab_closed'})[diagnostic.probe]||'premium_page_not_confirmed';
  return {extensionVersion:diagnostic.extensionVersion,checkedAt:Number.isFinite(Date.parse(checkedAt))?new Date(checkedAt).toISOString():'',status,reason,observation:diagnostic};
}

export class PremiumViewer {
  constructor(io) {this.io=io;this.running=false;}
  async check(open=false) {
    if(this.running) return (await this.io.load())?.report||null;
    this.running=true;
    try {
      let saved=await this.io.load()||{},t=await this.io.tab(saved.tabId);
      if(open) {
        // Reuse only our own unchanged target tab; never replace the login monitor's tab.
        if(!t || t.pendingUrl || !premiumUrl(t.url)) {t=await this.io.open(PREMIUM_URL);saved={...saved,tabId:t.id};await this.io.save(saved);}
        else await this.io.activate(t.id);
      }
      const p=await probeSupplierTab(this.io,t?.id??saved.tabId);
      const report=premiumReport(p,this.io.extensionVersion,new Date(this.io.now()).toISOString());
      await this.io.save({...saved,report});return report;
    } catch {
      const report=premiumReport({state:'unverified',diagnostic:{probe:'script_error'}},this.io.extensionVersion,new Date(this.io.now()).toISOString());
      await this.io.save({...await this.io.load(),report});return report;
    } finally {this.running=false;}
  }
}
