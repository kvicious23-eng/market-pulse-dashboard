import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';

const source=readTestFile('chrome-extension/background.js','utf8');
const start=source.indexOf('async function prepareProductForCheckout(');
const end=source.indexOf('\n\nfunction readCheckoutDiscounts(',start);
assert.ok(start>=0&&end>start);

function fixture({popup=false,close=true,ambiguous=false,stuck=false,unrelated=false,mismatch=false,obscured=false,quantity=1,care=false,disabled=false,preexisting=false,noCardClick=false}={}) {
  let closes=0,buys=0,shown=popup,scrolls=0;
  const rect={left:20,top:20,width:100,height:30};
  const closeButton={innerText:'',className:'card-close',getAttribute:key=>key==='aria-label'?'닫기':null,getBoundingClientRect:()=>rect,contains:()=>false,
    click(){closes++;if(!stuck)shown=false;}};
  const otherClose={...closeButton,className:'other-close'};
  const root={innerText:unrelated?'배송 안내':'카드 할인한도 최대 20,000원',getBoundingClientRect:()=>rect,matches:()=>true,
    querySelectorAll:()=>close?(ambiguous?[closeButton,otherClose]:[closeButton]):[]};
  const buy={innerText:'바로구매',className:'buy',disabled,getAttribute:()=>null,getBoundingClientRect:()=>rect,
    scrollIntoView(){scrolls++;},contains:()=>false,click(){buys++;}};
  const context={URL,Date,Promise,__marketPulseBeforeCard:noCardClick?undefined:new WeakSet(preexisting?[root]:[]),location:{href:'https://www.coupang.com/vp/products/1?itemId='+(mismatch?'9':'2')+'&vendorItemId=3'},
    setTimeout:fn=>{fn();return 1;},getComputedStyle:node=>({display:node===root||node===closeButton||node===otherClose?(shown?'block':'none'):'block',visibility:'visible',opacity:'1',position:'fixed'}),
    document:{querySelectorAll(selector){
      if(selector.startsWith('[role="dialog"]'))return [root];
      if(selector.startsWith('input[type="number"]'))return [{value:quantity,getBoundingClientRect:()=>rect}];
      if(selector.startsWith('input[type="radio"]'))return care?[{closest:()=>({innerText:'안심케어 가입'})}]:[];
      if(selector==='button,a,[role="button"]')return [buy];
      throw Error('Unexpected selector '+selector);
    },elementFromPoint:()=>obscured?root:buy},
    chrome:{runtime:{sendMessage:async()=>{}}}};
  vm.runInNewContext(source.slice(start,end)+';this.prepare=prepareProductForCheckout;this.enter=enterCheckoutDiagnostic;',context);
  return {context,count:()=>({closes,buys,scrolls})};
}

let f=fixture({popup:true});
assert.equal((await f.context.prepare('1','2','3')).ok,true);
assert.equal(f.count().closes,1);assert.equal(f.count().buys,0);
assert.equal(f.context.enter('1','2','3').ok,true);assert.equal(f.count().buys,1);assert.equal(f.count().scrolls,0);
for(const options of [{},{popup:true,unrelated:true},{popup:true,preexisting:true},{popup:true,noCardClick:true}]) {
  f=fixture(options);assert.equal((await f.context.prepare('1','2','3')).ok,true);assert.equal(f.count().closes,0,'Unrelated dialogs cannot supply a close control');
}
for(const options of [{popup:true,close:false},{popup:true,ambiguous:true},{popup:true,stuck:true},{popup:true,mismatch:true}]) {
  f=fixture(options);assert.equal((await f.context.prepare('1','2','3')).ok,false);assert.equal(f.count().buys,0);assert.ok(f.count().closes<=1,'A failed close is never replayed');
}
for(const [options,reason] of [[{mismatch:true},'product-identifiers-mismatch'],[{obscured:true},'buy-now-button-obscured'],[{quantity:2},'quantity-is-not-one'],[{care:true},'care-option-selected'],[{disabled:true},'buy-now-button-sold-out']]) {
  f=fixture(options);assert.equal(f.context.enter('1','2','3').reason,reason);assert.equal(f.count().buys,0);
}
f=fixture();f.context.location.href='https://evil.test/vp/products/1?itemId=2&vendorItemId=3';
assert.equal((await f.context.prepare('1','2','3')).ok,false);assert.equal(f.context.enter('1','2','3').ok,false);
// Wire both normal and access retry passes to the tab that supplied prices.
assert.match(source,/collectCheckoutDiscountsForTarget\(target,scanWindowState,trace,tab\)/);
assert.match(source,/collectCheckoutDiscountsForTarget\(result,scanWindowState,trace,retryTab\)/);
console.log('Real injected preparation: card-scoped single dismissal, no/other popup, ambiguity/stuck/identity rejection, and buy visibility/quantity/care/sold-out/origin checks passed.');
