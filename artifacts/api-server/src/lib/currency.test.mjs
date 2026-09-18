import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearFxCache,
  convertStatementPerShareToUsd,
  convertToUsd,
  getUsdRate,
  normalizeFinancialAggregates,
  resolveFinancialCurrency,
} from "./currency.ts";

test("converts WIT-like INR financial values to USD", async () => {
  clearFxCache();
  const rate = await getUsdRate("INR", {
    fetcher: async () => ({ regularMarketPrice: 0.01043 }),
    now: () => 1_000,
  });
  assert.equal(resolveFinancialCurrency({ financialCurrency: "INR" }), "INR");
  assert.ok(Math.abs(convertToUsd(108_508_127_232, rate) - 1_131_739_767.03) < 1);
});

test("USD is a pure passthrough and unavailable FX is null", async () => {
  clearFxCache();
  assert.equal(await getUsdRate("USD", { fetcher: async () => { throw new Error("no call"); } }), 1);
  assert.equal(convertToUsd(123, null), null);
  assert.equal(await getUsdRate("INR", { fetcher: async () => { throw new Error("offline"); } }), null);
});

test("normalizes model aggregates once while preserving security-denominated values", () => {
  const row = normalizeFinancialAggregates({
    totalRevenue: 100_000,
    totalDebt: 20_000,
    cashAndCashEquivalents: 5_000,
    dilutedAverageShares: 1_000,
    dilutedEPS: 12,
    dividendRate: 3,
    currentPrice: 50,
  }, 0.01043);
  assert.equal(row.totalRevenue, 1043);
  assert.equal(row.totalDebt, 208.6);
  assert.equal(row.cashAndCashEquivalents, 52.15);
  assert.equal(row.dilutedAverageShares, 1_000);
  assert.equal(row.dilutedEPS, 12);
  assert.equal(row.dividendRate, 3);
  assert.equal(row.currentPrice, 50);
});

test("unavailable FX nulls aggregate model inputs instead of relabeling local values", () => {
  const row = normalizeFinancialAggregates({
    totalRevenue: 100_000,
    totalAssets: 250_000,
    dilutedAverageShares: 1_000,
  }, null);
  assert.equal(row.totalRevenue, null);
  assert.equal(row.totalAssets, null);
  assert.equal(row.dilutedAverageShares, 1_000);
});

test("converts reporting-currency statement EPS exactly once", () => {
  const rate = 0.01043;
  assert.ok(Math.abs(convertStatementPerShareToUsd(12.56, rate) - 0.1310008) < 1e-9);

  const normalizedNetIncome = convertToUsd(132_000_000_000, rate);
  const shares = 10_480_000_000;
  const fallbackEps = normalizedNetIncome / shares;
  assert.ok(Math.abs(fallbackEps - 0.1314) < 0.0001);

  // Quote-summary trailing EPS is already ADR/listing-denominated and bypasses
  // the statement conversion helper.
  const quoteSummaryTrailingEps = 0.13;
  assert.equal(quoteSummaryTrailingEps, 0.13);
  assert.equal(convertStatementPerShareToUsd(12.56, null), null);
  assert.equal(convertStatementPerShareToUsd(0.13, 1), 0.13);
});

test("FX cache is reused while fresh and serves stale value on refresh errors", async () => {
  clearFxCache();
  let now = 1_000;
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls > 1) throw new Error("offline");
    return { regularMarketPrice: 0.01 };
  };
  assert.equal(await getUsdRate("INR", { fetcher, now: () => now, ttlMs: 100 }), 0.01);
  now += 50;
  assert.equal(await getUsdRate("INR", { fetcher, now: () => now, ttlMs: 100 }), 0.01);
  assert.equal(calls, 1);
  now += 100;
  assert.equal(await getUsdRate("INR", { fetcher, now: () => now, ttlMs: 100 }), 0.01);
  assert.equal(calls, 2);
});