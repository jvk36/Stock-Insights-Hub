import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearFxCache,
  convertToUsd,
  getUsdRate,
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