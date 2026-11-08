import assert from 'node:assert/strict';
import vm from 'node:vm';
import {dismissSupplierNotice} from '../supplier-hub-extension/popup-core.mjs';
import {findSupplierDashboard,openSupplierTab} from '../supplier-hub-extension/tab-core.mjs';
import {SupplierConnector,DEFAULT_STATE} from '../supplier-hub-extension/auth-core.mjs';

async function fixture({origin='https://supplier.coupang.com',heading='[안내] 프리미엄데이터 프로모션',label='×',obscured=false,password=false,disabled=false,remains=false,duplicate=false}={}) {
  let clicks=0;
  const rect={left:100,top:100,right:800,bottom:600,width:700,height:500};
  const node=(text,r)=>({children:[],innerText:text,textContent:text,hidden:false,getClientRects(){return this.hidden?[]:[r];},getBoundingClientRect:()=>r,getAttribute:()=>null,querySelector:()=>null,contains(e){return e===this;},matches:s=>s==='input'});
  const body=node('dashboard '+heading,rect),box=node(heading,rect),title=node(heading,{...rect,height:30,bottom:130});
  const button=node(label,{left:750,top:110,right:780,bottom:140,width:30,height:30});
  title.parentElement=box;box.parentElement=body;button.disabled=disabled;
  button.click=()=>{clicks++;if(!remains){box.hidden=true;button.hidden=true;title.hidden=true;}};
  box.querySelectorAll=()=>duplicate?[button,{...button}]:[button];
  const doc={body,querySelectorAll:s=>s.startsWith('input')?(password?[node('',rect)]:[]):[title],elementFromPoint:()=>obscured?body:button};
  const run=vm.runInNewContext('('+dismissSupplierNotice.toString()+')',{location:{href:origin+'/dashboard/KR'},URL,document:doc,getComputedStyle:e=>({visibility:e.hidden?'hidden':'visible',display:e.hidden?'none':'block'}),setTimeout:fn=>{fn();return 0;}});
  return {result:await run(),clicks};
}
let r=await fixture();assert.equal(r.result.ok,true);assert.equal(r.result.closed,1);assert.equal(r.clicks,1);
for(const options of [{origin:'https://evil.test'},{password:true},{obscured:true},{disabled:true},{label:'프로모션 신청하기'},{duplicate:true}]){r=await fixture(options);assert.equal(r.result.ok,false);assert.equal(r.clicks,0);}
r=await fixture({remains:true});assert.equal(r.result.reason,'supplier_popup_still_open');assert.equal(r.clicks,1);
r=await fixture({heading:'인증번호 입력'});assert.equal(r.result.ok,false);assert.equal(r.clicks,0);
r=await fixture({heading:'전체 데이터 다운로드 내역'});assert.equal(r.result.ok,true);assert.equal(r.clicks,0,'Never close the export history dialog');

let created=[],opened=[];
const io={windows:async()=>[{id:3,type:'popup'},{id:4,type:'normal',focused:true}],createTab:async o=>{created.push(o);return {id:9,...o};},createWindow:async o=>{opened.push(o);return {tabs:[{id:10,pendingUrl:o.url}]};}};
assert.equal((await openSupplierTab(io,'https://supplier.coupang.com/')).windowId,4);assert.equal(opened.length,0);
io.windows=async()=>[{id:3,type:'popup'}];assert.equal((await openSupplierTab(io,'https://supplier.coupang.com/')).id,10);assert.equal(opened.length,1);assert.equal(created.length,1);
await assert.rejects(()=>openSupplierTab(io,'https://evil.test/'));assert.equal(opened.length,1);
const dashboard={id:22,url:'https://supplier.coupang.com/dashboard/KR',status:'complete'};
assert.equal((await findSupplierDashboard({query:async()=>[dashboard],probe:async()=>({state:'authenticated'})})).id,22);
assert.equal(await findSupplierDashboard({query:async()=>[dashboard],probe:async()=>({state:'verification'})}),null);
let saved={...DEFAULT_STATE,enabled:true,tabId:1};let submissions=0,opens=0;
const connector=new SupplierConnector({load:async()=>saved,save:async s=>{saved=s;},now:()=>Date.now(),tab:async()=>null,findExisting:async()=>dashboard,refresh:async()=>{},probe:async()=>({state:'authenticated'}),native:async()=>{submissions++;},open:async()=>{opens++;}});
assert.equal((await connector.check()).status,'connected');assert.equal(saved.tabId,22);assert.equal(opens,0);assert.equal(submissions,0);
console.log('Supplier notice close, guards, export-dialog preservation, browser-window recovery and authenticated-tab reuse passed.');
