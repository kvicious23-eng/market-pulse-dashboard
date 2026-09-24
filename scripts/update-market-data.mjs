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

let successes = 0;
let attempts = 0;
let manualOnly = 0;
let minePrices = 0;
for (const product of data.products) {
  const candidates = product.offers.filter((offer) => offer.role === "competitor" && offer.url);
  // HTML-wide price fields cannot prove whether a listing requires overseas
  // purchase or cash payment. Preserve references but never promote them.
  for (const offer of candidates) {
    manualOnly += 1;
    offer.alertEligible = false;
  }

  // Coupang prices are owned by the visible Chrome collector. GitHub only preserves them.
  const mine = product.offers.find((offer) => offer.role === "mine");
  const todayKst = displayTime.slice(0, 10);
  const mineIsFresh = mine && Number.isFinite(mine.finalPrice)
    && mine.alertEligible === true
    && mine.checkoutDiscountStatus === "captured"
    && ["captured", "none"].includes(mine.cardBenefitStatus)
    && typeof mine.priceCheckedAt === "string"
    && mine.priceCheckedAt.startsWith(todayKst);
  if (mineIsFresh) {
    minePrices += 1;
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
