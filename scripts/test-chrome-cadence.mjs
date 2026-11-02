import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const c={};vm.runInNewContext(readTestFile('chrome-extension/scan-policy.js','utf8')+';this.policy=chromeCadencePolicy;',c);
for(const [day,arm] of [['02',null],['03','A'],['04','B'],['05','B'],['06','A'],['07',null]]) {
 for(const hour of ['08','16']) {
  const slot=`2026-11-${day}T${hour}:00+09:00`;
  const p=c.policy(slot,'chrome');assert.equal(p.arm,arm);assert.equal(p.delayMs,arm==='B'?40000:20000);
  for(const args of [[slot,'whale'],[slot,'edge'],[slot,'chrome',{}],[slot,'chrome',null,'request'],[slot,'chrome',null,null,[]]])assert.equal(c.policy(...args).experimentId,null);
 }
}
for(const slot of [null,'2026-11-04T12:00+09:00','2026-11-04T20:00+09:00','2026-11-04T08:00Z','2026-11-04T08:00+00:00','2026-11-04T08:01+09:00','2026-11-31T08:00+09:00'])assert.equal(c.policy(slot,'chrome').delayMs,20000);
console.log('Fixed KST ABBA boundaries, manual/recovery/transient/browser exclusion passed.');
