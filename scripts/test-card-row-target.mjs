import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const start=source.indexOf('  async function locateCardBenefitControl('),end=source.indexOf('\n  let cardDiscount=null;',start);
assert.ok(start>0&&end>start);
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
class Element {
  constructor(tag,text,bounds,attrs={}){Object.assign(this,{tagName:tag.toUpperCase(),text,bounds,attrs,children:[],parentElement:null,className:attrs.class||'',hidden:false});}
  add(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}return this;}
  get innerText(){return this.text+this.children.map(n=>n.innerText||n.nodeValue||'').join(' ');}
  get textContent(){return this.innerText;}
  getBoundingClientRect(){return this.bounds;}
  getAttribute(key){return this.attrs[key]||null;}
  contains(n){return n===this||this.children.some(c=>c instanceof Element&&c.contains(n));}
  matches(selector){
    if(selector==='div,li,p,span,strong')return /^(DIV|LI|P|SPAN|STRONG)$/.test(this.tagName);
    if(selector==='button,a,[role="button"],[onclick]')return /^(BUTTON|A)$/.test(this.tagName)||this.attrs.role==='button'||Boolean(this.attrs.onclick);
    return /^(SVG|I|BUTTON|A)$/.test(this.tagName)||this.attrs.role==='button'||Boolean(this.attrs['aria-label']||this.attrs.title||this.attrs['data-tooltip']||this.attrs.onclick)||/info|tooltip|icon/.test(this.className);
  }
  closest(selector){for(let n=this;n;n=n.parentElement)if(n instanceof Element&&n.matches(selector))return n;return null;}
  descendants(){return this.children.flatMap(n=>n instanceof Element?[n,...n.descendants()]:[]);}
  querySelectorAll(selector){return this.descendants().filter(n=>n.matches(selector));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  scrollIntoView(){this.scrolled=true;}
}
function textNode(value,parent,rects){const n={nodeValue:value,parentElement:parent,rects};parent.children.push(n);return n;}
function fixture({side='right',wrap=false,cash=false,ambiguous=false,hidden=false,obscured=false,noWow=false,huge=false,outside=false}={}){
  const body=new Element('div','',rect(0,0,1000,1000));
  const panel=new Element('div','',rect(20,32,874,819));body.add(panel);
  const row=new Element('div','',rect(40,280,560,wrap?120:60));panel.add(row);
  const label=new Element('span','',rect(150,292,330,wrap?60:22));row.add(label);
  textNode('최대 3% 카드 ',label,[rect(150,292,90,20)]);
  textNode('즉시할인 (신한, BC)',label,[rect(240,292,160,20)]);
  if(!noWow)textNode(' 와우 전용',label,wrap?[rect(460,292,24,20),rect(150,324,24,20)]:[rect(420,292,70,20)]);
  const icon=new Element('button','',rect(side==='left'?100:side==='below'?170:520,side==='below'?358:292,20,20),{'aria-label':'카드 할인 상세 정보'});
  icon.add(new Element('svg','',icon.bounds));icon.hidden=hidden;
  (outside?panel:row).add(icon);
  if(ambiguous)row.add(new Element('i','ⓘ',rect(560,292,18,18)));
  if(cash){const other=new Element('div','쿠팡캐시 적립',rect(40,410,560,40));other.add(new Element('button','',rect(520,420,20,20),{'aria-label':'적립 상세 정보'}));panel.add(other);}
  if(huge){row.bounds=rect(20,32,874,819);label.bounds=rect(20,32,874,819);}
  const all=[body,...body.descendants()];
  const context={Math,Number,Boolean,Promise,NodeFilter:{SHOW_TEXT:4},scrollY:0,innerHeight:1000,setTimeout:f=>{f();return 1;},
    getComputedStyle:n=>({display:n.hidden?'none':'block',visibility:'visible'}),
    document:{querySelectorAll:s=>all.filter(n=>n.matches(s)),
      createTreeWalker(root){const nodes=[];const walk=n=>{for(const c of n.children||[])c instanceof Element?walk(c):nodes.push(c);};walk(root);let i=0;return {nextNode:()=>nodes[i++]||null};},
      createRange(){let a,b;return {setStart(n){a=n;},setEnd(n){b=n;},getClientRects(){if(a===b)return a.rects;return [...a.rects,...b.rects];}};},
      elementsFromPoint(x,y){if(obscured)return [panel];return all.filter(n=>!n.hidden&&x>=n.bounds.left&&x<=n.bounds.right&&y>=n.bounds.top&&y<=n.bounds.bottom).reverse();}
    }};
  vm.runInNewContext(source.slice(start,end)+';this.locate=locateCardBenefitControl;',context);
  return {context,icon,row};
}
async function check(options){const f=fixture(options);return {...f,result:await f.context.locate(250)};}
for(const side of ['left','right','below']){
  const {result,row,icon}=await check({side,wrap:side==='below',cash:true});
  assert.equal(result.debug.reason,'selected',side);
  assert.deepEqual(JSON.parse(JSON.stringify(result.point)),{x:icon.bounds.left+10,y:icon.bounds.top+10});
  assert.equal(result.debug.rowRect.bottom,row.bounds.bottom);
  assert.doesNotMatch(result.summaryText,/적립/,'must not absorb the other benefit or 819px panel');
  assert.equal(result.debug.candidates.length,1,'SVG + clickable wrapper is one control');
}
const wrapped=await check({side:'below',wrap:true});
assert.equal(wrapped.result.debug.wowRects.length,2,'wrapped text must use separate line rectangles');
assert.equal((await check({noWow:true})).result.debug.reason,'selected','card row must not depend on a Wow label');
assert.equal((await check({ambiguous:true})).result.debug.reason,'ambiguous-row-info-candidates');
assert.equal((await check({hidden:true})).result.point,null);
assert.equal((await check({obscured:true})).result.debug.reason,'row-info-candidate-obscured');
assert.equal((await check({outside:true})).result.point,null,'outside sibling cannot supply an icon, even at nearby coordinates');
assert.equal((await check({huge:true})).result.debug.reason,'card-row-not-isolated');
console.log('Card row isolation, left/right/below, wrapped fragments, split text, adjacent rewards, ambiguity, occlusion and oversized panels passed.');
