import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const start=source.indexOf('  async function settleCardBenefitControl('),end=source.indexOf('\n  if(typeof cardAction',start);
async function settle({moving=false,blocked=false,outside=false,verifyOnly=false}={}) {
  let calls=0,waits=0;
  const context={innerWidth:1554,innerHeight:822,Promise,setTimeout(fn){waits++;fn();},locateCardBenefitControl:async(top,center,allowScroll)=>{
    calls++;assert.equal(center,!verifyOnly&&calls===1);assert.equal(allowScroll,!verifyOnly);
    return {point:blocked?null:{x:1406,y:outside?824:moving?(calls%2?400:430):400},debug:{reason:blocked?'row-info-candidate-obscured':'selected',selected:{label:'card-info'},rowRect:{top:380,bottom:420}}};
  }};
  vm.runInNewContext(source.slice(start,end)+';this.run=settleCardBenefitControl;',context);
  return {result:await context.run(250,verifyOnly),calls,waits};
}
let s=await settle();assert.equal(s.result.ok,true);assert.equal(s.calls,2);assert.equal(s.waits,1);
s=await settle({verifyOnly:true});assert.equal(s.result.ok,true);assert.equal(s.calls,1);assert.equal(s.waits,0);
for(const options of [{blocked:true},{moving:true},{outside:true}]){s=await settle(options);assert.equal(s.result.ok,false);assert.equal(s.calls,8);}
assert.equal((await settle({outside:true})).result.reason,'card-control-outside-viewport');

const a=source.indexOf('async function dispatchTrustedClickAndCapture('),b=source.indexOf('\nfunction parseDebuggerCardEvidence(',a);
async function dispatch({badPrepare=false,badVerify=false,shift=false,resize=false,afterFailure=false,attachFailure=false}={}) {
  const commands=[],order=[];let captures=0,detaches=0;
  const reply=(verify)=>({ok:!(verify?badVerify:badPrepare),reason:'product-identifiers-mismatch',identity:'card-info',point:{x:1406,y:verify&&shift?430:400},viewport:{width:1554,height:verify&&resize?780:822}});
  const context={readDisplayedPrice(){},withScanTimeout:async p=>p,wait:async()=>{},captureDebuggerText:async()=>{order.push('capture');if(++captures===2&&afterFailure)throw Error('private');return {};},chrome:{
    debugger:{attach:async()=>{order.push('attach');if(attachFailure)throw Error('private');},detach:async()=>{detaches++;},sendCommand:async(t,name,args)=>{order.push(name);commands.push({name,args});}},
    scripting:{executeScript:async o=>{const mode=o.args[5];order.push(mode);assert(o.args.every(v=>v!==undefined));assert.equal(o.args[0],'1');assert.equal(o.args[1],'2');assert.equal(o.args[2],'3');return [{result:reply(mode==='verify-card')}];}}
  }};
  vm.runInNewContext(source.slice(a,b)+';this.run=dispatchTrustedClickAndCapture;',context);
  const result=await context.run(7,{productId:'1',itemId:'2',vendorItemId:'3'});
  return {result,commands,order,detaches,presses:commands.filter(c=>c.args?.type==='mousePressed'),releases:commands.filter(c=>c.args?.type==='mouseReleased')};
}
let d=await dispatch();assert.equal(d.result.ok,true);assert.equal(d.presses.length,1);assert.equal(d.releases.length,1);assert.equal(d.presses[0].args.y,400,'Use the remeasured control, never the old 824px position');assert.equal(d.detaches,1);
assert(d.order.indexOf('prepare-card')>d.order.indexOf('Page.bringToFront'));
assert(d.order.indexOf('verify-card')>d.order.indexOf('capture'));
assert(d.order.indexOf('verify-card')<d.order.lastIndexOf('Input.dispatchMouseEvent'));
for(const options of [{badPrepare:true},{badVerify:true},{shift:true},{resize:true},{attachFailure:true}]){d=await dispatch(options);assert.equal(d.result.ok,false);assert.equal(d.presses.length,0);assert.equal(d.releases.length,0);}
d=await dispatch({afterFailure:true});assert.equal(d.result.ok,false);assert.equal(d.presses.length,1);assert.equal(d.releases.length,1);assert.equal(d.result.targetDiagnostic.pressAttempted,true);assert.equal(d.result.targetDiagnostic.clicked,true);assert.equal(JSON.stringify(d.result).includes('private'),false);
console.log('Card pre-click layout: stable/shifted/obscured/outside viewport, post-attach remeasurement, final identity/size check, single press/release and no replay after failure passed.');
