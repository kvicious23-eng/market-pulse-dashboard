import {readTestFile} from './test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=readTestFile(new URL('../chrome-extension/background.js',import.meta.url),'utf8');
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
// Execute the passive observer with browser mocks, including registration failure.
const helper=source.slice(source.indexOf('const accessDiagnosticTabs='),source.indexOf('\nasync function waitForScanDownload('));
function diagnostics(failRegistration=false){
 const listeners={},files=[];
 const context={URL,Date,Map,Number,Array,encodeURIComponent,
  document:{body:{innerText:'Access Denied Reference #18.abcdef.1234567890.abcdef'}},
  performance:{getEntriesByType:()=>[{responseStatus:403,type:'navigate'}]},
  withScanTimeout:async promise=>promise,waitForScanDownload:async()=>{},
  chrome:{webRequest:Object.fromEntries(['onCompleted','onBeforeRedirect','onErrorOccurred'].map(name=>[name,{addListener:(fn,filter,options)=>{if(failRegistration)throw Error('permission');listeners[name]={fn,filter,options};}}])),
   tabs:{onRemoved:{addListener:fn=>listeners.remove=fn}},
   scripting:{executeScript:async()=>[{result:context.readAccessPageDiagnostic()}]},
   downloads:{download:async options=>{files.push(JSON.parse(decodeURIComponent(options.url.split(',')[1])));return 1;}}}};
 vm.runInNewContext(helper+';Object.assign(this,{safeAccessRoute,safeAccessHeaders,observeAccessResponse,readAccessPageDiagnostic,captureAccessDiagnostic,saveAccessDiagnosticArchive,accessDiagnosticTabs});',context);
 return {context,listeners,files};
}
let {context:d,listeners,files}=diagnostics();
assert.equal(d.safeAccessRoute(product),'product');assert.equal(d.safeAccessRoute('https://evil.example/vp/products/1'),null);
const headers=[{name:'Server',value:'AkamaiGHost'},{name:'Retry-After',value:'30'},{name:'X-Cache',value:'Error from cloudfront'},{name:'Content-Type',value:'text/html; charset=utf-8'},
 {name:'Set-Cookie',value:'secret-cookie'},{name:'Authorization',value:'secret-token'},{name:'X-Forwarded-For',value:'private-ip'},{name:'Location',value:'private-url'}];
assert.deepEqual(JSON.parse(JSON.stringify(d.safeAccessHeaders(headers))),{server:'AkamaiGHost',retryAfterSeconds:30,cache:'Error from cloudfront',contentType:'text/html; charset=utf-8'});
assert.deepEqual(JSON.parse(JSON.stringify(d.safeAccessHeaders([{name:'Server',value:'AkamaiGHost private'},{name:'Retry-After',value:'private'}]))),{});
assert.deepEqual(JSON.parse(JSON.stringify(listeners.onCompleted.filter)),{urls:['https://www.coupang.com/*'],types:['main_frame']});
assert.deepEqual(Array.from(listeners.onCompleted.options),['responseHeaders']);
d.accessDiagnosticTabs.set(7,{openedAt:'now',responses:[]});
const response={tabId:7,type:'main_frame',frameId:0,url:product+'&secret=query',statusCode:403,timeStamp:123456,fromCache:false,responseHeaders:headers};
listeners.onCompleted.fn({...response,tabId:8});listeners.onCompleted.fn({...response,type:'xmlhttprequest'});listeners.onCompleted.fn({...response,frameId:1});
assert.equal(d.accessDiagnosticTabs.get(7).responses.length,0);
for(let i=0;i<8;i++)listeners.onCompleted.fn(response);
assert.equal(d.accessDiagnosticTabs.get(7).responses.length,6);
let evidence=await d.captureAccessDiagnostic(7);
assert.equal(evidence.page.reference,'18.abcdef.1234567890.abcdef');assert.equal(evidence.page.navigationStatus,403);
assert.equal(evidence.observerStatus,'registered');assert.equal(evidence.networkObservation,'observed');
const serialized=JSON.stringify(evidence);for(const secret of ['secret','private','itemId','vendorItemId','https:'])assert.equal(serialized.includes(secret),false);
d.document.body.innerText='ordinary page Reference #18.abcdef.1234567890.abcdef';d.performance.getEntriesByType=()=>[{responseStatus:0}];
assert.equal(d.readAccessPageDiagnostic().reference,null);assert.equal(d.readAccessPageDiagnostic().navigationStatus,null);
d.chrome.scripting.executeScript=async()=>{throw Error('closed tab');};
assert.equal((await d.captureAccessDiagnostic(7)).page,null);
assert.equal((await d.captureAccessDiagnostic(999)).networkObservation,'not-observed');
const payload={browser:'chrome',extensionVersion:'1.9.38',runId:'abc',scanSlot:'slot',startedAt:'start',completedAt:'end',results:[{mtm:'A',ok:true,url:'private-url',skuId:'private-sku',accessDiagnostics:[{phase:'initial',reason:'access-check',diagnostic:evidence},{phase:'retry',reason:'ok',diagnostic:evidence}]}]};
assert.equal(await d.saveAccessDiagnosticArchive(payload),'saved');assert.equal(files[0].results[0].attempts.length,2);
assert.equal(JSON.stringify(files[0]).includes('private'),false);
assert.equal(await d.saveAccessDiagnosticArchive({...payload,results:[{mtm:'A',ok:true}]}),'not-needed');
assert.equal(await d.saveAccessDiagnosticArchive({...payload,browser:'edge',results:[{mtm:'A',ok:true}],recovery:{reason:'access-check',chromeRunId:'chrome-run'}}),'saved');assert.equal(files[1].chromeRunId,'chrome-run');
d.chrome.downloads.download=async()=>{throw Error('disk failure');};assert.equal(await d.saveAccessDiagnosticArchive(payload),'save-failed');
listeners.remove(7);assert.equal(d.accessDiagnosticTabs.size,0);
d=diagnostics(true).context;assert.equal((await d.captureAccessDiagnostic(999)).observerStatus,'registration-failed');
const manifest=JSON.parse(readTestFile('chrome-extension/manifest.json','utf8'));assert.ok(manifest.permissions.includes('webRequest'));
console.log('Access classification, passive scope, privacy whitelist, unavailable evidence, bounded attempts and local archive success/failure passed.');
