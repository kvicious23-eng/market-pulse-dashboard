import {MAX_CSV_BYTES,decodeCsv,readCsv,readCatalog,matchCatalog,matchedCsv} from './csv-core.mjs';
const el=id=>document.getElementById(id);
let bytes=null,table=null,catalog=null,result=null,revision=0,catalogRevision=0;
const errors={csv_too_large:'CSV는 32MB·20만 행·200만 셀 이내로 선택해줘.',csv_encoding_invalid:'문자 인코딩을 선택해줘.',csv_decode_failed:'파일의 문자 인코딩을 확인해줘. UTF-8 또는 한국어(EUC-KR)를 선택할 수 있어.',csv_delimiter_invalid:'구분자를 선택해줘.',csv_invalid_quotes:'CSV의 따옴표 구조를 읽지 못했어. 원본 CSV와 구분자를 확인해줘.',csv_header_invalid:'머리글 행은 1~100 사이로 입력해줘.',csv_header_missing:'머리글 행을 찾지 못했어.',csv_column_mismatch:'머리글과 열 개수가 다른 행이 있어. 머리글 행·구분자를 확인해줘.',catalog_invalid:'Market Pulse에서 저장한 최신 product-catalog.json을 선택해줘.',csv_match_column_required:'CSV에서 상품을 대조할 열을 선택해줘.',csv_match_mode_invalid:'대조 방식을 선택해줘.'};
function error(e){el('csv-status').textContent=errors[e.message]||'파일을 읽지 못했어. 파일과 설정을 확인해줘.';}
function clearResult(){result=null;el('export-matched').disabled=true;el('csv-match-result').replaceChildren();}
function preview(headers,rows){
  const wrapper=el('csv-preview');wrapper.replaceChildren();
  const tableElement=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
  for(const [i,h] of headers.slice(0,12).entries()){const th=document.createElement('th');th.textContent=h||`열 ${i+1}`;tr.append(th);}head.append(tr);tableElement.append(head);
  const body=document.createElement('tbody');for(const values of rows.slice(0,5)){const row=document.createElement('tr');for(const v of values.slice(0,12)){const td=document.createElement('td');td.textContent=String(v).length>1000?String(v).slice(0,1000)+'…':v;row.append(td);}body.append(row);}tableElement.append(body);wrapper.append(tableElement);
}
function parse(){
  clearResult();table=null;el('csv-preview').replaceChildren();el('match-column').replaceChildren(new Option('대조할 열 선택',''));
  if(!bytes)return;
  try{
    const decoded=decodeCsv(bytes,el('csv-encoding').value);
    const next=readCsv(decoded.text,{delimiter:el('csv-delimiter').value,headerRow:Number(el('csv-header').value)});
    table=next;el('csv-status').textContent=`PC에서 읽기 완료: ${next.rows.length.toLocaleString('ko-KR')}행 · ${next.headers.length}열 · ${decoded.encoding}. 처음 5행·12열을 표시해.`;
    for(const [i,h] of next.headers.entries())el('match-column').append(new Option(`${i+1}. ${h||'이름 없는 열'}`,String(i)));
    preview(next.headers,next.rows);
  }catch(e){error(e);}
}
el('download-csv').addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;el('csv-download-status').textContent='공식 다운로드 버튼을 확인하는 중이야.';
  try{
    const r=await chrome.runtime.sendMessage({type:'DOWNLOAD_CSV'});
    const messages={csv_request_clicked:'전체 데이터 다운로드를 한 번 클릭했어. Chrome에서 다운로드가 끝나면 아래에서 그 CSV를 선택해줘.',csv_button_missing:'현재 화면에서 활성화된 전체 데이터 다운로드 버튼을 찾지 못했어. Supplier Hub 화면을 확인해줘.',csv_button_ambiguous:'같은 다운로드 버튼이 여러 개라 클릭하지 않았어. 화면 구조를 확인해야 해.',csv_wrong_page:'먼저 프리미엄 데이터 2.0 열기를 눌러줘.',csv_login_required:'Supplier Hub 로그인이 필요해.',csv_access_blocked:'접근 제한 문구가 보여. 공식 화면을 확인해줘.',csv_verification_required:'추가 인증을 공식 화면에서 완료해줘.',csv_busy:'이미 다운로드 버튼을 확인하는 중이야.',csv_page_not_ready:'업무 페이지의 로딩·화면 읽기를 먼저 확인해줘.',csv_click_error:'다운로드 버튼을 클릭하지 못했어. Supplier Hub 화면을 확인해줘.'};
    el('csv-download-status').textContent=messages[r?.reason]||'다운로드 요청을 확인하지 못했어.';
  }catch{el('csv-download-status').textContent='SH 확장을 새로고침하고 관리 화면을 다시 열어줘.';}finally{button.disabled=false;}
});
el('csv-file').addEventListener('change',async event=>{
  const current=++revision;bytes=null;parse();el('csv-status').textContent='선택한 CSV를 PC에서 읽는 중이야.';
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>MAX_CSV_BYTES)throw new Error('csv_too_large');const read=new Uint8Array(await file.arrayBuffer());if(current!==revision)return;bytes=read;parse();}catch(e){if(current===revision)error(e);}
});
for(const id of ['csv-encoding','csv-delimiter','csv-header'])el(id).addEventListener('change',parse);
el('catalog-file').addEventListener('change',async event=>{
  const current=++catalogRevision;clearResult();catalog=null;el('catalog-status').textContent='';const file=event.target.files[0];if(!file)return;
  try{if(file.size>4*1024*1024)throw new Error('catalog_invalid');const text=await file.text();if(current!==catalogRevision)return;catalog=readCatalog(text);el('catalog-status').textContent=`카탈로그 활성 상품 ${catalog.products.length}개. ${catalog.savedAt?'저장 시각: '+catalog.savedAt:''}`;}catch(e){if(current===catalogRevision)error(e);}
});
for(const id of ['match-column','match-mode'])el(id).addEventListener('change',clearResult);
el('match-csv').addEventListener('click',()=>{
  clearResult();if(!table){el('csv-status').textContent='먼저 다운로드한 CSV를 선택해줘.';return;}if(!catalog){el('csv-status').textContent='최신 product-catalog.json을 선택해줘.';return;}
  try{
    if(el('match-column').value==='')throw new Error('csv_match_column_required');
    result=matchCatalog(table,catalog,{column:Number(el('match-column').value),mode:el('match-mode').value});
    const p=document.createElement('p');p.textContent=`일치 후보 ${result.matchedProductCount}/${catalog.products.length}개 상품 · ${result.matched.length}행. 여러 상품과 일치해 제외한 행 ${result.ambiguous.length}개. 중복 행은 합산하지 않아.`;el('csv-match-result').append(p);
    if(result.unmatchedProducts.length){const missing=document.createElement('p');missing.textContent='미매칭: '+result.unmatchedProducts.map(p=>`${p.brand} ${p.mtm}`).join(', ');el('csv-match-result').append(missing);}
    const caution=document.createElement('p');caution.textContent='원본 행을 보존한 후보 추출이야. 파일의 재고 열·기준일·창고·SKU 의미를 확인한 뒤 계산 규칙을 정해야 해.';el('csv-match-result').append(caution);
    el('export-matched').disabled=result.matched.length===0;
    preview(table.headers,result.matched.map(m=>m.values));
  }catch(e){error(e);}
});
el('export-matched').addEventListener('click',()=>{
  if(!table||!result?.matched.length)return;
  const url=URL.createObjectURL(new Blob([matchedCsv(table,result)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='supplier-matched-'+new Date().toISOString().replace(/[:.]/g,'-')+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
});
el('clear-csv').addEventListener('click',()=>{revision++;catalogRevision++;bytes=null;table=null;catalog=null;clearResult();for(const id of ['csv-file','catalog-file'])el(id).value='';el('csv-preview').replaceChildren();el('csv-status').textContent='읽은 파일 데이터를 화면에서 비웠어. PC 원본 파일은 보존돼.';el('catalog-status').textContent='';el('match-column').replaceChildren(new Option('대조할 열 선택',''));});
