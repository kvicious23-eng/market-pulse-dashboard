import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../chrome-extension/background.js',import.meta.url),'utf8');
const start=source.indexOf('async function readDisplayedPrice(');
const end=source.indexOf('\nfunction snapshotCardDetailText(',start);
assert.ok(start>0&&end>start);
async function check(url,body){
  const context={URL,location:{href:url},document:{body:{innerText:body}}};
  const fn=vm.runInNewContext(`(${source.slice(start,end)})`,context);
  return fn('9235110727','27303279355','95415897534',1109000);
}
const product='https://www.coupang.com/vp/products/9235110727?itemId=27303279355&vendorItemId=95415897534';
assert.equal((await check(product,'Access Denied')).reason,'access-check');
assert.equal((await check(product,'Access Denied')).accessCheckDetail,'access-denied-message');
assert.equal((await check(product,'로봇이 아닙니다')).accessCheckDetail,'verification-message');
assert.equal((await check(product,'잠시 후 다시 시도')).accessCheckDetail,'temporary-message');
assert.equal((await check('https://www.coupang.com/error','정상 페이지')).reason,'product-identifiers-mismatch');
assert.match(source,/delete result\.reason;\s*delete result\.accessCheckDetail;/);
assert.match(source,/result\.retryStatus='browser-error'/);
console.log('Access diagnostics classification passed.');
