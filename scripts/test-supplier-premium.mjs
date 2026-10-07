import assert from 'node:assert/strict';
import {PremiumViewer,PREMIUM_URL,premiumUrl,inspectPremiumPage,premiumReport} from '../supplier-hub-extension/premium-core.mjs';

assert.equal(premiumUrl(PREMIUM_URL),true);
assert.equal(premiumUrl(PREMIUM_URL+'/?filter=private'),true);
for(const url of ['http://supplier.coupang.com/rpd/web-v2/basic/rocket',PREMIUM_URL.replace('supplier.coupang.com','supplier.coupang.com.evil.test'),PREMIUM_URL.replace('supplier.coupang.com','account@ supplier.coupang.com'),PREMIUM_URL.replace('supplier.coupang.com','supplier.coupang.com:444'),PREMIUM_URL+'/other','https://supplier.coupang.com/dashboard/KR']) assert.equal(premiumUrl(url),false);

const original={location:global.location,document:global.document,getComputedStyle:global.getComputedStyle};
try {
  let body='',hasPassword=false;
  global.location={href:PREMIUM_URL};global.getComputedStyle=()=>({visibility:'visible',display:'block'});
  const h={getClientRects:()=>[{}]};
  global.document={body:{get innerText(){return body;}},querySelectorAll:s=>s==='input[type="password"]'&&hasPassword?[h]:[]};
  assert.equal(inspectPremiumPage().state,'unverified','URL alone does not confirm rendering');
  body='애널리틱스 프리미엄 데이터 2.0';assert.equal(inspectPremiumPage().state,'page_opened','Opening a readable route does not require a matching heading');
  body='실제 업무 화면';assert.equal(inspectPremiumPage().state,'page_opened','No premium label is required');
  body='  \n  ';assert.equal(inspectPremiumPage().state,'unverified','A blank page is insufficient');
  body='실제 업무 화면';
  body+=' private-business-value company-account';assert.equal(JSON.stringify(inspectPremiumPage()).includes('private-business-value'),false);
  hasPassword=true;assert.equal(inspectPremiumPage().state,'login_required');hasPassword=false;
  for(const [text,state] of [['접근이 제한','access_blocked'],['보안 문자','verification']]){body=text;assert.equal(inspectPremiumPage().state,state);}
  body='';global.location.href='https://xauth.coupang.com/auth/realms/seller/';assert.equal(inspectPremiumPage().state,'login_required');
  global.location.href='https://supplier.coupang.com/dashboard/KR';assert.equal(inspectPremiumPage().state,'unverified');
  global.location.href='https://evil.test/rpd/web-v2/basic/rocket';assert.equal(inspectPremiumPage().state,'unverified');
} finally {Object.assign(global,original);}

function fixture(savedTab,initialTabs,results) {
  let saved={tabId:savedTab},tabs=[...initialTabs],i=0,opens=0,activations=0,inspections=0,wait=0;
  const io={extensionVersion:'0.1.6',now:()=>Date.parse('2026-10-07T04:30:00Z'),load:async()=>saved,save:async s=>{saved=structuredClone(s);},tab:async id=>id==null?null:tabs[Math.min(i++,tabs.length-1)],sleep:async ms=>{wait+=ms;},open:async url=>{assert.equal(url,PREMIUM_URL);opens++;return{id:18};},activate:async id=>{assert.equal(id,savedTab);activations++;},inspect:async()=>{const r=results[Math.min(inspections++,results.length-1)];if(r instanceof Error)throw r;return r;}};
  return {viewer:new PremiumViewer(io),io,get:()=>({saved,opens,activations,inspections,wait})};
}
const loaded={id:18,url:PREMIUM_URL,status:'complete'},good={state:'page_opened',diagnostic:{probe:'inspected',host:'supplier',routeMatch:true,bodyReadable:true}};
let f=fixture(null,[{url:'about:blank',pendingUrl:PREMIUM_URL,status:'loading'},loaded],[good]);
assert.equal((await f.viewer.check(true)).status,'page_opened');assert.equal(f.get().opens,1);assert.equal(f.get().inspections,1);assert.equal(f.get().wait,750);
assert.equal(f.get().saved.tabId,18);assert.equal(f.get().saved.report.observation.tabStatus,'complete');
f=fixture(18,[loaded],[good]);assert.equal((await f.viewer.check(true)).status,'page_opened');assert.equal(f.get().opens,0);assert.equal(f.get().activations,1);
f=fixture(18,[loaded],[{state:'login_required',diagnostic:{probe:'inspected',host:'seller_auth',visiblePassword:true}}]);assert.equal((await f.viewer.check()).status,'login_required');assert.equal(f.get().opens,0);
f=fixture(18,[null],[]);assert.equal((await f.viewer.check()).reason,'target_tab_closed');assert.equal(f.get().inspections,0);
f=fixture(18,[{id:18,url:'https://evil.test/',status:'complete'}],[]);assert.equal((await f.viewer.check()).reason,'unsupported_target_page');assert.equal(f.get().inspections,0);
f=fixture(18,[loaded],[new Error('private-business-value')]);assert.equal((await f.viewer.check()).reason,'page_probe_error');assert.equal(JSON.stringify(f.get().saved).includes('private-business-value'),false);
f=fixture(18,[loaded],[{state:'unverified',diagnostic:{probe:'inspected',routeMatch:true,bodyReadable:false}}]);assert.equal((await f.viewer.check()).status,'unverified');assert.equal(f.get().wait,15000);
f=fixture(null,[loaded],[good]);await Promise.all([f.viewer.check(true),f.viewer.check(true)]);assert.equal(f.get().opens,1,'Concurrent clicks must not open duplicate tabs');
assert.equal(premiumReport({state:'page_opened',diagnostic:{probe:'loading',routeMatch:true,bodyReadable:true}},'0.1.6','2026-10-07T04:30:00Z').status,'unverified','A claimed success without a loaded official document must be rejected');
const malicious={state:'private-business-value',diagnostic:{body:'private-business-value',username:'company-account',url:PREMIUM_URL+'?token=secret',bodyReadable:'private-business-value'}};
const report=premiumReport(malicious,'secret','private-business-value');assert.equal(report.checkedAt,'');assert.equal(report.extensionVersion,'');assert.equal(report.observation.bodyReadable,false);assert.equal(/private-business-value|company-account|token|secret/.test(JSON.stringify(report)),false);
console.log('Supplier premium page checks passed. No credentials, form submission, business data, or public upload.');
