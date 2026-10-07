import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_CSV_BYTES,decodeCsv,parseDelimited,readCsv,readCatalog,matchCatalog,matchedCsv,clickSupplierCsvDownload} from '../supplier-hub-extension/csv-core.mjs';
const csv='\ufeffMTM,재고,상품명,Item ID\r\n83N30037KR,0,"상품, 콤마",27303279355\r\n83N30037KR,,"줄1\n줄2 ""인용""",12345678901234567890\r\nSFG16-I71-75Y2,9,삭제 모델,28237319655\r\nC100,2,고독스 C100,29147698397\r\nC1000,7,다른 모델,999\r\n';
const table=readCsv(csv);assert.equal(table.rows.length,5);assert.equal(table.rows[0][1],'0');assert.equal(table.rows[1][1],'');assert.equal(table.rows[1][2],'줄1\n줄2 "인용"');assert.equal(table.rows[1][3],'12345678901234567890');
assert.deepEqual(parseDelimited('a,b,\r\n1,"",\r\n'),[['a','b',''],['1','','']]);
assert.equal(readCsv('안내문\nMTM;재고\nA;2\n',{headerRow:2}).delimiter,';');assert.equal(readCsv('MTM\t재고\nA\t0').delimiter,'\t');
assert.equal(readCsv('"메타\n안내"\n"MTM,설명"\t재고\nA\t0',{headerRow:2}).delimiter,'\t','Quoted delimiters and newlines must not distort delimiter detection');
assert.throws(()=>readCsv('a,b\n1'),/csv_column_mismatch/);assert.throws(()=>readCsv('a,b\n"unfinished'),/csv_invalid_quotes/);assert.throws(()=>parseDelimited('a,"b"oops'),/csv_invalid_quotes/);assert.throws(()=>readCsv('',{}),/csv_header_missing/);
assert.equal(decodeCsv(new TextEncoder().encode(csv)).encoding,'utf-8');
const korean=new Uint8Array([0xbe,0xc6,0xc0,0xcc,0xc5,0xdb]);assert.equal(decodeCsv(korean).encoding,'euc-kr');assert.equal(decodeCsv(korean).text,'아이템');
const utf16=new Uint8Array([255,254,77,0,84,0,77,0]);assert.equal(decodeCsv(utf16).text,'MTM');assert.equal(decodeCsv(utf16).encoding,'utf-16le');
assert.throws(()=>decodeCsv(new Uint8Array(MAX_CSV_BYTES+1)),/csv_too_large/);
const catalog=readCatalog(JSON.stringify({version:1,savedAt:'2026-10-07T05:00:00Z',products:[{brand:'Lenovo',mtm:'83N30037KR',itemId:'27303279355',enabled:true},{brand:'Acer',mtm:'SFG16-I71-75Y2',enabled:false},{brand:'Godox',mtm:'C100',itemId:'29147698397'},{brand:'Acer',mtm:'MISSING'}]}));
let result=matchCatalog(table,catalog,{column:0});assert.equal(result.matched.length,3);assert.equal(result.matchedProductCount,2);assert.equal(result.unmatchedProducts[0].mtm,'MISSING');assert.equal(result.matched.some(m=>m.product.mtm==='SFG16-I71-75Y2'),false);
assert.equal(matchCatalog(table,catalog,{column:3,mode:'itemId'}).matched.length,2);
assert.equal(matchCatalog(table,catalog,{column:2,mode:'title'}).matched.length,1);
assert.equal(matchCatalog(readCsv('상품명\nC1000\nX-C100\n고독스C100\nC100 카메라'),catalog,{column:0,mode:'title'}).matched.length,2);
const duplicate=readCatalog(JSON.stringify({version:1,products:[{brand:'B1',mtm:'C100'},{brand:'B2',mtm:'C100'}]}));assert.equal(matchCatalog(table,duplicate,{column:0}).ambiguous.length,1);assert.equal(matchCatalog(table,duplicate,{column:0}).matched.length,0);
assert.throws(()=>matchCatalog(table,catalog,{column:99}),/csv_match_column_required/);assert.throws(()=>readCatalog('{"version":1,"products":[{"mtm":"A"}]}'),/catalog_invalid/);
assert.equal(readCatalog('{"version":1,"products":[]}').products.length,0);
assert.throws(()=>readCatalog('{"version":1,"products":[null]}'),/catalog_invalid/);
assert.throws(()=>readCatalog('{"version":1,"products":[{"brand":"A","mtm":"B","enabled":"false"}]}'),/catalog_invalid/);
const exported=readCsv(matchedCsv(table,result));assert.equal(exported.rows.length,3);assert.equal(exported.rows[1].at(-1),'12345678901234567890');assert.equal(exported.rows[0][4],'0');assert.equal(exported.rows[1][4],'');assert.equal(table.rows.length,5,'Original remains intact');
const formulaTable=readCsv('MTM,값\nC100,"=HYPERLINK(""evil"")"');
const formulaResult=matchCatalog(formulaTable,catalog,{column:0});assert.equal(readCsv(matchedCsv(formulaTable,formulaResult)).rows[0].at(-1).startsWith("'="),true);

const original={document:global.document,location:global.location,getComputedStyle:global.getComputedStyle,chrome:global.chrome};
try {
  let body='업무 화면',password=false,buttonCount=1,disabled=false,clicks=0;
  const button={innerText:'전체 데이터 다운로드',getClientRects:()=>[{}],getAttribute:()=>null,get disabled(){return disabled;},click:()=>{clicks++;}};
  global.location={href:'https://supplier.coupang.com/rpd/web-v2/basic/rocket'};
  global.getComputedStyle=()=>({display:'block',visibility:'visible'});
  global.document={body:{get innerText(){return body;}},querySelectorAll:s=>s==='input[type="password"]'?(password?[button]:[]):s.startsWith('button,a,')?Array(buttonCount).fill(button):[]};
  assert.equal(clickSupplierCsvDownload().reason,'csv_request_clicked');assert.equal(clicks,1);
  buttonCount=0;assert.equal(clickSupplierCsvDownload().reason,'csv_button_missing');buttonCount=2;assert.equal(clickSupplierCsvDownload().reason,'csv_button_ambiguous');assert.equal(clicks,1);
  buttonCount=1;disabled=true;assert.equal(clickSupplierCsvDownload().reason,'csv_button_missing');disabled=false;
  password=true;assert.equal(clickSupplierCsvDownload().reason,'csv_login_required');password=false;
  body='보안 문자';assert.equal(clickSupplierCsvDownload().reason,'csv_verification_required');body='Access Denied';assert.equal(clickSupplierCsvDownload().reason,'csv_access_blocked');body='업무 화면 private-business-value';
  assert.equal(JSON.stringify(clickSupplierCsvDownload()).includes('private-business-value'),false);
  global.location.href='https://supplier.coupang.com/dashboard/KR';assert.equal(clickSupplierCsvDownload().reason,'csv_wrong_page');global.location.href='https://evil.test/rpd/web-v2/basic/rocket';assert.equal(clickSupplierCsvDownload().reason,'csv_wrong_page');

  // Exercise production message dispatch, tab checks and injected click together.
  global.location.href='https://supplier.coupang.com/rpd/web-v2/basic/rocket';let handler,nativeReads=0;clicks=0;
  const storage={premium:{tabId:18}},listener={addListener:()=>{}};
  global.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,getManifest:()=>({version:'0.1.7'}),onMessage:{addListener:fn=>{handler=fn;}},onInstalled:listener,onStartup:listener,sendNativeMessage:async()=>{nativeReads++;throw new Error('Must not read credentials');}},action:{onClicked:listener},alarms:{onAlarm:listener},storage:{local:{get:async key=>({[key]:storage[key]}),set:async value=>Object.assign(storage,value)}},tabs:{get:async id=>({id,url:global.location.href,status:'complete'})},scripting:{executeScript:async options=>[{result:options.func()}]}};
  await import('../supplier-hub-extension/background.js');
  const sender={id:'test',url:'chrome-extension://test/options.html'};
  let unauthorizedReply=false;assert.equal(handler({type:'DOWNLOAD_CSV'},{id:'other',url:'https://evil.test/'},()=>{unauthorizedReply=true;}),false);assert.equal(unauthorizedReply,false);
  const send=()=>new Promise(resolve=>handler({type:'DOWNLOAD_CSV'},sender,resolve));
  const replies=await Promise.all([send(),send()]);assert.equal(replies[0].reason,'csv_request_clicked');assert.equal(replies[1].reason,'csv_busy');assert.equal(clicks,1);assert.equal(nativeReads,0);
} finally {Object.assign(global,original);}
const manifest=JSON.parse(readFileSync(new URL('../supplier-hub-extension/manifest.json',import.meta.url)));assert.equal(manifest.permissions.includes('downloads'),false);assert.equal(manifest.permissions.includes('cookies'),false);
console.log('Supplier CSV checks passed: official one-click request, local decoding, exact matching, missing/ambiguous preservation, original rows and safe export.');
