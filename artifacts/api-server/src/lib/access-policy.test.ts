import assert from "node:assert/strict";
import test from "node:test";
import { accessPolicy, apiRequiresPremium, canAccessFeature, isPremiumFeature, type AccessPolicy } from "@workspace/api-zod/access-policy";
import { createRequirePremium } from "./premium-middleware";

const enabled: AccessPolicy = { ...accessPolicy, paywallsEnabled: true };
const disabled: AccessPolicy = { ...accessPolicy, paywallsEnabled: false };
const routes = [
  ...["intrinsic-valuation", "indicators", "screener-ratings", "board-leadership",
    "buyback-history", "insider-transactions", "analysis", "models", "fundamentals"].map(s => `/api/stock/WIT/${s}`),
  ...["cloning", "magic-formula", "blind-trust", "momentum", "lazy"].map(s => `/api/model-portfolios/${s}`),
  ...["blind-trust", "momentum", "lazy"].map(s => `/api/model-portfolios/${s}/backtest`),
  ...["sp500", "nasdaq100", "sp400", "sp600", "djia", "adrs"].map(s => `/api/indexes/${s}/metrics`),
  "/api/performance/SPY",
];

test("free period grants every configured feature without pretending a visitor is paid", () => {
  for (const feature of accessPolicy.premiumFeatures) {
    assert.equal(isPremiumFeature(feature, disabled), false, feature);
    assert.equal(canAccessFeature(feature, false, disabled), true, feature);
  }
  for (const route of routes) assert.equal(apiRequiresPremium(route, disabled), false, route);
});
test("one switch restores all original paid feature boundaries", () => {
  for (const feature of enabled.premiumFeatures) {
    assert.equal(canAccessFeature(feature, false, enabled), false, feature);
    assert.equal(canAccessFeature(feature, true, enabled), true, feature);
  }
  for (const route of routes) assert.equal(apiRequiresPremium(route, enabled), true, route);
  for (const section of ["quote", "chart", "financials", "news", "profile", "earnings-history", "sec-filings"]) {
    assert.equal(apiRequiresPremium(`/api/stock/AAPL/${section}`, enabled), false);
  }
});
test("selected Premium tabs do not lock unrelated free tabs", () => {
  const policy = { paywallsEnabled: true, premiumFeatures: ["portfolios.cloning", "lab.valuation.models", "screens.adrs.advanced"] };
  for (const feature of policy.premiumFeatures) assert.equal(canAccessFeature(feature, false, policy), false);
  for (const feature of ["portfolios.lazy", "lab.performance", "lab.risk", "lab.valuation.analysis", "screens.sp500.advanced"]) {
    assert.equal(canAccessFeature(feature, false, policy), true);
  }
  assert.equal(apiRequiresPremium("/api/model-portfolios/cloning", policy), true);
  assert.equal(apiRequiresPremium("/api/model-portfolios/lazy", policy), false);
  assert.equal(apiRequiresPremium("/api/stock/AAPL/models", policy), true);
  assert.equal(apiRequiresPremium("/api/stock/AAPL/analysis", policy), false);
  assert.equal(apiRequiresPremium("/api/indexes/adrs/metrics", policy), true);
  assert.equal(apiRequiresPremium("/api/indexes/sp500/metrics", policy), false);
});
test("parent keys protect their descendants, never similarly named siblings", () => {
  const policy = { paywallsEnabled: true, premiumFeatures: ["portfolios", "lab.valuation"] };
  assert.equal(isPremiumFeature("portfolios.momentum", policy), true);
  assert.equal(isPremiumFeature("portfolios-extra", policy), false);
  assert.equal(isPremiumFeature("lab.valuation.models", policy), true);
  assert.equal(isPremiumFeature("lab.performance", policy), false);
});
test("shared history stays available when a consuming tab is free", () => {
  const policy = { paywallsEnabled: true, premiumFeatures: ["lab.performance"] };
  assert.equal(apiRequiresPremium("/api/performance/SPY", policy), false);
  assert.equal(canAccessFeature("lab.performance", false, policy), false);
  assert.equal(apiRequiresPremium("/api/stock/AAPL/fundamentals", { paywallsEnabled: true, premiumFeatures: ["lab.valuation.models"] }), false);
});
test("case, encoding and query strings cannot bypass restored paywalls", () => {
  for (const path of ["/api/stock/WIT/MODELS", "/api/stock/WIT/%6dodels", "/api/model-portfolios/CLONING?preview=true"]) {
    assert.equal(apiRequiresPremium(path, enabled), true);
  }
  for (const path of ["/api/stock/AAPL/new-feature", "/api/new-protected-feature", "/api/%INVALID"]) {
    assert.equal(apiRequiresPremium(path, enabled), true);
  }
});
test("free research bypasses membership lookup rather than forging membership", async () => {
  let resolved = false, passed = false;
  const response = { locals: {}, status() { throw new Error("Free research must not require authentication"); } };
  await createRequirePremium(async () => { resolved = true; throw new Error("Must not contact billing"); },
    req => apiRequiresPremium(req.originalUrl, disabled))(
    { originalUrl: "/api/model-portfolios/cloning" } as never, response as never, () => { passed = true; });
  assert.equal(resolved, false);
  assert.equal(passed, true);
  assert.deepEqual(response.locals, {});
});
test("restored paywalls still require authentication and reject non-paying members", async () => {
  for (const [membership, expected] of [
    [null, 401],
    [{ role: "free", subscriptionStatus: null, currentPeriodEnd: null, deletionStartedAt: null }, 403],
  ] as const) {
    let status = 200, passed = false;
    const response = { locals: {}, status(code: number) { status = code; return this; }, json() {} };
    await createRequirePremium(async () => membership, req => apiRequiresPremium(req.originalUrl, enabled))(
      { originalUrl: "/api/stock/WIT/models", log: { error() {} } } as never, response as never, () => { passed = true; });
    assert.equal(status, expected);
    assert.equal(passed, false);
  }
});
