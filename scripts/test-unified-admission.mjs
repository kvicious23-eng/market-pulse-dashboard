import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const s=readTestFile('chrome-extension/background.js','utf8'),c={URL};
vm.runInNewContext(s.slice(s.indexOf('function validateProductCatalog('),s.indexOf('const wait ='))+';this.check=validateProductCatalog;',c);
const good={brand:'Test',mtm:'A',productId:'1',itemId:'2',vendorItemId:'3',url:'https://www.coupang.com/vp/products/1?itemId=2&vendorItemId=3'};
assert.equal(c.check([good]).length,0);assert.equal(c.check([]).length,0);
for(const url of ['https://user:secret@www.coupang.com/vp/products/1?itemId=2&vendorItemId=3','https://www.coupang.com:8443/vp/products/1?itemId=2&vendorItemId=3','https://www.coupang.com/vp/products/1?itemId=2&itemId=2&vendorItemId=3','https://www.coupang.com/vp/products/1/other?itemId=2&vendorItemId=3','https://www.coupang.com/vp/products/1?itemId=abc&vendorItemId=3']){
 const row={...good,url};if(url.includes('itemId=abc'))row.itemId='abc';assert.ok(c.check([row]).length>0);
}
assert.ok(c.check([good,{...good}]).length>0);
console.log('Unified catalog admission rejects credentials, nonstandard ports, duplicate queries, paths and IDs.');

for(const srp of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'1000000',NaN,Infinity])assert(c.check([{...good,srp}]).length);
for(const srp of [null,undefined,1000000])assert.equal(c.check([{...good,srp}]).length,0);
