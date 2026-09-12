import assert from "node:assert/strict";
import { calculateNav } from "./nav-calculations.ts";

const result = calculateNav({
  propertyValue: 60,
  otherAssets: 15,
  totalLiabilities: 30,
  sharesOutstanding: 1,
  currentPrice: 36,
});
assert.ok(result);
assert.equal(result.grossAssetValue, 75);
assert.equal(result.netAssetValue, 45);
assert.equal(result.navPerShare, 45);
assert.equal(result.priceDifference, -9);
assert.equal(result.premiumDiscountPct, -20);

assert.equal(
  calculateNav({
    propertyValue: 1,
    otherAssets: 1,
    totalLiabilities: 1,
    sharesOutstanding: 0,
    currentPrice: 1,
  }),
  null,
);

console.log("NAV calculation checks passed");