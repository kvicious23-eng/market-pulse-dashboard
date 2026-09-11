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

function exactDanawaPrice(html, mtm) {
  const text = visibleText(html);
  const at = text.toUpperCase().indexOf(mtm.toUpperCase());
  if (at < 0) return null;
  const scope = text.slice(at, at + 12000);
  if (/일시\s*품절\s*상품/.test(scope.slice(0, 5000))) return null;
  const match = scope.match(/최저가\s+([0-9][0-9,]{4,})\s*원/);
  if (!match) return null;
  const price = Number(match[1].replace(/,/g, ""));
  return price >= 250000 && price <= 7000000 ? price : null;
}

let attempts = 0;
let identifiers = 0;
let currentPrices = 0;

for (const product of data.products) {
  const mine = product.offers.find((offer) => offer.role === "mine");
  product.offers = mine ? [mine] : [];
  product.validation = "identifiers-verified";
  identifiers++;

  attempts++;
  try {
    const html = await fetchText(mine.url);
    if (html.includes(String(product.itemId))) {
      mine.status = "상품 식별 확인·가격 제한";
      mine.checkedAt = display;
      mine.confidence = "C";
      mine.confidenceText = "동일 Item ID 확인, 로그인·와우 가격은 미반영";
    } else {
      mine.status = "가격 확인 중";
    }
  } catch {
    mine.status = "접근 제한·가격 확인 중";
  }
  mine.displayPrice = null;
  mine.finalPrice = null;

  const danawa = product.references.find((ref) => ref.sourceType === "다나와 개별 상품 페이지");
  if (!danawa) continue;

  attempts++;
  try {
    const html = await fetchText(danawa.url);
    const price = exactDanawaPrice(html, product.mtm);
    if (price) {
      Object.assign(danawa, {
        status: "현재가 확인",
        displayPrice: price,
        finalPrice: price,
        referencePrice: price,
        checkedAt: display,
        confidence: "B",
        confidenceText: "정확한 MTM과 용량을 개별 상품 페이지에서 확인"
      });
      product.offers.push({ ...danawa, role: "competitor" });
      currentPrices++;
    } else {
      Object.assign(danawa, {
        status: html.includes("일시 품절 상품입니다") ? "일시 품절" : "현재가 재검증 대기",
        displayPrice: null,
        finalPrice: null,
        checkedAt: display,
        confidence: "C",
        confidenceText: "현재 판매가로 사용할 값을 확인하지 못해 비교에서 제외"
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
data.meta.monitoring.lastAttemptAt = stamp;
data.meta.monitoring.lastAttemptStatus = currentPrices ? "success" : "partial";
data.meta.monitoring.lastAttemptText =
  `Acer ${mode} 조사 완료 · 식별자 ${identifiers}/${data.products.length} 검증 · 개별 상품 현재가 ${currentPrices}/${data.products.length} 확인 · 미확인 값은 비교 제외`;

await fs.writeFile(FILE, "window.MARKET_DATA = " + JSON.stringify(data, null, 2) + ";\n");
console.log(`Acer exact scan: identifiers ${identifiers}/${data.products.length}, prices ${currentPrices}/${data.products.length}, attempts ${attempts}, ${stamp}`);
