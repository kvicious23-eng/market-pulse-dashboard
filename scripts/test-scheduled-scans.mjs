import {readTestFile} from './test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=readTestFile('chrome-extension/background.js','utf8');
const start=source.indexOf('const SCHEDULED_SCAN_TIMES =');
const end=source.indexOf('\n\nfunction enterCheckoutDiagnostic',start);
assert.ok(start>=0&&end>start);
const fixed=Date.parse('2026-10-06T06:13:38Z');
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
const created=[],cleared=[];
const context={Date:FixedDate,Intl,navigator:{userAgent:'Chrome'},chrome:{alarms:{clear:async name=>cleared.push(name),create:async(name,config)=>created.push({name,...config})}}};
vm.runInNewContext(`${source.slice(start,end)};this.slot=currentScheduledScanSlot;this.schedule=schedule;this.times=SCHEDULED_SCAN_TIMES;`,context);
assert.deepEqual(Array.from(context.times,e=>e.hour),[8,12,16,20]);
for(const [time,want] of [['07:59',null],['08:00','08:00'],['11:59','08:00'],['12:00','12:00'],['15:59','12:00'],['16:00','16:00'],['19:59','16:00'],['20:00','20:00'],['23:59','20:00']]){
 assert.equal(context.slot(new Date(`2026-10-06T${time}:00+09:00`)),want?`2026-10-06T${want}+09:00`:null);
}
await context.schedule();
assert.ok(cleared.includes('daily-scan-1400'));
assert.equal(created.length,4);
assert.deepEqual(created.map(e=>e.when),['2026-10-07T08:00:00+09:00','2026-10-07T12:00:00+09:00','2026-10-06T16:00:00+09:00','2026-10-06T20:00:00+09:00'].map(Date.parse));
const settings=readTestFile('scripts/set-local-schedule.ps1','utf8');
assert.deepEqual([...settings.matchAll(/New-ScheduledTaskTrigger -Daily -At "([\d:]+)"/g)].map(m=>m[1]),['08:00','12:00','16:00','20:00','08:30','12:30','16:30','20:30']);
assert.match(settings,/-NonInteractive -WindowStyle Hidden/);
const runner=readTestFile('scripts/run-scheduled-upload.ps1','utf8');
assert.match(runner,/@\(8,12,16,20 \| Where-Object/);
const handlers={},edgeCleared=[];
const edge={isEdgeBrowser:true,SCHEDULED_SCAN_TIMES:Array.from(context.times),chrome:{runtime:{onInstalled:{addListener:f=>handlers.install=f},onStartup:{addListener:f=>handlers.startup=f}},alarms:{clear:async n=>edgeCleared.push(n),onAlarm:{addListener:f=>handlers.alarm=f}},storage:{local:{set:async()=>{},get:async()=>({})}}},schedule:()=>assert.fail('Edge scheduled a scan'),requestScan:()=>assert.fail('Edge started an independent scan')};
vm.runInNewContext(source.slice(source.indexOf('chrome.runtime.onInstalled.addListener('),source.indexOf('chrome.action.onClicked.addListener(')),edge);
await handlers.install();await handlers.startup();
for(const hour of ['0800','1200','1400','1600','2000']) handlers.alarm({name:`daily-scan-${hour}`});
assert.equal(edgeCleared.length,10);
console.log('Four KST slots, next alarms, retired 14:00 alarm and Edge isolation passed.');
