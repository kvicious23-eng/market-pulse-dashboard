import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const accessBlocked = attempt => {
  if(attempt?.reason==='access-check')return true;
  // Older scanners mislabeled short permission pages as price-not-found.
  const responses=(attempt?.diagnostic?.responses||[]).filter(r=>!r.event||r.event==='complete');
  const status=responses.at(-1)?.status??attempt?.diagnostic?.page?.navigationStatus;
  return status===403||status===429;
};
const safeMtm = value => String(value || '').replace(/[\r\n\t]/g, ' ').slice(0, 100);
const eventTime = attempt => {
  const responses = (attempt?.diagnostic?.responses || []).filter(r => validTime(r.at));
  const blocked = responses.filter(r => r.status === 403 || r.status === 429);
  return (blocked.length ? blocked : responses).map(r => r.at).sort((a,b) => Date.parse(a)-Date.parse(b))[0]
    || (validTime(attempt?.diagnostic?.observedAt) ? attempt.diagnostic.observedAt : null);
};
const seconds = (start, end) => validTime(start) && validTime(end) && Date.parse(end) >= Date.parse(start)
  ? Math.round((Date.parse(end) - Date.parse(start)) / 1000) : null;

export function summarizeRun(input) {
  if (!input || !['chrome', 'edge', 'whale'].includes(input.browser) || !/^[a-f0-9]{32}$/.test(input.runId || '')
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+09:00$/.test(input.scanSlot || '')
      || !validTime(input.startedAt) || !validTime(input.completedAt)
      || Date.parse(input.completedAt) < Date.parse(input.startedAt) || !Array.isArray(input.results)) {
    throw Error('invalid-diagnostic-run');
  }
  const models = input.results.map((row, index) => {
    const attempts = Array.isArray(row.attempts) ? row.attempts
      : Array.isArray(row.accessDiagnostics) ? row.accessDiagnostics : [];
    const initial = attempts.find(a => a.phase === 'initial');
    const retry = attempts.find(a => a.phase === 'retry');
    const last = retry || initial;
    const initialBlocked = initial ? accessBlocked(initial) : null;
    const recovered = initialBlocked === true && retry?.reason === 'ok' && row.ok === true;
    const finalBlocked = last ? accessBlocked(last) && row.ok !== true : null;
    const unresolvedOther = initialBlocked === true && !recovered && finalBlocked !== true;
    return {
      mtm: safeMtm(row.mtm), catalogPosition: index + 1,
      initialBlocked, recoveredInChrome: input.browser === 'chrome' ? recovered : false,
      recoveredOnRetry: recovered, finalBlocked, unresolvedOther,
      initialAt: eventTime(initial), retryAt: eventTime(retry),
      retryGapSeconds: seconds(eventTime(initial), eventTime(retry)),
      observations: attempts.filter(a => ['initial', 'retry'].includes(a.phase)).map(a => ({
        phase: a.phase, blocked: accessBlocked(a), at: eventTime(a),
        httpStatuses: [...new Set((a.diagnostic?.responses || []).map(r => r.status).filter(Number.isInteger))],
        referenceCaptured: Boolean(a.diagnostic?.page?.reference),
        serverClass: (a.diagnostic?.responses || []).some(r => r.headers?.server === 'AkamaiGHost') ? 'akamai'
          : (a.diagnostic?.responses || []).length ? 'other' : 'unobserved'
      }))
    };
  });
  const count = key => models.filter(m => m[key] === true).length;
  const first = models.filter(m => m.initialBlocked && m.initialAt).sort((a,b) => Date.parse(a.initialAt)-Date.parse(b.initialAt))[0];
  const recovered = models.filter(m => m.recoveredOnRetry && m.retryAt).sort((a,b) => Date.parse(a.retryAt)-Date.parse(b.retryAt))[0];
  const missing = models.filter(m => m.initialBlocked === null).length;
  return {
    browser: input.browser, extensionVersion: /^\d+\.\d+\.\d+$/.test(input.extensionVersion || '') ? input.extensionVersion : null,
    runId: input.runId, primaryBrowser: input.primaryBrowser || input.recovery?.primaryBrowser || (input.browser==='whale'?'whale':'chrome'),
    chromeRunId: /^[a-f0-9]{32}$/.test(input.chromeRunId || input.recovery?.chromeRunId || '')
      ? input.chromeRunId || input.recovery.chromeRunId : null,
    scanSlot: input.scanSlot, startedAt: input.startedAt, completedAt: input.completedAt,
    resultCount: models.length, traceCoverage: missing ? 'incomplete' : 'observed-all-listed-models',
    missingInitialEvidence: missing,
    initialBlocked: count('initialBlocked'), recoveredOnRetry: count('recoveredOnRetry'),
    finalBlocked: count('finalBlocked'), unresolvedOther: count('unresolvedOther'),
    firstBlockedAt: first?.initialAt || null, firstBlockedCatalogPosition: first?.catalogPosition || null,
    elapsedToFirstBlockedSeconds: first ? seconds(input.startedAt, first.initialAt) : null,
    firstRetryRecoveryAt: recovered?.retryAt || null,
    models
  };
}

export function analyzeFolder(folder, {slot = null, uploadLog = ''} = {}) {
  const errors = [], byRun = new Map();
  // Archives retain anomalous runs; absence is not evidence of zero denials.
  // The current complete Chrome payload also supplies the latest normal run.
  const files = fs.readdirSync(folder).filter(n => /^(?:access-diagnostic|whale-access-diagnostic|whale-scan)-[a-f0-9]{32}(?:-saved)?\.json$/.test(n));
  if (fs.existsSync(path.join(folder, 'latest-coupang-scan.json'))) files.push('latest-coupang-scan.json');
  for (const name of files.sort()) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8').replace(/^\uFEFF/, ''));
      if (slot && data.scanSlot !== slot) continue;
      if(data.browser==='whale'&&(!data.primaryRequestId||!data.scanSlot?.endsWith('T12:00+09:00')||data.scanSlot.slice(0,10)<'2026-10-21'))continue;
      const run = summarizeRun(data), key = `${run.browser}:${run.runId}`;
      const prior = byRun.get(key);
      if (prior && JSON.stringify(prior) !== JSON.stringify(run)) {
        errors.push({file: name, error: 'conflicting-run-evidence'});
        // Do not silently replace conflicting evidence with a convenient copy.
        byRun.delete(key); byRun.set(key, null);
      } else if (!byRun.has(key)) byRun.set(key, run);
    } catch { errors.push({file: name, error: 'unreadable-or-invalid-diagnostic'}); }
  }
  const runs = [...byRun.values()].filter(Boolean).sort((a,b) => a.scanSlot.localeCompare(b.scanSlot) || a.startedAt.localeCompare(b.startedAt));
  const slots = new Set(runs.map(r => r.scanSlot));
  const loggedSlots = [...uploadLog.matchAll(/-ExpectedSlotStart\s+(\d{4}-\d{2}-\d{2}T\d{2}):00:00\+09:00/g)].map(m => `${m[1]}:00+09:00`);
  const missingChromeSlots = [...new Set(loggedSlots)].filter(s => (!slot || s === slot) && !runs.some(r => r.browser === (s.slice(0,10)>='2026-10-21'&&s.endsWith('T12:00+09:00')?'whale':'chrome') && r.scanSlot === s));
  const pairs = [];
  for (const scanSlot of slots) {
    for (const edge of runs.filter(r => r.scanSlot === scanSlot && r.browser === 'edge')) {
      const chrome = runs.find(r => r.browser === edge.primaryBrowser && r.scanSlot === scanSlot && r.runId === edge.chromeRunId);
      if (chrome) pairs.push({scanSlot, primaryBrowser:chrome.browser, chromeRunId: chrome.runId, edgeRunId: edge.runId,
        edgeStartDelaySeconds: seconds(chrome.completedAt, edge.startedAt),
        chromeFinalBlocked: chrome.finalBlocked, edgeFinalBlocked: edge.finalBlocked,
        interpretation: 'browser-and-time-both-changed-not-a-controlled-comparison'});
    }
  }
  return {version: 1, scope: 'enrolled-product-main-frame-observations-not-total-browser-request-count',
    coverage: 'anomaly-archives-plus-latest-payload-not-all-historical-runs',
    missingChromeSlots, errors, runs, pairs};
}

export function runCli(args) {
  const options = {};
  for (let i=0; i<args.length; i+=2) {
    if (!['--folder', '--output', '--slot', '--upload-log'].includes(args[i]) || !args[i+1]) throw Error('invalid-arguments');
    options[args[i]] = args[i+1];
  }
  if (!options['--folder']) throw Error('required: --folder');
  if (options['--slot'] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+09:00$/.test(options['--slot'])) throw Error('invalid-slot');
  const report = analyzeFolder(options['--folder'], {slot: options['--slot'] || null,
    uploadLog: options['--upload-log'] ? fs.readFileSync(options['--upload-log'], 'utf8') : ''});
  if (options['--output']) {
    const output = path.resolve(options['--output']);
    if (path.dirname(output) === path.resolve(options['--folder']) && /^(?:latest-coupang-scan|(?:access-diagnostic|whale-access-diagnostic|whale-scan)-[a-f0-9]{32}(?:-saved)?)\.json$/.test(path.basename(output))) throw Error('output-cannot-replace-source');
    fs.mkdirSync(path.dirname(output), {recursive:true});
    const temp = `${output}.tmp-${process.pid}`;
    fs.writeFileSync(temp, JSON.stringify(report, null, 2), 'utf8');
    fs.renameSync(temp, output);
  }
  for (const r of report.runs.filter(r => ['chrome','whale'].includes(r.browser))) {
    console.log(`Access summary: browser=${r.browser}; slot=${r.scanSlot}; run=${r.runId}; initial=${r.initialBlocked}; recovered=${r.recoveredOnRetry}; final=${r.finalBlocked}; other-unresolved=${r.unresolvedOther}; missing-evidence=${r.missingInitialEvidence}; listed=${r.resultCount}`);
  }
  console.log(`Access evidence: runs=${report.runs.length}; missing-chrome-slots=${report.missingChromeSlots.length}; invalid-files=${report.errors.length}. Missing evidence is not zero denials.`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCli(process.argv.slice(2)); }
  catch { console.error('Access diagnostic analysis failed; source files were not modified.'); process.exitCode = 1; }
}
