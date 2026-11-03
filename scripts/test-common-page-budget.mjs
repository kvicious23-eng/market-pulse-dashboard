import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/common-primary.js','utf8');
let clock=0;const timers=[];
const c={Date:{now:()=>clock},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{}};
vm.runInNewContext(source.slice(0,source.indexOf('(async()=>'))+';this.bound=bounded;',c);
async function timeout(at,cleanup=false){
 clock=at;const p=c.bound(()=>new Promise(()=>{}),10000,cleanup);const timer=timers.at(-1);timer.fn();
 await assert.rejects(p,/primary-api-timeout/);return timer.ms;
}
assert.equal(await timeout(0),10000);
assert.ok(await timeout(29500)<=500,'Late operations share the original page budget');
clock=31000;const count=timers.length;await assert.rejects(c.bound(()=>new Promise(()=>{})),/primary-api-timeout/);assert.equal(timers.length,count,'Expired page cannot start another timer window');
let started=0;await assert.rejects(c.bound(()=>{started++;return Promise.resolve();}),/primary-api-timeout/);assert.equal(started,0,'Expired page cannot issue an API before checking the budget');
assert.equal(await timeout(31000,true),2000,'Own-tab cleanup retains a separate bounded chance after expiry');
console.log('One-shot page uses one total API budget and a separate bounded cleanup allowance.');

// Exercise the real page: a slow worker reply must not issue a new download
// after the shared deadline. Cleanup may still close this page's own tab.
clock=0;let downloads=0,closed=0;
const requestId='a'.repeat(32),nonce='b'.repeat(32),slot='2026-11-03T16:00+09:00';
const page={URLSearchParams,Date:{now:()=>clock},setTimeout:()=>1,clearTimeout:()=>{},
 location:{search:`?requestId=${requestId}&nonce=${nonce}&slot=${encodeURIComponent(slot)}&mode=probe`},
 navigator:{userAgent:'Chrome'},windowsPrimaryProtocol:()=> 'windows-primary-v2',scanPolicyForSlot:()=>({browser:'chrome'}),scanSlotKey:()=> '202611031600',
 fetch:async()=>({json:async()=>({version:1,requestId,scanSlot:slot,browser:'chrome',primaryProtocolId:'windows-primary-v2',policyId:'p',targets:[]})}),
 chrome:{runtime:{getURL:x=>x,getManifest:()=>({version:'1.9.64'}),sendMessage:async()=>{await Promise.resolve();clock=31000;return {ok:true};}},
 downloads:{download:async()=>{downloads++;return 1;}},tabs:{getCurrent:async()=>({id:7}),remove:async()=>{closed++;}}}};
page.Date=class extends Date {static now(){return clock;}};
await vm.runInNewContext(source,page);
assert.equal(downloads,0,'Slow worker reply cannot start an out-of-budget receipt download');
assert.equal(closed,1,'Expired page still closes only its own tab');
console.log('Real page late replies do not issue post-deadline API calls.');
