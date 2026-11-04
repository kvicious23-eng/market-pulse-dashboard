import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const start=source.indexOf('async function settleBuyButton('),end=source.indexOf('\n\nasync function collectCheckoutDiscountsForTarget',start);
async function probe({blocked=false,moving=false,partial=false,mismatch=false,disabled=false,missing=false}={}){
 let ticks=0,scrolls=0,clicks=0;
 const button={innerText:'바로구매',className:'buy',disabled,getAttribute:()=>null,contains:()=>false,click(){clicks++;},scrollIntoView(options){scrolls++;assert.equal(options.inline,'center');},getBoundingClientRect:()=>({left:partial?780:20,top:moving&&ticks<3?500-ticks*20:30,width:200,height:40})};
 const context={URL,Promise,innerWidth:800,innerHeight:600,location:{href:'https://www.coupang.com/vp/products/1?itemId='+(mismatch?'9':'2')+'&vendorItemId=3'},setTimeout(fn){ticks++;fn();},getComputedStyle:()=>({display:'block',visibility:'visible'}),document:{querySelectorAll:()=>missing?[]:[button],elementFromPoint(x,y){assert(x>=0&&x<800&&y>=0&&y<600);return blocked?{tagName:'DIV',className:'overlay'}:button;}}};
 vm.runInNewContext(source.slice(start,end)+';this.settle=settleBuyButton;',context);
 const result=await context.settle('1','2','3');assert.equal(clicks,0,'Settling never purchases');return {result,ticks,scrolls};
}
for(const options of [{},{partial:true},{moving:true}]){const p=await probe(options);assert.equal(p.result.ok,true);assert(p.ticks>=2);assert.equal(p.scrolls,1);}
const blocked=await probe({blocked:true});assert.equal(blocked.result.reason,'buy-now-button-obscured');assert.equal(blocked.ticks,8);assert.equal(blocked.result.viewport.blocker.className,'overlay');
assert.equal((await probe({mismatch:true})).result.reason,'product-identifiers-mismatch');
assert.equal((await probe({disabled:true})).result.reason,'buy-now-button-sold-out');
assert.equal((await probe({missing:true})).result.reason,'buy-now-button-not-found');
console.log('Actual layout injection: stable/moving/clipped button, bounded overlay rejection, identity/sold-out/missing guards, zero clicks passed.');
