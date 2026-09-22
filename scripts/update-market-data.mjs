import fs from "node:fs/promises";

const DATA_FILE = new URL("../brand/lenovo/market-data.js", import.meta.url);
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
let manualOnly = 0;
let minePrices = 0;
for (const product of data.products) {
  const candidates = product.offers.filter((offer) => offer.role === "competitor" && offer.url);
  await Promise.all(candidates.map(async (offer) => {
    // 다나와 상세는 여러 판매처와 출시가가 한 문서에 섞여 있으므로
    // 판매자별 가격을 자동 추출하지 않고 정밀조사에서만 갱신합니다.
    if (/prod\.danawa\.com\/info/i.test(offer.url)) {
      manualOnly += 1;
      return;
    }
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

  // Coupang prices are owned by the visible Chrome collector. GitHub only preserves them.
  const mine = product.offers.find((offer) => offer.role === "mine");
  const todayKst = displayTime.slice(0, 10);
  const mineIsFresh = mine && Number.isFinite(mine.finalPrice)
    && typeof mine.priceCheckedAt === "string"
    && mine.priceCheckedAt.startsWith(todayKst);
  if (mineIsFresh) {
    mine.status = "현재가 직접 확인";
    mine.confidence = "A";
    mine.confidenceText = "동일 Item ID의 일반 Chrome 화면에서 당일 가격 확인";
    mine.alertEligible = true;
    minePrices += 1;
  } else if (mine) {
    mine.status = "직전 직접 확인 · 당일 미확인";
    mine.confidence = "C";
    mine.confidenceText = "동일 Item ID의 과거 직접 확인값이며 당일 현재가가 아님";
    mine.alertEligible = false;
  }
}

data.meta.snapshotAt = checkedAt;
const latestChromeCheck = data.products
  .map((product) => product.offers.find((offer) => offer.role === "mine")?.priceCheckedAt)
  .filter(Boolean).sort().at(-1);
data.meta.monitoring.enabled = true;
data.meta.monitoring.quickWatch = "매일 08:00 KST";
data.meta.monitoring.fullResearch = "기본+정밀 동시 실행";
data.meta.monitoring.dashboardSync = "GitHub Pages 자동 반영";
data.meta.monitoring.collectionRoute = "Windows PC · 일반 Chrome 확장프로그램";
data.meta.monitoring.lastAttemptAt = latestChromeCheck
  ? latestChromeCheck.replace(" ", "T") + ":00+09:00"
  : data.meta.monitoring.lastAttemptAt;
data.meta.monitoring.lastAttemptStatus = minePrices === data.products.length ? "success" : "partial";
data.meta.monitoring.lastAttemptText =
  `Lenovo Chrome 현재가 ${minePrices}/${data.products.length} 확인 · 직접 판매처 ${successes}/${attempts} 확인 · 다나와 ${manualOnly}건 정밀조사 대기`;
data.meta.monitoring.competitionLastAttemptAt = checkedAt;

await fs.writeFile(DATA_FILE, "window.MARKET_DATA = " + JSON.stringify(data, null, 2) + ";\n");
console.log(`Market Pulse ${mode}: ${successes}/${attempts} verified at ${checkedAt}`);
