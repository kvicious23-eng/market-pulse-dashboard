const cards=document.querySelector('#cards');
const template=document.querySelector('#cardTemplate');
const notice=document.querySelector('#notice');
if(/Whale\/|Edg\//.test(navigator.userAgent)){
  const help=document.querySelector('footer p');
  if(help)help.textContent='이 목록은 현재 브라우저의 수동 검증용이야. 정기 자동수집은 Chrome에서 저장한 공용 관리 목록을 동기화해.';
}
let products=[],catalogBase='',saving=false,catalogLoaded=false;
const draftKey='market-pulse-catalog-draft-v1';
const signature=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function saveStatus(text,kind='info'){notice.textContent=text;notice.dataset.state=kind;notice.setAttribute('role',kind==='error'?'alert':'status');}
function saveTimeout(promise,label,ms=10000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'-timeout')),ms);})]).finally(()=>clearTimeout(timer));}
function keepDraft(){const draft={base:catalogBase,products,at:new Date().toISOString()};try{sessionStorage.setItem(draftKey,JSON.stringify(draft));}catch{}const link=document.querySelector('#draftBackup');link.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({version:1,products},null,2));link.hidden=false;}


function parseCoupangUrl(value){
  try{
    const url=new URL(value);
    if(url.protocol!=="https:"||url.hostname!=="www.coupang.com")return {productId:'',itemId:'',vendorItemId:''};
    const productId=url.pathname.match(/\/vp\/products\/(\d+)/)?.[1]||'';
    return {productId,itemId:url.searchParams.get('itemId')||'',vendorItemId:url.searchParams.get('vendorItemId')||''};
  }catch{return {productId:'',itemId:'',vendorItemId:''};}
}
function money(value){return String(value||'').replace(/[^0-9]/g,'');}
function parseManagedSrp(value){
  const text=String(value??'').trim();if(!text)return null;
  if(!/^(?:₩\s*)?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)\s*원?$/.test(text))return NaN;
  const n=Number(money(text));return Number.isSafeInteger(n)&&n>0?n:NaN;
}
function isSkuKey(key){return ['skuid','productcode','상품코드'].includes(key.replace(/[\s_]/g,'').toLowerCase());}
function registeredSku(product){
  if(typeof product.skuId==='string'&&product.skuId.trim())return product.skuId.trim();
  const entry=Object.entries(product).find(([key,value])=>isSkuKey(key)&&value!==null&&value!==undefined&&String(value).trim());
  return entry?String(entry[1]).trim():'';
}
function validate(product,index){
  const errors=[];
  if(!product.brand)errors.push('Brand 필요');
  if(!product.mtm)errors.push('MTM 필요');
  if(!product.productId||!product.itemId||!product.vendorItemId)errors.push('쿠팡 URL의 ID 3개 필요');
  if(product.skuId&&!/^\d+$/.test(product.skuId))errors.push('SKUID는 숫자로 입력');
  if(product.enabled!==false&&product.skuId&&products.some((x,i)=>i!==index&&x.enabled!==false&&registeredSku(x)===product.skuId))errors.push('활성 상품 SKUID 중복');
  if(products.some((x,i)=>i!==index&&x.itemId===product.itemId))errors.push('Item ID 중복');
  if(products.some((x,i)=>i!==index&&x.vendorItemId===product.vendorItemId))errors.push('VendorItem ID 중복');
  if(products.some((x,i)=>i!==index&&x.brand.toLowerCase()===product.brand.toLowerCase()&&x.mtm.toLowerCase()===product.mtm.toLowerCase()))errors.push('브랜드·MTM 중복');
  const slug=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
  if(product.brand&&products.some((x,i)=>i!==index&&x.brand&&x.brand!==product.brand&&slug(x.brand)===slug(product.brand)))errors.push('브랜드 URL 이름 중복');
  if(product.srp!==null&&(!Number.isFinite(product.srp)||product.srp<=0))errors.push('SRP 확인');
  try{if(product.competitors)CompetitorModels.links(product);}catch(e){errors.push(e.message);}
  return errors;
}
function readCard(card){
  const ids=parseCoupangUrl(card.querySelector('.url').value.trim());
  const previous={...products[Number(card.dataset.index)]},skuId=card.querySelector('.skuId').value.trim();
  // A single editor updates existing aliases too, preserving unrelated metadata.
  for(const key of Object.keys(previous))if(isSkuKey(key))previous[key]=skuId;
  return {...previous,skuId,brand:card.querySelector('.brand').value.trim(),category:card.querySelector('.category').value.trim(),mtm:card.querySelector('.mtm').value.trim().toUpperCase(),srp:parseManagedSrp(card.querySelector('.srp').value),enabled:card.querySelector('.enabled').checked,url:card.querySelector('.url').value.trim(),competitors:card.querySelectorAll?[...card.querySelectorAll('.competitor-row')].map(row=>({model:row.querySelector('.competitor-model').value.trim(),url:row.querySelector('.competitor-url').value.trim(),note:row.querySelector('.competitor-note').value.trim(),enabled:row.querySelector('.competitor-enabled').checked})):(previous.competitors||[]),...ids};
}
function syncCard(card,index){
  const p=readCard(card); products[index]=p;
  card.querySelector('.productId').value=p.productId;card.querySelector('.itemId').value=p.itemId;card.querySelector('.vendorItemId').value=p.vendorItemId;
  card.querySelector('.brandBadge').textContent=p.brand||'미입력';card.querySelector('.title').textContent=p.mtm||'신규 상품';
  const errors=validate(p,index),out=card.querySelector('.validation');out.textContent=errors.length?errors.join(' · '):'URL 및 필수값 확인 완료';out.className='validation '+(errors.length?'error':'ok');
  document.querySelector('#activeCount').textContent=products.filter(x=>x.enabled!==false).length;
  try{const c=CompetitorModels.capacity(products);document.querySelector('#capacity').textContent=`내 상품 ${c.own}개 · 고유 경쟁상품 ${c.competitors}개 · 전체 ${c.total}개 / 순수 수집 추정 ${Math.ceil(c.minMinutes)}~${Math.ceil(c.maxMinutes)}분. 내 상품 게시·배포 대기시간은 별도야.`+(c.total>=50?' 복구 시간 여유가 부족할 수 있어.':c.total>=25?' 30분 게시 시각을 넘길 수 있어.':'');}catch(e){document.querySelector('#capacity').textContent=e.message;}
}
function appendCompetitor(card,c,index){
  const row=document.createElement('div');row.className='competitor-row';
  row.innerHTML='<label>경쟁모델명<input class="competitor-model" maxlength="160"></label><label>쿠팡 URL<input class="competitor-url" type="url"></label><label>비교 메모<input class="competitor-note" maxlength="500"></label><label class="competitor-use"><input type="checkbox" class="competitor-enabled">수집 사용</label><button class="remove-competitor" type="button">연결 삭제</button>';
  row.querySelector('.competitor-model').value=c.model||'';row.querySelector('.competitor-url').value=c.url||'';row.querySelector('.competitor-note').value=c.note||'';row.querySelector('.competitor-enabled').checked=c.enabled!==false;
  row.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>syncCard(card,index)));
  row.querySelector('.remove-competitor').addEventListener('click',()=>{row.remove();syncCard(card,index);});card.querySelector('.competitorRows').append(row);
}
function render(){
  cards.replaceChildren();
  const query=document.querySelector('#search').value.trim().toLowerCase();
  products.forEach((p,index)=>{
    if(query&&!`${p.brand} ${p.mtm}`.toLowerCase().includes(query))return;
    const card=template.content.firstElementChild.cloneNode(true);card.dataset.index=index;
    for(const key of ['brand','category','mtm','url'])card.querySelector('.'+key).value=p[key]??'';
    card.querySelector('.skuId').value=registeredSku(p);
    card.querySelector('.srp').value=p.srp?Number(p.srp).toLocaleString('ko-KR'):'';card.querySelector('.enabled').checked=p.enabled!==false;
    card.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>syncCard(card,index)));
    for(const c of p.competitors||[])appendCompetitor(card,c,index);
    card.querySelector('.addCompetitor').addEventListener('click',()=>{appendCompetitor(card,{model:'',url:'',note:'',enabled:true},index);syncCard(card,index);});
    card.querySelector('.remove').addEventListener('click',()=>{if(confirm(`${p.mtm||'이 상품'}을 목록에서 제거할까?`)){products.splice(index,1);render();}});
    cards.append(card);syncCard(card,index);
  });
}
async function save(){
  if(!catalogLoaded){saveStatus('상품 목록이 아직 준비되지 않았어. 새로고침 후 다시 시도해줘.','error');return;}
  if(saving)return;
  saving=true;
  const buttons=['#save','#saveBottom'].map(id=>document.querySelector(id));
  buttons.forEach(button=>{button.disabled=true;button.textContent='저장 중…';});
  saveStatus('입력값 확인 중…');
  let locked=[],extensionSaved=false;
  try{
    document.querySelectorAll('.card').forEach(card=>syncCard(card,Number(card.dataset.index)));
    keepDraft();
    const errors=products.flatMap((p,i)=>validate(p,i).map(error=>`${p.mtm||'신규 상품'}: ${error}`));
    if(errors.length){saveStatus('저장하지 못했어. '+errors.slice(0,3).join(' · '),'error');document.querySelector('.validation.error')?.scrollIntoView({block:'center'});return;}
    const payload={version:1,savedAt:new Date().toISOString(),products:products.map(CompetitorModels.clean)};
    locked=[...document.querySelectorAll('input,button')].map(el=>[el,el.disabled]);locked.forEach(([el])=>el.disabled=true);
    saveStatus('설정과 목록 파일 저장 완료를 확인 중…');
    const result=await saveTimeout(chrome.runtime.sendMessage({type:'SAVE_PRODUCTS',products:payload.products,baseSignature:catalogBase}),'extension-save',35000);
    extensionSaved=result?.settingsSaved===true;
    if(!result?.ok||result.persisted!==true)throw Error(result?.error||'extension-save-rejected');
    extensionSaved=true;
    products=payload.products;catalogBase=signature(products);
    try{sessionStorage.removeItem(draftKey);}catch{}
    document.querySelector('#draftBackup').hidden=true;
    saveStatus(/Whale\/|Edg\//.test(navigator.userAgent)?'저장 완료. 현재 브라우저의 수동 검증용 목록에 적용됐어. 정기 자동수집 목록은 Chrome에서 저장해줘.':'저장 완료. 다음 자동수집부터 변경사항이 적용돼.','success');
  }catch(error){
    const invalid=/context invalidated|receiving end|message port|extension.*unavailable/i.test(String(error?.message));
    saveStatus(/catalog-conflict/.test(String(error?.message))?'다른 관리 화면에서 목록이 변경됐어. 입력내용 백업을 내려받고 새로고침해서 최신 목록을 확인해줘.':/catalog-file-(?:pending|unresolved)|catalog-save-busy/.test(String(error?.message))?'이전 저장의 완료 여부를 확인 중이야. 입력내용 백업을 보관하고 잠시 후 다시 확인해줘.':extensionSaved?'확장 설정은 저장됐지만 목록 파일 저장을 확인하지 못했어. 입력내용 백업을 보관하고 변경사항 저장을 다시 눌러줘.':invalid?'확장이 업데이트되어 이 화면의 연결이 끊겼어. 입력내용 백업을 내려받은 뒤 새로고침해줘. 같은 탭의 미저장 입력은 복원돼.':/timeout/.test(String(error?.message))?'저장 확인 응답이 지연되고 있어. 성공 여부를 확인하지 못했어. 입력내용 백업을 보관하고 다시 저장해줘.':'저장하지 못했어. 입력내용 백업을 보관하고 다시 시도해줘.','error');
  }finally{
    locked.forEach(([el,disabled])=>el.disabled=disabled);
    buttons.forEach(button=>{button.disabled=false;button.textContent='변경사항 저장';});
    saving=false;
  }
}
document.querySelector('#add').addEventListener('click',()=>{products.unshift({brand:'Acer',category:'Notebook',mtm:'',srp:null,enabled:true,url:'',competitors:[],productId:'',itemId:'',vendorItemId:''});render();window.scrollTo({top:0,behavior:'smooth'});});
document.querySelector('#save').addEventListener('click',save);document.querySelector('#saveBottom').addEventListener('click',save);document.querySelector('#search').addEventListener('input',render);
async function loadCatalog(){
  try{
    const response=await saveTimeout(chrome.runtime.sendMessage({type:'GET_PRODUCTS'}),'catalog-load');
    if(!response?.ok||!Array.isArray(response.products))throw Error('catalog-load-failed');
    products=response.products;catalogBase=signature(products);
    let draft;try{draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');}catch{}
    if(draft&&Array.isArray(draft.products)){
      if(draft.base===catalogBase||signature(draft.products)===catalogBase){products=draft.products;saveStatus('미저장 입력을 복원했어. 변경사항 저장을 눌러 파일 저장까지 완료해줘.');}
      else saveStatus('저장 목록에 다른 변경이 있어 미저장 입력을 자동으로 덮어쓰지 않았어. 입력내용 백업을 내려받아 확인해줘.','error');
      const link=document.querySelector('#draftBackup');link.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({version:1,products:draft.products},null,2));link.hidden=false;
    }
    render();catalogLoaded=true;['#save','#saveBottom'].forEach(id=>document.querySelector(id).disabled=false);
  }catch{saveStatus('상품 목록을 불러오지 못했어. 이 화면을 새로고침해줘.','error');}
}
loadCatalog();
