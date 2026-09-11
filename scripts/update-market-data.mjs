import fs from "node:fs/promises";

const DATA_FILE = new URL("../dist/market-data.js", import.meta.url);
const mode = process.env.SCAN_MODE || "daily";
const now = new Date();
const checkedAt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
}).format(now).replace(" ", "T") + "+09:00";
const displayTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false
}).format(now);

const source = await fs.readFile(DATA_FILE, "utf8");
const body = source.replace(/^window\.MARKET_DATA\s*=\s*/, "").replace(/;\s*$/, "");
const data = Function('"use strict";return (' + body + ")")();

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; MarketPulseBot/1.0; +https://github.com/kvicious23-eng/market-pulse-dashboard)",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.7"
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function verifiedPrices(html, mtm) {
  const decoded = html.replace(/&quot;/g, '"').replace(/&#44;/g, ",");
  const upper = decoded.toUpperCase();
  const position = upper.indexOf(mtm.toUpperCase());
  if (position < 0) return [];
  const scope = decoded.slice(Math.max(0, position - 140000), position + 280000);
  const values = [];
  for (const match of scope.matchAll(/(?:lowPrice|salePrice|finalPrice|price)["'\s:=]+["']?([0-9]{5,9})/gi)) {
    const value = Number(match[1]);
    if (value >= 300000 && value <= 5000000) values.push(value);
  }
  return [...new Set(values)].sort((a, b) => a - b);
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

let successes = 0;
let attempts = 0;
let minePrices = 0;
for (const product of data.products) {
  const candidates = product.offers.filter((offer) => offer.role === "competitor" && offer.url);
  await Promise.all(candidates.map(async (offer) => {
    attempts += 1;
    try {
      const html = await fetchText(offer.url);
      const prices = verifiedPrices(html, product.mtm);
      if (!prices.length) return;
      const price = prices[0];
      offer.displayPrice = price;
      offer.finalPrice = price + (offer.shipping || 0);
      offer.checkedAt = displayTime;
      offer.confidence = offer.url.includes("lenovo.com") ? "A" : "B";
      offer.confidenceText = "자동 조사에서 MTM과 가격을 함께 재확인";
      successes += 1;
    } catch {
      // 접근 제한 시 마지막 검증값을 보존합니다.
    }
  }));

  if (mode === "precision") {
    const mine = product.offers.find((offer) => offer.role === "mine");
    if (mine?.url) {
      attempts += 1;
      try {
        const html = await fetchText(mine.url);
        const exactItem = html.includes(String(product.itemId));
        const currentPrice = exactItem ? exactCoupangPrice(html, product.itemId) : null;
        mine.availabilityCheckedAt = displayTime;
        if (currentPrice) {
          mine.displayPrice = currentPrice;
          mine.finalPrice = currentPrice + (mine.shipping || 0);
          mine.priceCheckedAt = displayTime;
          mine.checkedAt = displayTime;
          mine.status = "현재가 직접 확인";
          mine.confidence = "A";
          mine.confidenceText = "동일 Item ID 주변의 공개 가격을 직접 확인";
          minePrices += 1;
          successes += 1;
        } else if (exactItem) {
          mine.status = Number.isFinite(mine.finalPrice) ? "최근 검증가 · 상품 확인" : "가격 미확인 · 상품 확인";
          mine.confidenceText = Number.isFinite(mine.finalPrice)
            ? "동일 Item ID 확인, 가격은 마지막 검증값(" + (mine.priceCheckedAt || mine.checkedAt) + ") 유지"
            : "동일 Item ID 확인, 공개 가격은 확인되지 않음";
          successes += 1;
        } else {
          mine.status = Number.isFinite(mine.finalPrice) ? "최근 검증가 · 자동확인 실패" : "가격 미확인 · 자동접근 제한";
        }
      } catch {
        mine.availabilityCheckedAt = displayTime;
        mine.status = Number.isFinite(mine.finalPrice) ? "최근 검증가 · 자동확인 실패" : "가격 미확인 · 자동접근 제한";
      }
    }
  }
}

data.meta.snapshotAt = checkedAt;
data.meta.monitoring.enabled = true;
data.meta.monitoring.quickWatch = "매일 10:00 KST";
data.meta.monitoring.fullResearch = "기본+정밀 동시 실행";
data.meta.monitoring.dashboardSync = "GitHub Pages 자동 반영";
data.meta.monitoring.lastAttemptAt = checkedAt;
data.meta.monitoring.lastAttemptStatus = minePrices === data.products.length ? "success" : "partial";
data.meta.monitoring.lastAttemptText = `${mode === "precision" ? "정밀" : "기본"} 조사 완료 · 내 쿠팡 현재가 직접확인 ${minePrices}/${data.products.length} · 접근 제한 시 마지막 검증가 유지 · 전체 출처 ${successes}/${attempts} 확인`;

await fs.writeFile(DATA_FILE, "window.MARKET_DATA = " + JSON.stringify(data, null, 2) + ";\n");
console.log(`Market Pulse ${mode}: ${successes}/${attempts} verified at ${checkedAt}`);
