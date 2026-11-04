const cards=document.querySelector('#cards');
const template=document.querySelector('#cardTemplate');
const notice=document.querySelector('#notice');
if(/Whale\//.test(navigator.userAgent)){
  const help=document.querySelector('footer p');
  if(help)help.textContent='이 목록은 웨일 수동 검증용이야. 정기 자동수집은 Chrome에서 저장한 공용 관리 목록을 동기화해.';
}
let products=[];

function parseCoupangUrl(value){
  try{
    const url=new URL(value);
    if(url.protocol!=="https:"||url.hostname!=="www.coupang.com")return {productId:'',itemId:'',vendorItemId:''};
    const productId=url.pathname.match(/\/vp\/products\/(\d+)/)?.[1]||'';
    return {productId,itemId:url.searchParams.get('itemId')||'',vendorItemId:url.searchParams.get('vendorItemId')||''};
  }catch{return {productId:'',itemId:'',vendorItemId:''};}
}
function money(value){return String(value||'').replace(/[^0-9]/g,'');}
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
  return {...previous,skuId,brand:card.querySelector('.brand').value.trim(),category:card.querySelector('.category').value.trim(),mtm:card.querySelector('.mtm').value.trim().toUpperCase(),srp:money(card.querySelector('.srp').value)?Number(money(card.querySelector('.srp').value)):null,enabled:card.querySelector('.enabled').checked,url:card.querySelector('.url').value.trim(),competitors:card.querySelectorAll?[...card.querySelectorAll('.competitor-row')].map(row=>({model:row.querySelector('.competitor-model').value.trim(),url:row.querySelector('.competitor-url').value.trim(),note:row.querySelector('.competitor-note').value.trim(),enabled:row.querySelector('.competitor-enabled').checked})):(previous.competitors||[]),...ids};
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
async function saveCatalogDownload(payload){
  const filename=/Whale\//.test(navigator.userAgent)?'MarketPulse/whale-product-catalog.json':'MarketPulse/product-catalog.json';
  const id=await chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(payload,null,2)),filename,conflictAction:'overwrite',saveAs:false});
  for(let i=0;i<30;i++){
    const [item]=await chrome.downloads.search({id});
    if(!item||item.state==='interrupted')throw Error('catalog-save-failed');
    if(item.state==='complete'){
      if(!String(item.filename||'').replaceAll('\\','/').endsWith('/'+filename))throw Error('catalog-save-path-mismatch');
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw Error('catalog-save-timeout');
}
async function save(){
  document.querySelectorAll('.card').forEach(card=>syncCard(card,Number(card.dataset.index)));
  const allErrors=products.flatMap((p,i)=>validate(p,i));
  if(allErrors.length){notice.textContent='저장하지 못했어. 빨간색 오류를 먼저 확인해.';return;}
  products=products.map(CompetitorModels.clean);
  const result=await chrome.runtime.sendMessage({type:'SAVE_PRODUCTS',products});
  if(!result?.ok){notice.textContent='저장 중 오류가 발생했어.';return;}
  const payload={version:1,savedAt:new Date().toISOString(),products};
  try{await saveCatalogDownload(payload);}catch{notice.textContent='설정은 확장에 저장됐지만 자동수집용 목록 파일 저장을 확인하지 못했어. 변경사항 저장을 다시 눌러줘.';return;}
  notice.textContent=/Whale\//.test(navigator.userAgent)?'저장 완료. 수동 검증에 적용돼. 정기 자동수집은 공용 관리 목록을 사용해.':'저장 완료. 다음 자동수집부터 변경사항이 적용돼.';
}
document.querySelector('#add').addEventListener('click',()=>{products.unshift({brand:'Acer',category:'Notebook',mtm:'',srp:null,enabled:true,url:'',competitors:[],productId:'',itemId:'',vendorItemId:''});render();window.scrollTo({top:0,behavior:'smooth'});});
document.querySelector('#save').addEventListener('click',save);document.querySelector('#saveBottom').addEventListener('click',save);document.querySelector('#search').addEventListener('input',render);
chrome.runtime.sendMessage({type:'GET_PRODUCTS'},response=>{
  products=response?.products||[];
  render();
});
