export const MAX_CSV_BYTES=32*1024*1024;
const fail=code=>{throw new Error(code);};

export function decodeCsv(bytes,encoding='auto') {
  if(!(bytes instanceof Uint8Array) || bytes.length>MAX_CSV_BYTES) fail('csv_too_large');
  let selected=encoding;
  if(selected==='auto') {
    if(bytes[0]===255&&bytes[1]===254) selected='utf-16le';
    else if(bytes[0]===254&&bytes[1]===255) selected='utf-16be';
    else {try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),encoding:'utf-8'};}catch{selected='euc-kr';}}
  }
  if(!['utf-8','euc-kr','utf-16le','utf-16be'].includes(selected)) fail('csv_encoding_invalid');
  try{return {text:new TextDecoder(selected,{fatal:true}).decode(bytes),encoding:selected};}catch{fail('csv_decode_failed');}
}

// Preserve fields as strings, including long IDs, quoted newlines, blanks and zero.
export function parseDelimited(text,delimiter=',') {
  if(![',',';','\t'].includes(delimiter)) fail('csv_delimiter_invalid');
  text=String(text).replace(/^\ufeff/,'');if(text.includes('\0')) fail('csv_decode_failed');
  const records=[];let row=[],field='',quoted=false,closed=false,cells=0;
  const cell=()=>{row.push(field);field='';closed=false;if(++cells>2000000||row.length>1000)fail('csv_too_large');};
  const line=()=>{cell();records.push(row);row=[];if(records.length>200001)fail('csv_too_large');};
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c===delimiter){cell();continue;}
    if(c==='\r'||c==='\n'){line();if(c==='\r'&&text[i+1]==='\n')i++;continue;}
    if(c==='"'){if(field||closed)fail('csv_invalid_quotes');quoted=true;continue;}
    if(closed){if(c===' '||c==='\t')continue;fail('csv_invalid_quotes');}
    field+=c;
  }
  if(quoted)fail('csv_invalid_quotes');
  if(field||closed||row.length)line();
  return records;
}

export function readCsv(text,{delimiter='auto',headerRow=1}={}) {
  if(!Number.isInteger(headerRow)||headerRow<1||headerRow>100)fail('csv_header_invalid');
  let records;
  if(delimiter==='auto') {
    // Infer from the selected logical header outside quoted fields, then parse once.
    const counts=new Map([[',',0],['\t',0],[';',0]]);let quoted=false,record=1;
    for(let i=0;i<text.length;i++){
      const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;continue;}
      if(quoted)continue;
      if(c==='\r'||c==='\n'){if(record++===headerRow)break;if(c==='\r'&&text[i+1]==='\n')i++;continue;}
      if(record===headerRow&&counts.has(c))counts.set(c,counts.get(c)+1);
    }
    delimiter=[...counts].sort((a,b)=>b[1]-a[1])[0][0];records=parseDelimited(text,delimiter);
  }else records=parseDelimited(text,delimiter);
  const headers=records[headerRow-1];if(!headers||!headers.some(h=>h.trim()))fail('csv_header_missing');
  const rows=records.slice(headerRow).filter(r=>r.some(v=>v!==''));
  if(rows.some(r=>r.length!==headers.length))fail('csv_column_mismatch');
  return {headers,rows,delimiter,headerRow};
}

function registeredSku(product) {
  const values=[];
  for(const [key,raw] of Object.entries(product)) {
    if(!['skuid','productcode','상품코드'].includes(key.replace(/[\s_]/g,'').toLowerCase()))continue;
    if(raw===undefined||raw===null||raw==='')continue;
    // Safely read existing numeric codes; never round a long numeric identifier.
    if(typeof raw==='number'&&(!Number.isSafeInteger(raw)||raw<0))fail('catalog_sku_invalid');
    if(typeof raw!=='string'&&typeof raw!=='number')fail('catalog_sku_invalid');
    const value=String(raw).trim();if(!value)continue;
    if(!/^\d+$/.test(value))fail('catalog_sku_invalid');values.push(value);
  }
  if(new Set(values).size>1)fail('catalog_sku_conflict');
  return values[0]||'';
}

export function readCatalog(text) {
  let value;try{value=JSON.parse(String(text).replace(/^\ufeff/,''));}catch{fail('catalog_invalid');}
  if(value?.version!==1||!Array.isArray(value.products)||value.products.length>10000)fail('catalog_invalid');
  if(value.products.some(p=>!p||typeof p!=='object'||Array.isArray(p)||(p.enabled!==undefined&&typeof p.enabled!=='boolean')))fail('catalog_invalid');
  const products=value.products.filter(p=>p?.enabled!==false).map(p=>({brand:typeof p.brand==='string'?p.brand.trim():'',mtm:typeof p.mtm==='string'?p.mtm.trim().toUpperCase():'',skuId:registeredSku(p),itemId:typeof p.itemId==='string'?p.itemId.trim():'',vendorItemId:typeof p.vendorItemId==='string'?p.vendorItemId.trim():''}));
  const keys=new Set();for(const p of products){const key=p.brand.toUpperCase()+'|'+p.mtm;if(!p.brand||!p.mtm||keys.has(key))fail('catalog_invalid');keys.add(key);}
  const skuIds=new Set();for(const p of products){if(!p.skuId)continue;if(skuIds.has(p.skuId))fail('catalog_duplicate_sku_id');skuIds.add(p.skuId);}
  return {products,savedAt:typeof value.savedAt==='string'?value.savedAt:''};
}

export function matchCatalog(table,catalog,{column,mode='mtm'}={}) {
  if(!Number.isInteger(column)||column<0||column>=table.headers.length)fail('csv_match_column_required');
  if(!['skuId','mtm','itemId','vendorItemId','title'].includes(mode))fail('csv_match_mode_invalid');
  const products=catalog.products,normalize=s=>String(s??'').trim().toUpperCase(),found=new Set(),matched=[],ambiguous=[];
  const index=new Map();
  if(mode!=='title')for(const [i,p] of products.entries()){const key=normalize(p[mode]);if(key){const list=index.get(key)||[];list.push(i);index.set(key,list);}}
  const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=mode==='title'?products.map(p=>new RegExp('(?:^|[^A-Z0-9-])'+escaped(p.mtm)+'(?=$|[^A-Z0-9-])','iu')):[];
  for(const [rowIndex,row] of table.rows.entries()) {
    const key=normalize(row[column]);if(!key)continue;
    const ids=mode==='title'?patterns.flatMap((re,i)=>re.test(key)?[i]:[]):index.get(key)||[];
    if(ids.length>1){ambiguous.push(rowIndex);continue;}
    if(ids.length===1){const id=ids[0];found.add(id);matched.push({rowIndex,product:products[id],values:[...row]});}
  }
  return {matched,ambiguous,unmatchedProducts:products.filter((_,i)=>!found.has(i)),matchedProductCount:found.size,totalRows:table.rows.length};
}

export function matchedCsv(table,result) {
  // Excel must open untrusted cells as text rather than execute source formulas.
  const quote=v=>{let s=String(v??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const rows=[['Market Pulse 브랜드','Market Pulse MTM','원본 데이터 행 번호',...table.headers],...result.matched.map(m=>[m.product.brand,m.product.mtm,m.rowIndex+table.headerRow+1,...m.values])];
  return '\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}

// Injected only after a fresh route check. Click one exact visible export control once.
export function clickSupplierCsvDownload(inspectOnly=false) {
  const u=new URL(location.href),text=document.body?.innerText||'';
  const finish=(reason,count=0)=>({ok:['csv_request_clicked','csv_button_ready'].includes(reason),reason,clicked:reason==='csv_request_clicked',buttonCount:Math.min(count,50)});
  if(u.protocol!=='https:'||u.hostname!=='supplier.coupang.com'||u.port||u.username||u.password||!/^\/rpd\/web-v2\/basic\/rocket\/?$/.test(u.pathname))return finish('csv_wrong_page');
  const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
  if([...document.querySelectorAll('input[type="password"]')].some(visible))return finish('csv_login_required');
  if(/접근이 제한|접근이 차단|Access Denied|접속이 차단/i.test(text))return finish('csv_access_blocked');
  if(/자동.?입력.?방지|로봇이 아닙|보안.?문자|인증번호.{0,20}(입력|전송)|본인.?인증|Verify you are human/i.test(text)||[...document.querySelectorAll('iframe')].some(e=>visible(e)&&/captcha|challenge/i.test(e.src)))return finish('csv_verification_required');
  const buttons=[...document.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&(e.innerText||e.value||e.getAttribute('aria-label')||'').replace(/[\s\u200b-\u200d\ufeff]/g,'')==='전체데이터다운로드');
  if(buttons.length!==1)return finish(buttons.length?'csv_button_ambiguous':'csv_button_missing',buttons.length);
  if(inspectOnly)return finish('csv_button_ready',1);
  buttons[0].click();return finish('csv_request_clicked',1);
}

// The official export dialog is a separate request, not a completed download.
// Return only fixed state; never return its surrounding business data.
export async function supplierExportForm(filename,submit=false) {
  const u=new URL(location.href);
  if(u.origin!=='https://supplier.coupang.com'||!/^\/rpd\/web-v2\/basic\/rocket\/?$/.test(u.pathname))return {phase:'unverified',reason:'csv_wrong_page'};
  const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
  if([...document.querySelectorAll('input[type="password"]')].some(visible))return {phase:'unverified',reason:'csv_login_required'};
  const cancels=[...document.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&e.innerText.trim()==='취소');
  const panels=cancels.map(e=>e.parentElement?.parentElement).filter(e=>/요청 사유/.test(e?.innerText||'')&&/엑셀파일명/.test(e?.innerText||''));
  if(!panels.length)return {phase:'absent',reason:'export_form_absent'};
  if(panels.length!==1)return {phase:'unverified',reason:'export_form_ambiguous'};
  const panel=panels[0];
  const buttons=[...panel.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&e.innerText.trim()==='요청');
  if(buttons.length!==1)return {phase:'unverified',reason:'export_form_unconfirmed'};
  if(!submit)return {phase:'form',reason:'export_form_ready'};
  // The official request accepts empty reason/name. Preserve the user's fields.
  if(buttons[0].disabled||buttons[0].getAttribute('aria-disabled')==='true')return {phase:'unverified',reason:'export_request_disabled',clicked:false};
  buttons[0].click();return {phase:'requested',reason:'export_request_clicked',clicked:true};
}
