import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DJIA_SEED,
  NASDAQ100_SEED,
  extractMetrics,
  isValidDjiaRoster,
  normalizeNasdaq100Stocks,
} from "./indexes.ts";

test("rejects annual performance rows as a DJIA roster", () => {
  const annualRows = Array.from({ length: 30 }, (_, i) => ({
    symbol: i === 0 ? "-0.49" : "40.45",
    name: String(1896 + i),
    sector: "-1.20",
  }));
  assert.equal(isValidDjiaRoster(annualRows), false);
});

test("accepts a 30-company ticker roster with meaningful sectors", () => {
  const roster = Array.from({ length: 30 }, (_, i) => ({
    symbol: `T${String(i).padStart(2, "0")}`,
    name: `Company ${i}`,
    sector: i % 2 ? "Financials" : "Industrials",
  }));
  assert.equal(isValidDjiaRoster(roster), true);
});

test("canonical Dow seed is a valid 30-company roster", () => {
  assert.equal(DJIA_SEED.length, 30);
  assert.equal(isValidDjiaRoster(DJIA_SEED), true);
  assert.ok(DJIA_SEED.every((stock) => stock.sector.length > 0));
});

test("canonical Nasdaq-100 fallback has a GICS sector for every record", () => {
  assert.ok(NASDAQ100_SEED.length >= 100);
  assert.ok(NASDAQ100_SEED.every((stock) => stock.sector.length > 0));
});

test("Nasdaq-100 normalizer applies representative GICS sectors", () => {
  const rows = normalizeNasdaq100Stocks([
    { symbol: "NVDA", name: "NVIDIA", sector: "" },
    { symbol: "AMZN", name: "Amazon", sector: "" },
    { symbol: "GOOGL", name: "Alphabet", sector: "" },
    { symbol: "WMT", name: "Walmart", sector: "" },
  ]);
  assert.deepEqual(rows.map((row) => row.sector), [
    "Information Technology",
    "Consumer Discretionary",
    "Communication Services",
    "Consumer Staples",
  ]);
});

test("ADR FCF yield compares USD-converted INR FCF with USD market cap", () => {
  const metrics = extractMetrics({
    price: { marketCap: 10_000_000_000 },
    financialData: { freeCashflow: 108_508_127_232 },
  }, { financialToUsdRate: 0.01043 });
  assert.equal(metrics.fcfYield, 11.32);
});

test("ADR FCF yield is unavailable when FX is unavailable", () => {
  const metrics = extractMetrics({
    price: { marketCap: 10_000_000_000 },
    financialData: { freeCashflow: 108_508_127_232 },
  }, { financialToUsdRate: null });
  assert.equal(metrics.fcfYield, null);
});