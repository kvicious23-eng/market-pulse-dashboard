import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node scripts/import-supplier-inventory-json.mjs <latest-supplier-inventory.json>");

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (payload.inventoryType !== "supplier-hub-previous-day" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.asOfDate || "")) {
  throw new Error("Invalid Supplier Hub inventory JSON metadata");
}
if (!Array.isArray(payload.results)) throw new Error("Inventory results are missing");

const results = new Map();
for (const result of payload.results) {
  const skuid = String(result.skuid || "");
  if (!/^\d+$/.test(skuid) || results.has(skuid)) throw new Error(`Invalid or duplicate skuid: ${skuid}`);
  if (result.status === "captured") {
    const values = [result.total, result.fc, result.rc, result.other];
    if (!values.every(value => Number.isInteger(value) && value >= 0)) throw new Error(`Invalid inventory value: ${skuid}`);
    if (result.total !== result.fc + result.rc + result.other) throw new Error(`Inventory sum mismatch: ${skuid}`);
  } else if (result.status !== "missing") {
    throw new Error(`Unsupported inventory status: ${skuid}`);
  }
  results.set(skuid, result);
}

function readMarketData(filePath) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return context.window.MARKET_DATA;
}

function writeMarketData(filePath, data) {
  fs.writeFileSync(filePath, `window.MARKET_DATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
}

let matched = 0;
let missing = 0;
for (const relativePath of ["dist/market-data.js", "acer/market-data.js"]) {
  const filePath = path.resolve(relativePath);
  const data = readMarketData(filePath);
  for (const product of data.products) {
    const skuid = String(product.skuid || "");
    const result = results.get(skuid);
    if (result?.status === "captured") {
      product.inventory = {
        status: "captured", asOfDate: payload.asOfDate,
        total: result.total, fc: result.fc, rc: result.rc, other: result.other,
        sourceRowCount: result.rowCount, source: payload.source,
        sourceFile: "latest-supplier-inventory.json", reason: ""
      };
      matched += 1;
    } else {
      product.inventory = {
        status: "missing", asOfDate: payload.asOfDate,
        total: null, fc: null, rc: null, other: null,
        sourceRowCount: 0, source: payload.source,
        sourceFile: "latest-supplier-inventory.json",
        reason: result ? "skuid-not-present-for-date" : "skuid-result-not-found"
      };
      missing += 1;
    }
  }
  writeMarketData(filePath, data);
}

if (matched + missing !== 13) throw new Error(`Unexpected registered product count: ${matched + missing}`);
console.log(JSON.stringify({ asOfDate: payload.asOfDate, matched, missing }, null, 2));
