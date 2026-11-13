import assert from "node:assert/strict";
import test from "node:test";
import { canShowAds, isAdContentPage } from "./adsense-eligibility";
import type { Membership } from "./membership-types";

const free: Membership = { authenticated: true, premium: false, role: "free" };

test("ads are permitted for signed-out visitors and confirmed Free members", () => {
  assert.equal(canShowAds("signed-out", false), true);
  assert.equal(canShowAds("signed-in", false, free), true);
});

test("ads stay disabled while authentication or membership is unresolved", () => {
  assert.equal(canShowAds("unknown", false, free), false);
  assert.equal(canShowAds("signed-in", true, free), false);
  assert.equal(canShowAds("signed-in", false), false);
  assert.equal(canShowAds("signed-in", false, { ...free, authenticated: false }), false);
});

test("Premium, admin and uncertain billing states remain ad-free", () => {
  assert.equal(canShowAds("signed-in", false, { ...free, premium: true, role: "paid" }), false);
  assert.equal(canShowAds("signed-in", false, { ...free, role: "admin" }), false);
  assert.equal(canShowAds("signed-in", false, { ...free, role: "paid" }), false);
  assert.equal(canShowAds("signed-in", false, { ...free, billingUnavailable: true }), false);
});

test("only research content routes are ad-eligible", () => {
  for (const path of ["/13f", "/13f/berkshire", "/macro", "/stock", "/stock/WIT", "/indexes", "/watchlist", "/model-portfolios/cloning"]) {
    assert.equal(isAdContentPage(path), true, path);
  }
  for (const path of ["/", "/sign-in", "/sign-up", "/account", "/admin/members", "/pricing", "/missing"]) {
    assert.equal(isAdContentPage(path), false, path);
  }
});
