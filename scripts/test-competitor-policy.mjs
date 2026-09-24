import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const scanner = fs.readFileSync('chrome-extension/background.js', 'utf8');
const start = scanner.indexOf('function readDanawaSellers(');
const end = scanner.indexOf('\n\nasync function scanAll()', start);
assert.ok(start >= 0 && end > start);

function scan(title, row) {
  const rowElement = {innerText:row, parentElement:null};
  const imgParent = {innerText:row, parentElement:rowElement};
  const img = {parentElement:imgParent, getAttribute:()=>'판매처A'};
  const root = {querySelectorAll:()=>[img]};
  const heading = {textContent:'쇼핑몰별 최저가',parentElement:{parentElement:root}};
  const document = {
    title, body:{innerText:`GODOX C100 ${title} ${row}`},
    querySelector:(selector)=>selector==='h1,h2,h3'?{textContent:title}:null,
    querySelectorAll:()=>[heading]
  };
  const context = {document};
  vm.runInNewContext(scanner.slice(start,end)+'\nthis.scan = readDanawaSellers;',context);
  return context.scan('C100',42000);
}

assert.equal(scan('GODOX C100 노출계 토이카메라 (정품)','41,910원 무료배송').sellers.length,1);
assert.equal(scan('GODOX C100 노출계 토이카메라 (해외구매)','34,000원 무료배송').reason,'excluded-product-or-payment');
assert.equal(scan('GODOX C100 현금가 전용','34,000원 무료배송').reason,'excluded-product-or-payment');
assert.equal(scan('GODOX C100 정품','현금가격 35,000원').sellers.length,0);
assert.equal(scan('GODOX C100 정품','현금 최저가 35,000원').sellers.length,0);
assert.equal(scan('GODOX C100 정품','무통장 입금 전용 35,000원').sellers.length,0);
assert.equal(scan('GODOX C100 정품','41,910원 현금영수증 발급 가능').sellers.length,1);
assert.equal(scan('GODOX C100 정품','41,910원 현금 영수증 발급 가능').sellers.length,1);

const dashboard = fs.readFileSync('dist/app.js','utf8');
const a = dashboard.indexOf('function effectiveCompetitorPrice(');
const b = dashboard.indexOf('\n\n  function isSoldOut(',a);
const ctx = {
  effectiveFinalPrice:offer=>offer.finalPrice,
  collectionDay:offer=>offer.priceCheckedAt?.slice(0,10)
};
vm.runInNewContext(dashboard.slice(a,b)+'\nthis.price = effectiveCompetitorPrice;',ctx);
const mine = {priceCheckedAt:'2026-09-24 14:00'};
const base = {priceCheckedAt:'2026-09-24 14:00',finalPrice:41910,competitionPolicyVerified:true};
assert.equal(ctx.price(base,mine),41910);
assert.equal(ctx.price({...base,competitionPolicyVerified:undefined},mine),null);
assert.equal(ctx.price({...base,condition:'현금가 전용'},mine),null);
assert.equal(ctx.price({...base,productTitle:'C100 해외구매'},mine),null);
const acer = fs.readFileSync('scripts/update-acer-data.mjs','utf8');
const extract = acer.slice(acer.indexOf('function visibleText('),acer.indexOf('\n\nfunction sellerChannel('));
const nodeCtx = {};
vm.runInNewContext(extract+'\nthis.offers = danawaSellerOffers;',nodeCtx);
const html = (title, details)=>`<title>${title}</title><h3>쇼핑몰별 최저가</h3><img alt="판매처A">${details}<h3>최저가 추이</h3>`;
assert.equal(nodeCtx.offers(html('Acer MTM123 정품','500,000원'),'MTM123').length,1);
assert.equal(nodeCtx.offers(html('Acer MTM123 해외구매','340,000원'),'MTM123').length,0);
assert.equal(nodeCtx.offers(html('Acer MTM123 정품','현금가 350,000원'),'MTM123').length,0);
const importer = fs.readFileSync('scripts/import-extension-results.ps1','utf8');
assert.match(importer,/\$pageTitle=\[string\]\$page\.title/);
assert.match(importer,/\$pageIdentityMatches=.*\$product\.mtm/);
assert.match(importer,/\$entry\.seller \+ ' ' \+ \$label \+ ' ' \+ \$title\) -match \$excludedCompetitor/);
assert.match(importer,/\$page\.source -eq '네이버' -and \$pageUrl -match '\[\?&\]query='/);
assert.match(importer,/\$title \+ ' ' \+ \$label\) -notmatch \[regex\]::Escape\(\[string\]\$spec\.Brand\)/);
assert.match(importer,/competitionLastAttemptAt -NotePropertyValue \$scanKst/);
assert.match(importer,/Where-Object \{ \$_\.competitorPages -or \$_\.competitorReason \}/);
console.log('Competition exclusions verified for scanner and dashboard.');
