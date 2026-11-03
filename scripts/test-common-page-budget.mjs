import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/common-primary.js','utf8');
let clock=0;const timers=[];
const c={Date:{now:()=>clock},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{}};
vm.runInNewContext(source.slice(0,source.indexOf('(async()=>'))+';this.bound=bounded;',c);
async function timeout(at,cleanup=false){
 clock=at;const p=c.bound(new Promise(()=>{}),10000,cleanup);const timer=timers.at(-1);timer.fn();
 await assert.rejects(p,/primary-api-timeout/);return timer.ms;
}
assert.equal(await timeout(0),10000);
assert.ok(await timeout(29500)<=500,'Late operations share the original page budget');
clock=31000;const count=timers.length;await assert.rejects(c.bound(new Promise(()=>{})),/primary-api-timeout/);assert.equal(timers.length,count,'Expired page cannot start another timer window');
assert.equal(await timeout(31000,true),2000,'Own-tab cleanup retains a separate bounded chance after expiry');
console.log('One-shot page uses one total API budget and a separate bounded cleanup allowance.');
