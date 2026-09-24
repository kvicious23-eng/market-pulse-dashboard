import assert from 'node:assert/strict';

// One-product diagnostic. It never updates dashboard data or stores API credentials.
const query='Godox C100';
const endpoint=new URL('https://openapi.naver.com/v1/search/shop.json');
endpoint.search=new URLSearchParams({query,display:'100',start:'1',sort:'sim',exclude:'used:rental:cbshop'}).toString();

function normalize(value) {
  return String(value||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
}

function classify(item) {
  const title=normalize(item.title);
  const brand=normalize(item.brand);
  const maker=normalize(item.maker);
  const name=[title,brand,maker].join(' ');
  if(!/(^|[^a-z0-9])c100(?![a-z0-9])/i.test(title)) return null;
  if(/c100\s*(?:[-/]\s*)?(?:pro|plus|max)(?![a-z0-9])/i.test(title)) return null;
  if(!/(godox|고독스)/i.test(name)) return null;
  if(brand && !/(godox|고독스)/i.test(brand)) return null;
  if(/케이스|파우치|필름|스트랩|보호필름|거치대|메모리카드|배터리|렌즈캡|액세서리|악세사리/.test(title)) return null;
  const price=Number(item.lprice);
  const type=Number(item.productType);
  if(!Number.isInteger(price)||price<=0||![1,2,3].includes(type)) return null;
  return {
    title,brand,mall:normalize(item.mallName),price,productType:type,
    priceScope:type===1?'네이버 가격비교 상품 최저가':'개별 쇼핑몰 상품 등록가',
    productId:String(item.productId||''),url:/^https?:\/\//i.test(item.link||'')?item.link:null
  };
}

if(process.argv.includes('--self-test')) {
  const base={title:'<b>고독스</b> Godox C100 투명 뷰파인더 카메라',brand:'Godox',mallName:'예시몰',lprice:'42000',productType:'2',productId:'test'};
  assert.equal(classify(base).price,42000);
  assert.equal(classify({...base,productType:'1'}).priceScope,'네이버 가격비교 상품 최저가');
  for(const title of ['고독스 C100 Pro 카메라','고독스 C100 전용 케이스','고독스 C100X 카메라']) assert.equal(classify({...base,title}),null);
  assert.equal(classify({...base,brand:'Acer'}),null);
  assert.equal(classify({...base,productType:'4'}),null);
  console.log('Godox C100 matching checks passed (synthetic data only).');
} else {
  const clientId=process.env.NAVER_CLIENT_ID;
  const clientSecret=process.env.NAVER_CLIENT_SECRET;
  if(!clientId||!clientSecret) {
    console.error('NAVER_CLIENT_ID and NAVER_CLIENT_SECRET must be set locally. No Naver API request was made.');
    process.exitCode=2;
  } else {
    try {
      const response=await fetch(endpoint,{
        headers:{'X-Naver-Client-Id':clientId,'X-Naver-Client-Secret':clientSecret},
        signal:AbortSignal.timeout(15000)
      });
      if(!response.ok) throw new Error(`Naver Shopping API returned HTTP ${response.status}`);
      const payload=await response.json();
      if(!Array.isArray(payload.items)) throw new Error('Naver Shopping API returned no items array');
      const matches=payload.items.map(classify).filter(Boolean);
      console.log(JSON.stringify({source:'Naver Shopping Search API',query,queriedAt:new Date().toISOString(),
        resultCount:payload.items.length,matchingCount:matches.length,
        caveat:'Listed/lowest prices are not independently verified checkout totals, shipping-inclusive prices, or live stock status.',
        matches},null,2));
    } catch(error) {
      console.error(error instanceof Error?error.message:String(error));
      process.exitCode=1;
    }
  }
}
