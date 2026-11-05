// Shared URL identities and catalogue rules. No accounts, SKUs or inferred specs.
(function(root){
  function identity(value){
    const u=new URL(value);
    const productId=u.pathname.match(/^\/vp\/products\/(\d+)\/?$/)?.[1];
    const itemId=u.searchParams.get('itemId'),vendorItemId=u.searchParams.get('vendorItemId');
    if(u.protocol!=='https:'||u.hostname!=='www.coupang.com'||u.username||u.password||u.port||!productId||![itemId,vendorItemId].every(x=>/^\d+$/.test(x||''))||u.searchParams.getAll('itemId').length!==1||u.searchParams.getAll('vendorItemId').length!==1)throw Error('경쟁상품 쿠팡 URL의 상품·옵션·판매자 ID를 확인해.');
    return {productId,itemId,vendorItemId,key:[productId,itemId,vendorItemId].join('-'),url:`https://www.coupang.com/vp/products/${productId}?itemId=${itemId}&vendorItemId=${vendorItemId}`};
  }
  function links(product){
    if(product.competitors!=null&&!Array.isArray(product.competitors))throw Error('경쟁모델 목록 형식 오류');
    const seen=new Set();
    return (product.competitors||[]).map(c=>{
      const id=identity(c.url),brand=String(c.brand||'').trim(),model=String(c.model||'').trim(),note=String(c.note||'').trim();
      if(brand.length>80)throw Error('경쟁모델 브랜드는 80자 이내로 입력해.');
      if(!model||model.length>160||note.length>500)throw Error('경쟁모델명 또는 비교 메모를 확인해.');
      if(seen.has(id.key))throw Error('같은 상품에 동일 경쟁모델이 중복 등록됐어.');seen.add(id.key);
      return {...id,brand,model,note,enabled:c.enabled!==false};
    });
  }
  function clean(product){const {danawaUrl,enuriUrl,naverUrl,...p}=product;return {...p,competitors:links(p)};}
  function targets(products){
    const byKey=new Map();
    for(const p of products.filter(p=>p.enabled!==false))for(const c of links(p).filter(c=>c.enabled)){
      if(!byKey.has(c.key))byKey.set(c.key,{brand:'Competitor',category:p.category||'',mtm:'CP-'+c.key,productId:c.productId,itemId:c.itemId,vendorItemId:c.vendorItemId,url:c.url,competitorKey:c.key,model:c.model,srp:null,minimumPrice:10000,enabled:true});
    }
    return [...byKey.values()];
  }
  function capacity(products){const own=products.filter(p=>p.enabled!==false).length,competitors=targets(products).length;return {own,competitors,total:own+competitors,minMinutes:(own+competitors)*75/60,maxMinutes:(own+competitors)*90/60};}
  const api={identity,links,clean,targets,capacity};root.CompetitorModels=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
