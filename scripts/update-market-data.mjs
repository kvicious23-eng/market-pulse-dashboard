import fs from "node:fs/promises";

const DATA_FILE = new URL("../dist/market-data.js", import.meta.url);
const mode = process.env.SCAN_MODE || "daily";
const now = new Date();
const kst = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
}).format(now).replace(" ", "T") + "+09:00";

const text = await fs.readFile(DATA_FILE, "utf8");
const jsonText = text.replace(/^window\.MARKET_PULSE_DATA\s*=\s*/, "").replace(/;\s*$/, "");
const data = Function('"use strict";return (' + jsonText + ")")();

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; MarketPulseBot/1.0; +https://github.com/kvicious23-eng/market-pulse-dashboard)",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.7"
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function pricesNearModel(html, mtm) {
  const clean = html.replace(/&quot;/g, '"').replace(/&#44;/g, ",");
  const pos = clean.toUpperCase().indexOf(mtm.toUpperCase());
  const scope = pos >= 0 ? clean.slice(Math.max(0, pos - 180000), pos + 350000) : clean;
  const values = [];
  for (const m of scope.matchAll(/(?:lowPrice|salePrice|price)["'\s:=]+["']?([0-9]{5,9})/gi)) {
    const n = Number(m[1]);
    if (n >= 300000 && n <= 5000000) values.push(n);
  }
  return [...new Set(values)].sort((a,b) => a-b);
}

for (const product of data.products) {
  const sources = [...new Set(product.marketRows.map(r => r.url).filter(Boolean))];
  const observations = [];
  for (const url of sources) {
    try {
      const html = await fetchText(url);
      const found = pricesNearModel(html, product.mtm);
      if (found.length) observations.push({url, price: found[0], checkedAt: kst});
    } catch (error) {
      observations.push({url, error: String(error.message || error), checkedAt: kst});
    }
  }

  product.automation = {
    mode,
    checkedAt: kst,
    sourcesAttempted: sources.length,
    sourcesSucceeded: observations.filter(x => x.price).length,
    observations
  };

  const verified = observations.map(x => x.price).filter(Number.isFinite);
  if (verified.length) {
    product.marketLowest = Math.min(...verified);
    product.marketLowestSeller = "자동 조사 확인 최저가";
  }

  if (mode === "precision") {
    try {
      const html = await fetchText(product.coupang.url);
      const hasExactItem = html.includes(String(product.coupang.itemId));
      product.coupang.verificationStatus = hasExactItem
        ? "Exact itemId page reached; member/와우 price requires logged-in verification"
        : "Coupang page reached but exact itemId was not visible in returned HTML";
      product.coupang.checkedAt = kst;
    } catch (error) {
      product.coupang.verificationStatus = "Exact itemId check blocked: " + String(error.message || error);
      product.coupang.checkedAt = kst;
    }
  }
}

data.updatedAt = kst;
data.status = mode === "precision" ? "precision-market-check" : "daily-market-check";
data.note = `${kst} automated ${mode} scan completed. Prices change only when a numeric value is re-verified; Coupang 와우 prices are never inferred.`;

const out = "window.MARKET_PULSE_DATA = " + JSON.stringify(data, null, 2) + ";\n";
await fs.writeFile(DATA_FILE, out);
console.log(`Updated ${DATA_FILE.pathname} at ${kst} (${mode})`);
