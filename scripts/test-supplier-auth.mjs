import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SupplierConnector,DEFAULT_STATE,permittedUrl,RETRY_INTERVAL,inspectSupplierPage,submitSupplierLogin} from '../supplier-hub-extension/auth-core.mjs';
const official='https://xauth.coupang.com/auth/realms/seller/login-actions/authenticate?client_id=supplier-hub';
function fixture(states,extra={}) {
  let saved={...DEFAULT_STATE,enabled:true,tabId:7,...extra};let clock=RETRY_INTERVAL*2;let submits=0,reads=0,opens=0;
  let probes=[...states];let version='v1';
  const io={load:async()=>saved,save:async s=>{saved=structuredClone(s);},now:()=>clock,sleep:async ms=>{clock+=ms;},refresh:async()=>{},tab:async()=>({id:7,url:official}),open:async()=>{opens++;return{id:8};},probe:async()=>({state:probes.length>1?probes.shift():probes[0]}),native:async op=>{if(op==='status')return {ok:true,configured:true,version};reads++;return {configured:true,username:'test-user',password:'test-secret',version};},submit:async()=>{submits++;return{submitted:true};}};
  return {connector:new SupplierConnector(io),io,get:()=>({saved,submits,reads,opens}),states:s=>{probes=[...s];},version:v=>{version=v;},advance:ms=>{clock+=ms;}};
}
for(const url of ['http://supplier.coupang.com/','https://supplier.coupang.com.evil.test/','https://supplier.coupang.com@evil.test/','https://xauth.coupang.com/other/','https://supplier.coupang.com:444/']) assert.equal(permittedUrl(url),false,url);
assert.equal(permittedUrl(official),true);
let f=fixture(['authenticated']);assert.equal((await f.connector.check()).status,'connected');assert.equal(f.get().reads,0);
f=fixture(['authenticated']);let refreshes=0;f.io.tab=async()=>({id:7,url:'https://supplier.coupang.com/dashboard/KR'});f.io.refresh=async()=>{refreshes++;};await f.connector.check();assert.equal(refreshes,1);
for(const state of ['verification','access_blocked','unverified','credential_error']){f=fixture([state]);await f.connector.check();assert.equal(f.get().reads,0,state);assert.equal(f.get().submits,0,state);}
f=fixture(['login_form'],{enabled:false});assert.equal((await f.connector.check()).reason,'automatic_login_disabled');assert.equal(f.get().reads,0);
f=fixture(['login_form']);f.io.native=async()=>({configured:false});assert.equal((await f.connector.check()).status,'credentials_required');
f=fixture(['login_form']);f.io.native=async()=>({ok:false});assert.equal((await f.connector.check()).status,'connection_error');
f=fixture(['login_form','authenticated']);assert.equal((await f.connector.check()).reason,'relogin_confirmed');assert.equal(f.get().submits,1);
assert.equal(JSON.stringify(f.get().saved).includes('test-secret'),false);assert.equal(JSON.stringify(f.get().saved).includes('test-user'),false);
f=fixture(['login_form','credential_error']);assert.equal((await f.connector.check()).reason,'credential_error');f.states(['login_form']);f.advance(RETRY_INTERVAL*2);assert.equal((await f.connector.check()).reason,'retry_blocked_until_credentials_updated');assert.equal(f.get().submits,1);
f.version('v2');f.states(['login_form','authenticated']);assert.equal((await f.connector.check()).reason,'relogin_confirmed');assert.equal(f.get().submits,2);
f=fixture(['login_form','verification']);assert.equal((await f.connector.check()).status,'verification_required');assert.equal(f.get().submits,1);
f=fixture(['login_form'],{pendingAttempt:true,blockedVersion:'v1'});assert.equal((await f.connector.check()).reason,'interrupted_attempt_requires_review');assert.equal(f.get().submits,0);
f=fixture(['login_form'],{lastAutoAt:RETRY_INTERVAL*2-1000});assert.equal((await f.connector.check()).reason,'retry_cooldown');assert.equal(f.get().reads,0);
f=fixture(['login_form']);assert.equal((await f.connector.check()).reason,'login_not_confirmed');assert.equal(f.get().submits,1);
f=fixture(['login_form']);f.io.submit=async()=>({submitted:false});assert.equal((await f.connector.check()).reason,'login_form_changed');
f=fixture(['authenticated']);f.io.tab=async()=>({id:7,url:'https://evil.test/'});await f.connector.check();assert.equal(f.get().opens,1);assert.equal(f.get().reads,0);
// Concurrent manual/alarm invocations cannot submit a second password.
f=fixture(['login_form','authenticated']);await Promise.all([f.connector.check(),f.connector.check()]);assert.equal(f.get().submits,1);

// Exercise actual injected functions using a minimal official login DOM.
const original={location:global.location,document:global.document,getComputedStyle:global.getComputedStyle,HTMLInputElement:global.HTMLInputElement};
try {
  const input=extra=>({getClientRects:()=>[{}],dispatchEvent:()=>{},...extra});
  const account=input({name:'username'}),password=input({type:'password'});let clicks=0;
  const button={getClientRects:()=>[{}],disabled:false,innerText:'로그인',click:()=>{clicks++;}};
  const form={action:official,querySelectorAll:s=>s==='input'?[account,password]:[button]};password.form=form;
  global.location={href:official};global.getComputedStyle=()=>({display:'block',visibility:'visible'});
  global.HTMLInputElement=function(){};Object.defineProperty(global.HTMLInputElement.prototype,'value',{set(value){this.valueWritten=value;}});
  let body='';global.document={body:{get innerText(){return body;}},querySelectorAll:s=>s==='input[type="password"]'?[password]:[]};
  assert.equal(inspectSupplierPage().state,'login_form');assert.equal(submitSupplierLogin('test-user','test-secret').submitted,true);assert.equal(clicks,1);
  body='보안 문자';assert.equal(inspectSupplierPage().state,'verification');assert.equal(submitSupplierLogin('test-user','test-secret').submitted,false);
  body='';form.action='https://evil.test/';assert.equal(inspectSupplierPage().state,'unverified');assert.equal(submitSupplierLogin('test-user','test-secret').submitted,false);
  form.action=official.replace('supplier-hub','other-client');global.location.href=form.action;assert.equal(inspectSupplierPage().state,'unverified');assert.equal(submitSupplierLogin('test-user','test-secret').submitted,false);
  form.action=official;global.location.href='https://evil.test/';assert.equal(submitSupplierLogin('test-user','test-secret').submitted,false);
  global.location.href='https://supplier.coupang.com/dashboard/KR';global.document.querySelectorAll=s=>s==='a,button,[role="button"]'?[{getClientRects:()=>[{}],innerText:'로그아웃'}]:[];assert.equal(inspectSupplierPage().state,'authenticated');
  global.document.querySelectorAll=()=>[];
  body='';assert.equal(inspectSupplierPage().state,'unverified','Dashboard URL alone is insufficient');
  const sections=['필수진행사항 (90)','납품률','입고기준 미준수','마이샵'];
  body=sections.join(' ');assert.equal(inspectSupplierPage().evidence,'supplier_dashboard_widgets');
  for(let i=0;i<sections.length;i++){body=sections.filter((_,j)=>i!==j).join(' ');assert.equal(inspectSupplierPage().state,'unverified','Missing dashboard section must remain unverified');}
  body=sections.join(' ');global.location.href='https://supplier.coupang.com/login';assert.equal(inspectSupplierPage().state,'unverified');
  global.location.href='https://evil.test/dashboard/KR';assert.equal(inspectSupplierPage().state,'unverified');
  global.location.href='https://supplier.coupang.com/dashboard/KR';
  for(const [phrase,state] of [['보안 문자','verification'],['접근이 제한','access_blocked'],['Invalid username or password','credential_error']]){body=sections.join(' ')+' '+phrase;assert.equal(inspectSupplierPage().state,state);}
  body=sections.join(' ');global.document.querySelectorAll=s=>s==='input[type="password"]'?[password]:[];assert.equal(inspectSupplierPage().state,'unverified','Visible login form excludes dashboard recognition');
  f=fixture(['authenticated'],{pendingAttempt:true,blockedVersion:'v1'});f.io.probe=async()=>({state:'authenticated',evidence:'supplier_dashboard_widgets'});assert.equal((await f.connector.check()).reason,'supplier_dashboard_confirmed');assert.equal(f.get().submits,0);assert.equal(f.get().saved.blockedVersion,'');
} finally {Object.assign(global,original);}
const manifest=JSON.parse(readFileSync(new URL('../supplier-hub-extension/manifest.json',import.meta.url)));
const id=[...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16)].map(b=>String.fromCharCode(97+(b>>4),97+(b&15))).join('');
assert.equal(manifest.permissions.includes('cookies'),false);assert.equal(manifest.permissions.includes('debugger'),false);assert.equal(manifest.permissions.includes('nativeMessaging'),true);
console.log('Supplier auth checks passed. Separate extension ID: '+id);
