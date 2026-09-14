const cards=document.querySelector('#cards');
const template=document.querySelector('#cardTemplate');
const notice=document.querySelector('#notice');
let products=[];

function parseCoupangUrl(value){
  try{
    const url=new URL(value);
    const productId=url.pathname.match(/\/vp\/products\/(\d+)/)?.[1]||'';
    return {productId,itemId:url.searchParams.get('itemId')||'',vendorItemId:url.searchParams.get('vendorItemId')||''};
  }catch{return {productId:'',itemId:'',vendorItemId:''};}
}
function money(value){return String(value||'').replace(/[^0-9]/g,'');}
function validate(product,index){
  const errors=[];
  if(!product.brand)errors.push('Brand 필요');
  if(product.brand&&!['Lenovo','Acer'].includes(product.brand))errors.push('현재 Lenovo/Acer만 대시보드 연동 가능');
  if(!product.mtm)errors.push('MTM 필요');
  if(!product.productId||!product.itemId||!product.vendorItemId)errors.push('쿠팡 URL의 ID 3개 필요');
  if(products.some((x,i)=>i!==index&&x.itemId===product.itemId))errors.push('Item ID 중복');
  if(product.srp!==null&&(!Number.isFinite(product.srp)||product.srp<=0))errors.push('SRP 확인');
  return errors;
}
function readCard(card){
  const ids=parseCoupangUrl(card.querySelector('.url').value.trim());
  return {brand:card.querySelector('.brand').value.trim(),category:card.querySelector('.category').value.trim(),mtm:card.querySelector('.mtm').value.trim().toUpperCase(),skuid:money(card.querySelector('.skuid').value),srp:money(card.querySelector('.srp').value)?Number(money(card.querySelector('.srp').value)):null,enabled:card.querySelector('.enabled').checked,url:card.querySelector('.url').value.trim(),danawaUrl:card.querySelector('.danawaUrl').value.trim(),...ids};
}
function syncCard(card,index){
  const p=readCard(card); products[index]=p;
  card.querySelector('.productId').value=p.productId;card.querySelector('.itemId').value=p.itemId;card.querySelector('.vendorItemId').value=p.vendorItemId;
  card.querySelector('.brandBadge').textContent=p.brand||'미입력';card.querySelector('.title').textContent=p.mtm||'신규 상품';
  const errors=validate(p,index),out=card.querySelector('.validation');out.textContent=errors.length?errors.join(' · '):'URL 및 필수값 확인 완료';out.className='validation '+(errors.length?'error':'ok');
  document.querySelector('#activeCount').textContent=products.filter(x=>x.enabled!==false).length;
}
function render(){
  cards.replaceChildren();
  const query=document.querySelector('#search').value.trim().toLowerCase();
  products.forEach((p,index)=>{
    if(query&&!`${p.brand} ${p.mtm} ${p.skuid}`.toLowerCase().includes(query))return;
    const card=template.content.firstElementChild.cloneNode(true);card.dataset.index=index;
    for(const key of ['brand','category','mtm','skuid','url','danawaUrl'])card.querySelector('.'+key).value=p[key]??'';
    card.querySelector('.srp').value=p.srp?Number(p.srp).toLocaleString('ko-KR'):'';card.querySelector('.enabled').checked=p.enabled!==false;
    card.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>syncCard(card,index)));
    card.querySelector('.remove').addEventListener('click',()=>{if(confirm(`${p.mtm||'이 상품'}을 목록에서 제거할까?`)){products.splice(index,1);render();}});
    cards.append(card);syncCard(card,index);
  });
}
async function save(){
  document.querySelectorAll('.card').forEach(card=>syncCard(card,Number(card.dataset.index)));
  const allErrors=products.flatMap((p,i)=>validate(p,i));
  if(allErrors.length){notice.textContent='저장하지 못했어. 빨간색 오류를 먼저 확인해.';return;}
  const result=await chrome.runtime.sendMessage({type:'SAVE_PRODUCTS',products});
  if(!result?.ok){notice.textContent='저장 중 오류가 발생했어.';return;}
  const payload={version:1,savedAt:new Date().toISOString(),products};
  const url='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(payload,null,2));
  await chrome.downloads.download({url,filename:'MarketPulse/product-catalog.json',conflictAction:'overwrite',saveAs:false});
  notice.textContent='저장 완료. 다음 자동수집부터 변경사항이 적용돼.';
}
document.querySelector('#add').addEventListener('click',()=>{products.unshift({brand:'Acer',category:'Notebook',mtm:'',skuid:'',srp:null,enabled:true,url:'',danawaUrl:'',productId:'',itemId:'',vendorItemId:''});render();window.scrollTo({top:0,behavior:'smooth'});});
document.querySelector('#save').addEventListener('click',save);document.querySelector('#saveBottom').addEventListener('click',save);document.querySelector('#search').addEventListener('input',render);
chrome.runtime.sendMessage({type:'GET_PRODUCTS'},response=>{products=response?.products||[];render();});
