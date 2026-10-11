import assert from "node:assert/strict";
import { subscriptionUpdate, createSubscriptionVerifier } from "./subscription-verification.ts";
import { hasStoredPremiumAccess } from "./membership-entitlement.ts";
import { createRequirePremium } from "./premium-middleware.ts";

const now = Date.parse("2026-10-11T12:00:00Z");
const identity = { stripeSubscriptionId: "sub_test", stripeCustomerId: "cus_test" };
const end = Date.parse("2026-11-10T19:51:57Z") / 1000;
const renewed = {
  id: "sub_test", customer: "cus_test", status: "active",
  items: { data: [{ current_period_end: end, price: { recurring: { interval: "month" } } }] },
};
const expired = {
  role: "paid", subscriptionStatus: "active",
  currentPeriodEnd: new Date("2026-10-10T19:51:57Z"), deletionStartedAt: null,
};
const patch = subscriptionUpdate(renewed, identity, now);
assert.equal(patch.plan, "monthly");
assert.equal(patch.currentPeriodEnd.toISOString(), "2026-11-10T19:51:57.000Z");
assert.equal(hasStoredPremiumAccess(expired), false);
// Fixed dates above describe the incident; use a future period for real-clock entitlement checks.
const futureRenewal = { ...renewed, items: { data: [{ current_period_end: 32503680000 }] } };
const verified = subscriptionUpdate(futureRenewal, identity, now);
assert.equal(hasStoredPremiumAccess({ ...expired, ...verified }), true);
assert.equal(subscriptionUpdate({ ...renewed, current_period_end: end }, identity, now).role, "paid");
assert.equal(subscriptionUpdate({ ...renewed, customer: { id: "cus_test" } }, identity, now).role, "paid");
assert.throws(() => subscriptionUpdate({ ...renewed, customer: "cus_other" }, identity, now));
assert.throws(() => subscriptionUpdate({ ...renewed, id: "sub_other" }, identity, now));
assert.throws(() => subscriptionUpdate({ ...renewed, items: { data: [] } }, identity, now));
assert.throws(() => subscriptionUpdate({ ...renewed, status: "unknown" }, identity, now));
for (const status of ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]) {
  assert.equal(subscriptionUpdate({ ...renewed, status }, identity, now).role, "free");
}
assert.equal(subscriptionUpdate({ ...renewed, status: "trialing" }, identity, now).role, "paid");
assert.equal(subscriptionUpdate({ ...renewed, current_period_end: now / 1000 }, identity, now).role, "free");
assert.equal(subscriptionUpdate({ ...renewed, items: { data: [
  { current_period_end: end }, { current_period_end: end - 100 },
] } }, identity, now).currentPeriodEnd.getTime(), (end - 100) * 1000);
assert.equal(subscriptionUpdate({ ...renewed, items: { data: [
  { current_period_end: end, price: { recurring: { interval: "year" } } },
] } }, identity, now).plan, "annual");

let calls = 0;
let clock = now;
const verify = createSubscriptionVerifier(async () => { calls++; return futureRenewal; }, () => clock);
const results = await Promise.all(Array.from({ length: 10 }, () => verify(identity)));
assert.equal(calls, 1);
assert.equal(results[0].billingUnavailable, false);
await verify(identity);
assert.equal(calls, 1);
clock += 60_001;
await verify(identity);
assert.equal(calls, 2);
let failures = 0;
const outage = createSubscriptionVerifier(async () => { failures++; throw new Error("resource_missing"); }, () => clock);
const unavailable = await outage(identity);
assert.deepEqual(unavailable, { update: null, billingUnavailable: true });
await outage(identity);
assert.equal(failures, 1);
assert.equal(hasStoredPremiumAccess(expired), false);
clock += 15_001;
await outage(identity);
assert.equal(failures, 2);

async function access(membership) {
  let status = 200, nextCalled = false;
  const response = { locals: {}, status(code) { status = code; return this; }, json() { return this; } };
  await createRequirePremium(async () => membership)({ log: { error() {} } }, response, () => { nextCalled = true; });
  return { status, nextCalled };
}
assert.deepEqual(await access(expired), { status: 403, nextCalled: false });
assert.deepEqual(await access({ ...expired, ...verified }), { status: 200, nextCalled: true });
assert.deepEqual(await access({ ...expired, ...verified, deletionStartedAt: new Date() }), { status: 403, nextCalled: false });
assert.deepEqual(await access({ ...expired, ...verified, subscriptionStatus: "canceled" }), { status: 403, nextCalled: false });
console.log("Subscription renewal, ownership, outages, caching and Premium middleware checks passed");
