import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const helper=source.slice(source.indexOf('async function prepareWhaleScanWindow('),source.indexOf('// Observe only enrolled product tabs;'));
const state={windowId:null,anchorTabIds:[]},events=[];
let minimized=false,zero=false,creates=0;
const context={Number,Date,Map,navigator:{userAgent:'Whale/5'},accessDiagnosticTabs:new Map(),
 withScanTimeout:async p=>p,withTabEditRetry:async op=>op(),wait:async()=>{},
 chrome:{windows:{
 create:async options=>{assert.equal(options.type,'normal');assert.equal(options.width,1280);assert.equal(options.height,900);creates++;return {id:50,tabs:[{id:99}]};},
 get:async id=>{assert.equal(id,50);return {id,state:minimized?'minimized':'normal'};},
 update:async(id,options)=>{assert.equal(id,50);assert.equal(options.state,'normal');minimized=false;events.push('restore');}
 },tabs:{create:async options=>{assert.equal(options.windowId,50);return {id:100,windowId:50};},get:async()=>({windowId:50})},
 scripting:{executeScript:async()=>{events.push('measure');return [{result:{width:zero||minimized?0:1222,height:zero||minimized?0:777}}];}}
 }};
vm.runInNewContext(helper+';this.prepare=prepareWhaleScanWindow;this.ensure=ensureWhaleTabViewport;this.open=openScanTab;',context);
await context.open('https://www.coupang.com/vp/products/1','product',state);
assert.equal(creates,1);assert.deepEqual(state.anchorTabIds,[99]);
minimized=true;await context.open('https://www.coupang.com/vp/products/2','next-product',state);
assert.equal(creates,1,'Do not create one window per product');assert.equal(minimized,false);
minimized=true;events.length=0;const viewport=await context.ensure(100);
assert.deepEqual(events,['restore','measure']);assert.equal(viewport.width,1222);
zero=true;await assert.rejects(context.ensure(100),/whale-viewport-unavailable/);
assert.equal(events.filter(x=>x==='measure').length,6,'Five bounded checks after the prior successful one');
context.navigator.userAgent='Chrome/150';events.length=0;
assert.equal(await context.ensure(100),null);await context.prepare({windowId:null,anchorTabIds:[]});assert.equal(events.length,0);assert.equal(creates,1,'Chrome must not acquire a Whale window');
assert.match(source,/collectCheckoutDiscountsForTarget\(target,scanWindowState\)/);
assert.match(source,/checkoutViewport=await ensureWhaleTabViewport\(checkoutTab.id\)/);
assert.match(source,/if\(viewport\)scan.viewport=viewport/);
console.log('Dedicated Whale window, pinned product/checkout tabs, minimized restore before DOM read, bounded 0x0 failure and Chrome isolation passed.');
