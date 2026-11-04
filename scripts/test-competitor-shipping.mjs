import assert from 'node:assert/strict';import vm from 'node:vm';import {readTestFile} from './test-source.mjs';
const s=readTestFile('chrome-extension/background.js','utf8'),start=s.indexOf('  const readShipping=()=>{'),end=s.indexOf('  const readAmount=',start);
function shipping(values){const c={document:{querySelectorAll:()=>values.map(innerText=>({innerText}))},clean:v=>v.replace(/\s+/g,' ').trim(),visible:()=>true};vm.runInNewContext(s.slice(start,end)+';this.read=readShipping;',c);return c.read();}
assert.equal(shipping(['배송비 0원']),0);assert.equal(shipping(['배송비 무료']),0);assert.equal(shipping(['총 배송비 +3,000원']),3000);assert.equal(shipping(['배송비 합계 5,000원']),5000);
assert.equal(shipping(['배송비 0원','총 배송비 0원']),0);assert.equal(shipping(['배송비 0원','총 배송비 3,000원']),null);
assert.equal(shipping(['상품금액 999,000원 배송비 결제금액 1,000,000원']),null);assert.equal(shipping(['배송비 확인 중']),null);assert.equal(shipping([]),null);
console.log('Confirmed checkout shipping: explicit free/zero/paid, duplicate agreement, conflict/absence and adjacent total exclusion passed.');
