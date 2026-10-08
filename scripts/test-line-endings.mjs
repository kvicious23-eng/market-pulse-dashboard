import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readTestFile} from './test-source.mjs';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'market-pulse-eol-'));
const roots=['scripts','chrome-extension','supplier-hub-extension','supplier-hub-native','dist','brand','acer'];
const textExtensions=new Set(['.mjs','.js','.json','.ps1','.html','.css','.cs']);
const tests=fs.readdirSync(path.join(sourceRoot,'scripts'))
  .filter(name=>/^test-.*\.mjs$/.test(name)&&name!=='test-line-endings.mjs').sort();
let failures=0;
function copyText(from,to,eol) {
  fs.mkdirSync(to,{recursive:true});
  for(const entry of fs.readdirSync(from,{withFileTypes:true})) {
    const src=path.join(from,entry.name),dest=path.join(to,entry.name);
    if(entry.isDirectory()) copyText(src,dest,eol);
    else if(entry.isFile()&&textExtensions.has(path.extname(entry.name))) {
      const text=fs.readFileSync(src,'utf8').replace(/\r\n?/g,'\n');
      fs.writeFileSync(dest,text.replace(/\n/g,eol),'utf8');
    }
  }
}
try {
  const probe=path.join(temp,'probe.txt');
  const bytes=Buffer.from('\uFEFF한글\r\nsecond\rthird\n','utf8');
  fs.writeFileSync(probe,bytes);
  assert.equal(readTestFile(probe,'utf8'),'\uFEFF한글\nsecond\nthird\n');
  assert.deepEqual(readTestFile(probe),bytes);
  assert.deepEqual(fs.readFileSync(probe),bytes,'Text reads must not mutate source bytes');
  for(const [name,eol] of [['LF','\n'],['CRLF','\r\n']]) {
    const fixture=path.join(temp,name);
    for(const root of roots) copyText(path.join(sourceRoot,root),path.join(fixture,root),eol);
    fs.writeFileSync(path.join(fixture,'index.html'),fs.readFileSync(path.join(sourceRoot,'index.html'),'utf8').replace(/\r\n?/g,'\n').replace(/\n/g,eol));
    const sample=fs.readFileSync(path.join(fixture,'chrome-extension/background.js'),'utf8');
    assert.ok(name==='CRLF'?sample.includes('\r\n'):!sample.includes('\r'));
    let passed=0;
    for(const test of tests) {
      const result=spawnSync(process.execPath,[path.join('scripts',test)],{cwd:fixture,encoding:'utf8',timeout:120_000});
      if(result.status!==0||result.error) {
        failures++;
        console.error(`${name}: FAIL ${test}\n${result.error?.message||''}\n${result.stdout||''}${result.stderr||''}`);
      } else passed++;
    }
    console.log(`${name}: ${passed}/${tests.length} JavaScript checks passed`);
  }
  assert.equal(failures,0,'Line-ending fixture checks failed');
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
