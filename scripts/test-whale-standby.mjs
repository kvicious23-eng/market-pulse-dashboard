import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readTestFile} from './test-source.mjs';
const source=readTestFile('chrome-extension/background.js','utf8');
const handlers={},cleared=[];
const context={isEdgeBrowser:false,navigator:{userAgent:'Chrome/1 Whale/5'},SCHEDULED_SCAN_TIMES:['0800','1200','1600','2000'].map(x=>({alarm:'daily-scan-'+x})),
 chrome:{runtime:{onInstalled:{addListener:f=>handlers.install=f},onStartup:{addListener:f=>handlers.startup=f}},alarms:{clear:async n=>cleared.push(n),onAlarm:{addListener:f=>handlers.alarm=f}},storage:{local:{set:async()=>{},get:async()=>({})}}},
 schedule:()=>assert.fail('Whale scheduled an automatic scan'),requestScan:()=>assert.fail('Whale started automatically')};
vm.runInNewContext(source.slice(source.indexOf('chrome.runtime.onInstalled.addListener('),source.indexOf('chrome.action.onClicked.addListener(')),context);
await handlers.install();await handlers.startup();await handlers.alarm({name:'daily-scan-1600'});assert.equal(cleared.length,10);
const helpers=source.slice(source.indexOf('function scanSaveTargets('),source.indexOf('function localDay('));
const files=[],saved={};let writes=0;
const io={Date,Math,Number,Object,JSON,encodeURIComponent,withScanTimeout:async p=>p,waitForScanDownload:async()=>{},chrome:{storage:{local:{get:async k=>({[k]:saved[k]}),set:async v=>Object.assign(saved,v)}},downloads:{download:async x=>{files.push(x.filename);return ++writes;}}}};
vm.runInNewContext('let queuedSaveRetry=null;'+helpers+';this.save=saveCompletedScan;',io);
const payload={browser:'whale',runId:'a'.repeat(32),scanSlot:null,results:[]};await io.save(payload);
assert.deepEqual(files,['MarketPulse/whale-validation-'+payload.runId+'.json']);
io.waitForScanDownload=async()=>{if(writes===2)throw Error('FILE_ACCESS_DENIED');};await io.save(payload);
assert.ok(files.at(-1).endsWith('-saved.json'));assert.ok(files.every(x=>x.includes('/whale-validation-')));assert.equal(saved.scanSaveRecovery,null);
assert.match(source,/browser:\/Whale/);
assert.match(source,/!isEdgeBrowser&&!\/Whale/,'Whale must not write a Chrome start witness');
assert.match(source,/whale-access-diagnostic/);
assert.match(readTestFile('chrome-extension/options.js','utf8'),/whale-product-catalog\.json/);
assert.match(readTestFile('chrome-extension/maintenance.js','utf8'),/\?'whale':/);
assert.match(readTestFile('scripts/import-extension-results.ps1','utf8'),/Assert-PrimaryScanSource/);
console.log('Whale has no automatic alarms/startup scan, isolated canonical/unique results, catalog and diagnostics, distinct identity and scheduled-request-only production admission.');
