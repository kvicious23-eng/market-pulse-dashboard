import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {summarizeRun, analyzeFolder} from './analyze-access-diagnostics.mjs';

const slot='2026-10-18T12:00+09:00';
const attempt=(phase,reason,time,status=reason==='access-check'?403:200)=>({phase,reason,diagnostic:{
  observedAt:time,responses:[{at:time,status,headers:{server:status===403?'AkamaiGHost':'envoy',cookie:'private-cookie'}}],
  page:{reference:status===403?'private-reference':null},url:'private-url'}});
const row=(mtm,ok,attempts)=>({mtm,ok,attempts});
const input={browser:'chrome',extensionVersion:'1.9.40',runId:'a'.repeat(32),scanSlot:slot,
  startedAt:'2026-10-18T03:00:00Z',completedAt:'2026-10-18T03:20:00Z',
  results:[
    row('normal',true,[attempt('initial','ok','2026-10-18T03:00:10Z')]),
    row('recovered',true,[attempt('initial','access-check','2026-10-18T03:01:00Z'),attempt('retry','ok','2026-10-18T03:11:00Z')]),
    row('blocked',false,[attempt('initial','access-check','2026-10-18T03:02:00Z'),attempt('retry','access-check','2026-10-18T03:12:00Z')]),
    row('other-failure',false,[attempt('initial','access-check','2026-10-18T03:03:00Z'),attempt('retry','browser-error','2026-10-18T03:13:00Z',500)])
  ]};
const result=summarizeRun(input);
assert.equal(result.initialBlocked,3);
assert.equal(result.recoveredOnRetry,1);
assert.equal(result.finalBlocked,1);
assert.equal(result.unresolvedOther,1);
assert.equal(result.firstBlockedCatalogPosition,2);
assert.equal(result.elapsedToFirstBlockedSeconds,60);
assert.equal(result.firstRetryRecoveryAt,'2026-10-18T03:11:00Z');
assert.equal(result.models[1].retryGapSeconds,600);
assert.equal(result.models[1].observations[0].referenceCaptured,true);
assert.doesNotMatch(JSON.stringify(result),/private-cookie|private-reference|private-url/);
const incomplete=summarizeRun({...input,results:[row('unobserved',false,[])]});
assert.equal(incomplete.traceCoverage,'incomplete');
assert.equal(incomplete.missingInitialEvidence,1);
assert.equal(incomplete.models[0].initialBlocked,null);
assert.equal(incomplete.models[0].finalBlocked,null);
assert.throws(()=>summarizeRun({...input,completedAt:'invalid'}));
assert.throws(()=>summarizeRun({...input,runId:'invalid'}));
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mp-access-analysis-'));
const write=(name,data)=>fs.writeFileSync(path.join(folder,name),JSON.stringify(data));
try {
  write(`access-diagnostic-${input.runId}.json`,input);
  write('latest-coupang-scan.json',{...input,results:input.results.map(({attempts,...r})=>({...r,accessDiagnostics:attempts}))});
  const edge={...input,browser:'edge',runId:'b'.repeat(32),chromeRunId:input.runId,
    startedAt:'2026-10-18T03:30:00Z',completedAt:'2026-10-18T03:40:00Z',results:[row('normal',true,[attempt('initial','ok','2026-10-18T03:31:00Z')])]};
  write(`access-diagnostic-${edge.runId}.json`,edge);
  // A missing historical archive must not be counted as a zero-denial run.
  let report=analyzeFolder(folder,{uploadLog:'-ExpectedSlotStart 2026-10-18T08:00:00+09:00\n-ExpectedSlotStart 2026-10-18T12:00:00+09:00'});
  assert.equal(report.runs.length,2,'archive/current payload must deduplicate');
  assert.deepEqual(report.missingChromeSlots,['2026-10-18T08:00+09:00']);
  assert.equal(report.pairs.length,1);
  assert.equal(report.pairs[0].edgeStartDelaySeconds,600);
  assert.match(report.pairs[0].interpretation,/not-a-controlled-comparison/);
  assert.equal(analyzeFolder(folder,{slot:'2026-10-18T08:00+09:00'}).runs.length,0);
  const output=path.join(folder,'out','summary.json');
  const cli=spawnSync(process.execPath,['scripts/analyze-access-diagnostics.mjs','--folder',folder,'--slot',slot,'--output',output],{encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);
  assert.match(cli.stdout,/initial=3; recovered=1; final=1; other-unresolved=1/);
  assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).runs.length,2);
  const forbidden=spawnSync(process.execPath,['scripts/analyze-access-diagnostics.mjs','--folder',folder,'--output',path.join(folder,'latest-coupang-scan.json')],{encoding:'utf8'});
  assert.equal(forbidden.status,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'latest-coupang-scan.json'),'utf8')).results.length,4);
  assert.equal(spawnSync(process.execPath,['scripts/analyze-access-diagnostics.mjs','--folder',folder,'--slot','invalid'],{encoding:'utf8'}).status,1);
  // Conflicting copies of one run are excluded, not silently preferred.
  write('latest-coupang-scan.json',{...input,results:[]});
  report=analyzeFolder(folder);
  assert.equal(report.runs.filter(r=>r.browser==='chrome').length,0);
  assert.equal(report.errors[0].error,'conflicting-run-evidence');
  fs.writeFileSync(path.join(folder,`access-diagnostic-${'c'.repeat(32)}.json`),'{invalid');
  assert.ok(analyzeFolder(folder).errors.some(e=>e.error==='unreadable-or-invalid-diagnostic'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder,`access-diagnostic-${input.runId}.json`),'utf8')).results.length,4,'sources unchanged');
} finally {fs.rmSync(folder,{recursive:true,force:true});}
console.log('Access analysis initial/retry/final counts, unknown evidence, chronology, pairing, privacy, CLI and conflict checks passed.');
