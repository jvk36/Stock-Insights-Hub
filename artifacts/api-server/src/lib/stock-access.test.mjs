import assert from "node:assert/strict";
import test from "node:test";
import { createStockAccess } from "./stock-access.ts";

function check(section, method = "GET") {
  let premiumChecks = 0;
  let passed = 0;
  const guard = createStockAccess(() => { premiumChecks++; });
  guard({ method, params: { section } }, {}, () => { passed++; });
  return { premiumChecks, passed };
}

test("all Overview data is free, including earnings overlays and financial statements", () => {
  for (const section of ["quote", "chart", "earnings-history", "financials", "news", "profile", "sec-filings"]) {
    assert.deepEqual(check(section), { premiumChecks: 0, passed: 1 }, section);
  }
});

test("every other stock sub-tab requires Premium on the API", () => {
  for (const section of ["indicators", "fundamentals", "screener-ratings", "board-leadership", "buyback-history", "insider-transactions", "analysis", "models"]) {
    assert.deepEqual(check(section), { premiumChecks: 1, passed: 0 }, section);
  }
});

test("unknown endpoints and write methods do not bypass Premium", () => {
  assert.deepEqual(check("new-premium-feature"), { premiumChecks: 1, passed: 0 });
  assert.deepEqual(check("quote", "POST"), { premiumChecks: 1, passed: 0 });
});
