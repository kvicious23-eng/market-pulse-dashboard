import fs from "node:fs/promises";

const FILE = new URL("../acer/market-data.js", import.meta.url);
const mode = process.env.SCAN_MODE || "precision";
const now = new Date();
const stamp = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
}).format(now).replace(" ", "T") + "+09:00";
const display = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false
}).format(now);

const raw = await fs.readFile(FILE, "utf8");
const data = Function('"use strict";return (' +
  raw.replace(/^window\.MARKET_DATA\s*=\s*/, "").replace(/;\s*$/, "") + ")")();

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AcerMarketPulse/2.0)",
      "accept-language": "ko-KR,ko;q=0.9"
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.text();
}

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#44;/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function danawaSellerOffers(html, mtm) {
  const pageText = visibleText(html);
  if (!pageText.toUpperCase().includes(mtm.toUpperCase())) return [];
  if (/일시\s*품절\s*상품/.test(pageText.slice(0, 12000))) return [];

  const sectionStart = html.indexOf("쇼핑몰별 최저가");
  const sectionEnd = html.indexOf("최저가 추이", sectionStart + 1);
  const scope = sectionStart >= 0
    ? html.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : sectionStart + 120000)
    : html;

  const bySeller = new Map();
  const pattern = /<img\b[^>]*\balt=["']([^"']+)["'][^>]*>[\s\S]{0,2200}?([0-9][0-9,]{4,})\s*원/gi;
  for (const match of scope.matchAll(pattern)) {
    const seller = match[1].replace(/<[^>]+>/g, "").trim();
    const price = Number(match[2].replace(/,/g, ""));
    if (!seller || /로딩중|상품.*이미지|다나와/i.test(seller)) continue;
    if (price < 250000 || price > 7000000) continue;
    if (!bySeller.has(seller) || price < bySeller.get(seller)) bySeller.set(seller, price);
  }
  return [...bySeller].map(([seller, price]) => ({ seller, price })).slice(0, 12);
}

function sellerChannel(seller) {
  if (/11번가|옥션|G마켓|롯데ON|쿠팡|SSG|네이버/i.test(seller)) return "오픈마켓";
  if (/Acer|에이서/i.test(seller)) return "제조사몰";
  return "전문몰";
}

function exactCoupangPrice(html, itemId) {
  const decoded = html.replace(/&quot;/g, '"').replace(/&#44;/g, ",");
  const prices = [];
  let position = -1;
  while ((position = decoded.indexOf(String(itemId), position + 1)) >= 0) {
    const scope = decoded.slice(Math.max(0, position - 5000), position + 5000);
    for (const match of scope.matchAll(/(?:salePrice|finalPrice|totalPrice|discountPrice)["'\s:=]+["']?([0-9]{5,9})/gi)) {
      const value = Number(match[1]);
      if (value >= 250000 && value <= 7000000) prices.push(value);
    }
  }
  return prices.length ? Math.min(...prices) : null;
}

let attempts = 0;
let identifiers = 0;
let currentPrices = 0;
let minePrices = 0;

for (const product of data.products) {
  const mine = product.offers.find((offer) => offer.role === "mine");
  const preservedCompetitors = product.offers.filter((offer) => offer.role === "competitor");
  product.offers = mine ? [mine, ...preservedCompetitors] : [...preservedCompetitors];
  product.validation = "identifiers-verified";
  identifiers++;

  // Coupang prices are owned by the visible Chrome collector. GitHub only preserves them.
  if (mine && Number.isFinite(mine.finalPrice) && mine.priceCheckedAt) {
    mine.status = "현재가 직접 확인";
    mine.confidence = "A";
    mine.confidenceText = "동일 Item ID의 일반 Chrome 화면에서 가격 확인";
    minePrices++;
  }


  const danawa = product.references.find((ref) => ref.sourceType === "다나와 개별 상품 페이지");
  if (!danawa) continue;

  attempts++;
  try {
    const html = await fetchText(danawa.url);
    const sellers = danawaSellerOffers(html, product.mtm);
    if (sellers.length) {
      product.offers = product.offers.filter((offer) => offer.role !== "competitor");
      const lowest = Math.min(...sellers.map((entry) => entry.price));
      Object.assign(danawa, {
        seller: "다나와 판매처 목록",
        status: "현재 판매처 확인",
        displayPrice: lowest,
        finalPrice: lowest,
        referencePrice: lowest,
        checkedAt: display,
        confidence: "B",
        confidenceText: `동일 MTM의 판매처 ${sellers.length}개를 다나와 상세 페이지에서 확인`
      });
      for (const entry of sellers) {
        product.offers.push({
          role: "competitor",
          channel: sellerChannel(entry.seller),
          seller: entry.seller,
          status: "판매중",
          displayPrice: entry.price,
          instantDiscount: null,
          couponDiscount: null,
          cardDiscount: null,
          finalPrice: entry.price,
          shipping: 0,
          condition: "다나와 배송비 포함 공개 판매가. 추가 쿠폰·카드할인은 미확인.",
          sourceType: "다나와 가격비교 판매처 목록",
          checkedAt: display,
          confidence: "B",
          confidenceText: "정확한 MTM의 쇼핑몰별 판매가를 다나와 상세 페이지에서 확인",
          url: danawa.url
        });
      }
      currentPrices++;
    } else {
      Object.assign(danawa, {
        status: html.includes("일시 품절 상품입니다") ? "일시 품절" : "판매처 재검증 대기",
        displayPrice: null,
        finalPrice: null,
        checkedAt: display,
        confidence: "C",
        confidenceText: "동일 MTM의 개별 판매처를 확인하지 못해 비교에서 제외"
      });
    }
  } catch {
    Object.assign(danawa, {
      status: "접근 제한·재검증 대기",
      displayPrice: null,
      finalPrice: null,
      checkedAt: display,
      confidence: "C",
      confidenceText: "접근 제한으로 현재가 계산에서 제외"
    });
  }
}

data.meta.snapshotAt = stamp;
const latestChromeCheck = data.products
  .map((product) => product.offers.find((offer) => offer.role === "mine")?.priceCheckedAt)
  .filter(Boolean).sort().at(-1);
data.meta.monitoring.quickWatch = "매일 11:30 KST";
data.meta.monitoring.collectionRoute = "Windows PC · 일반 Chrome 확장프로그램";
data.meta.monitoring.lastAttemptAt = latestChromeCheck
  ? latestChromeCheck.replace(" ", "T") + ":00+09:00"
  : data.meta.monitoring.lastAttemptAt;
data.meta.monitoring.lastAttemptStatus = minePrices === data.products.length ? "success" : "partial";
data.meta.monitoring.lastAttemptText =
  `Acer Chrome 현재가 ${minePrices}/${data.products.length} 확인 · GitHub 경쟁가 ${currentPrices}/${data.products.length} 확인`;
data.meta.monitoring.competitionLastAttemptAt = stamp;

await fs.writeFile(FILE, "window.MARKET_DATA = " + JSON.stringify(data, null, 2) + ";\n");
console.log(`Acer exact scan: identifiers ${identifiers}/${data.products.length}, prices ${currentPrices}/${data.products.length}, attempts ${attempts}, ${stamp}`);
