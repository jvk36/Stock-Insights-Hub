import assert from "node:assert/strict";
import { hasStoredPremiumAccess } from "./membership-entitlement.ts";

const activePaid = {
  role: "paid",
  subscriptionStatus: "active",
  currentPeriodEnd: new Date("2999-10-10T00:00:00Z"),
  deletionStartedAt: null,
};

assert.equal(hasStoredPremiumAccess(activePaid), true);
assert.equal(hasStoredPremiumAccess({ ...activePaid, subscriptionStatus: "trialing" }), true);
assert.equal(hasStoredPremiumAccess({ ...activePaid, currentPeriodEnd: new Date("2000-01-01T00:00:00Z") }), false);
assert.equal(hasStoredPremiumAccess({ ...activePaid, role: "free" }), false);
assert.equal(hasStoredPremiumAccess({ ...activePaid, subscriptionStatus: "canceled" }), false);
assert.equal(hasStoredPremiumAccess({ ...activePaid, deletionStartedAt: new Date("2026-09-12T00:00:00Z") }), false);
assert.equal(hasStoredPremiumAccess({
  role: "admin",
  subscriptionStatus: null,
  currentPeriodEnd: null,
  deletionStartedAt: null,
}), true);

console.log("Membership entitlement checks passed");