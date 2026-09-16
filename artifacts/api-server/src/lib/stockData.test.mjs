import assert from "node:assert/strict";
import { test } from "node:test";
import { createStockMetricsService } from "./stockData.ts";

function chart() {
  const close = Array.from({ length: 220 }, (_, i) => 100 + i);
  return { chart: { result: [{ meta: { regularMarketPrice: 320, longName: "Example Co" }, indicators: { quote: [{ close }] } }] } };
}

const summary = {
  quoteSummary: { result: [{ defaultKeyStatistics: { forwardPE: { raw: 18 }, shortPercentOfFloat: { raw: 0.05 }, beta: { raw: 1.2 } }, financialData: { debtToEquity: { raw: 163 }, earningsGrowth: { raw: 0.15 } } }] },
};

test("returns chart and fundamentals independently with documented units", async () => {
  let chartCalls = 0;
  let summaryCalls = 0;
  const metrics = await createStockMetricsService({
    fetchChart: async () => { chartCalls++; return chart(); },
    fetchSummary: async () => { summaryCalls++; return summary; },
  })("AAPL");
  assert.equal(metrics.currentPrice, 320);
  assert.ok(metrics.ma50 != null);
  assert.ok(metrics.ma200 != null);
  assert.equal(metrics.peRatioForward, 18);
  assert.equal(metrics.epsGrowthYoy, 15);
  assert.equal(metrics.shortInterestPct, 5);
  assert.equal(metrics.debtToEquity, 1.63);
  assert.equal(metrics.beta, 1.2);
  assert.equal(chartCalls, 1);
  assert.equal(summaryCalls, 1);
});

test("caches fresh metrics for twenty minutes", async () => {
  let now = 1_000_000;
  let calls = 0;
  const getMetrics = createStockMetricsService({
    now: () => now,
    fetchChart: async () => { calls++; return chart(); },
    fetchSummary: async () => summary,
  });
  await getMetrics("MSFT");
  await getMetrics("MSFT");
  assert.equal(calls, 1);
  now += 20 * 60_000 + 1;
  await getMetrics("MSFT");
  assert.equal(calls, 2);
});

test("preserves the last successful values when a refresh fails", async () => {
  let now = 1_000_000;
  let fail = false;
  const getMetrics = createStockMetricsService({
    now: () => now,
    fetchChart: async () => fail ? Promise.reject(new Error("rate limited")) : chart(),
    fetchSummary: async () => fail ? Promise.reject(new Error("rate limited")) : summary,
  });
  const first = await getMetrics("NVDA");
  now += 20 * 60_000 + 1;
  fail = true;
  const stale = await getMetrics("NVDA");
  assert.equal(stale.currentPrice, first.currentPrice);
  assert.equal(stale.ma50, first.ma50);
  assert.equal(stale.epsGrowthYoy, first.epsGrowthYoy);
});

test("returns chart fields when fundamentals are unavailable", async () => {
  const metrics = await createStockMetricsService({
    fetchChart: async () => chart(),
    fetchSummary: async () => Promise.reject(new Error("fundamentals unavailable")),
  })("TSLA");
  assert.equal(metrics.currentPrice, 320);
  assert.ok(metrics.ma50 != null);
  assert.equal(metrics.peRatioForward, null);
  assert.equal(metrics.debtToEquity, null);
});