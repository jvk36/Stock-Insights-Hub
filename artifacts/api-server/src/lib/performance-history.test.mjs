import test from "node:test";
import assert from "node:assert/strict";
import { normalizePerformanceHistory, performanceSymbol } from "./performance-history.ts";

test("accepts arbitrary supported tickers and maps class aliases", () => {
  assert.equal(performanceSymbol(" brk.a "), "BRK-A");
  assert.equal(performanceSymbol("0700.hk"), "0700.HK");
  assert.equal(performanceSymbol("^gspc"), "^GSPC");
  assert.equal(performanceSymbol("ZZOUTSIDE"), "ZZOUTSIDE");
  for (const invalid of ["", "../secret", "AAPL?x=1", "https://evil", "A A"]) assert.equal(performanceSymbol(invalid), null);
});
test("normalizes adjusted prices, deduplicates and excludes partial sessions", () => {
  const result = normalizePerformanceHistory([
    { date: new Date("2026-01-05T14:30:00Z"), adjclose: 100 },
    { date: "2026-01-02", adjclose: 90 },
    { date: "2026-01-05", adjclose: 101 },
    { date: "2026-01-06", adjclose: 102 },
    { date: "invalid", adjclose: 1 },
    { date: "2026-01-01", adjclose: 0 },
    { date: "2025-12-31", adjclose: null },
  ], "2026-01-06");
  assert.deepEqual(result.prices, [{ date: "2026-01-02", adjustedClose: 90 }, { date: "2026-01-05", adjustedClose: 101 }]);
  assert.equal(result.skipped, 3);
});
test("does not invent total returns from missing adjusted closes", () => {
  assert.deepEqual(normalizePerformanceHistory([{ date: "2026-01-02" }], "2026-01-06").prices, []);
});
test("uses the exchange calendar date, not UTC, at month boundaries", () => {
  const result = normalizePerformanceHistory([
    { date: new Date("2026-01-31T21:00:00Z"), adjclose: 100 },
  ], "2026-02-03", "Pacific/Auckland");
  assert.equal(result.prices[0].date, "2026-02-01");
});
