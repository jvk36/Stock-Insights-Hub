import assert from "node:assert/strict";
import test from "node:test";
import {
  intrinsicTargetPe, intrinsicValuationHistory, secQuarterlyEps, reconciledListingEps,
} from "./intrinsic-valuation-engine.ts";

const dates = Array.from({ length: 20 }, (_, i) => {
  const date = new Date(Date.UTC(2020 + Math.floor(i / 4), (i % 4 + 1) * 3, 0));
  return date.toISOString().slice(0, 10);
});
const flat = dates.map(date => ({ date, eps: 1 }));
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("exact piecewise rules use percentage points and do not globally cap high growth", () => {
  assert.equal(intrinsicTargetPe(0), 8.5);
  assert.equal(intrinsicTargetPe(2), 12.5);
  assert.equal(intrinsicTargetPe(4.99), 15);
  assert.equal(intrinsicTargetPe(5), 15);
  assert.equal(intrinsicTargetPe(15), 15);
  assert.equal(intrinsicTargetPe(20), 20);
  assert.equal(intrinsicTargetPe(-5), null);
  assert.equal(intrinsicTargetPe(null), null);
  assert.equal(intrinsicTargetPe(NaN), null);
});

test("historical EPS is a four-quarter sum, not quarterly or partially annualized EPS", () => {
  const rows = intrinsicValuationHistory(flat, null, "2025-01-15");
  assert.equal(rows[0].reportedTtmEps, null);
  assert.equal(rows[2].reportedTtmEps, null);
  assert.equal(rows[3].reportedTtmEps, 4);
  assert.equal(rows[14].fairValue, null);
  assert.equal(rows[15].growthPercent, 0);
  assert.equal(rows[15].fairValue, 34);
});

test("three-year CAGR is recomputed at each quarter from comparable TTM EPS", () => {
  const growing = dates.map((date, i) => ({ date, eps: 1.1 ** (i / 4) }));
  const rows = intrinsicValuationHistory(growing, null, "2025-01-15");
  closeTo(rows[15].growthPercent, 10);
  closeTo(rows[19].growthPercent, 10);
  assert.equal(rows[19].targetPe, 15);
});

test("latest point blends reported TTM with TTM replacing the oldest quarter by consensus", () => {
  const rows = intrinsicValuationHistory(flat, { date: "2025-03-31", eps: 2 }, "2025-02-01");
  const last = rows.at(-1);
  assert.equal(last.isBlended, true);
  assert.equal(last.date, "2025-02-01");
  assert.equal(last.periodEnd, "2024-12-31");
  assert.equal(last.reportedTtmEps, 4);
  assert.equal(last.projectedTtmEps, 5);
  assert.equal(last.blendedEps, 4.5);
  assert.equal(last.growthPercent, 0);
  assert.equal(last.fairValue, 4.5 * 8.5);
  assert.equal(rows.at(-2).fairValue, 34);
});

test("missing next-quarter consensus or stale quarters never fabricate a latest value", () => {
  for (const estimate of [null, { date: "2025-06-30", eps: 2 }]) {
    const last = intrinsicValuationHistory(flat, estimate, "2025-02-01").at(-1);
    assert.equal(last.fairValue, null);
    assert.match(last.unavailableReason, /consensus/i);
  }
  const last = intrinsicValuationHistory(flat, { date: "2025-03-31", eps: 2 }, "2025-09-01").at(-1);
  assert.equal(last.fairValue, null);
  assert.match(last.unavailableReason, /stale/);
});

test("missing quarters are not silently included in rolling TTM windows", () => {
  const rows = intrinsicValuationHistory(flat.filter(q => q.date !== "2024-06-30"), null, "2025-01-15");
  assert.equal(rows.find(q => q.date === "2024-12-31").reportedTtmEps, null);
  assert.equal(rows.find(q => q.date === "2023-12-31").fairValue, 34);
});

test("negative/zero starting EPS, nonpositive current/blended EPS and negative multiples leave gaps", () => {
  const lossStart = flat.map((q, i) => ({ ...q, eps: i < 4 ? -1 : 1 }));
  const initial = intrinsicValuationHistory(lossStart, null, "2025-01-15")[15];
  assert.equal(initial.fairValue, null);
  assert.match(initial.unavailableReason, /starting EPS/);
  const allLoss = intrinsicValuationHistory(flat.map(q => ({ ...q, eps: -1 })), null, "2025-01-15");
  assert.equal(allLoss[15].fairValue, null);
  const latest = intrinsicValuationHistory(flat, { date: "2025-03-31", eps: -20 }, "2025-02-01").at(-1);
  assert.equal(latest.fairValue, null);
  assert.match(latest.unavailableReason, /nonpositive/);
});

test("SEC facts normalize individual quarters using filing date and prefer restatements", () => {
  const facts = [
    { start: "2020-01-01", end: "2020-03-31", filed: "2020-04-30", val: 4, form: "10-Q" },
    { start: "2020-04-01", end: "2020-06-30", filed: "2020-07-31", val: 8, form: "10-Q" },
    // Comparative already restated after 4-for-1 split.
    { start: "2020-01-01", end: "2020-03-31", filed: "2021-04-30", val: 1.1, form: "10-Q" },
  ];
  const rows = secQuarterlyEps(facts, [{ date: new Date("2020-08-31"), numerator: 4, denominator: 1 }]);
  assert.deepEqual(rows, [{ date: "2020-03-31", eps: 1.1 }, { date: "2020-06-30", eps: 2 }]);
});

test("Q4 can be derived from same-year annual and nine-month EPS with latest restatements", () => {
  const rows = secQuarterlyEps([
    { start: "2023-01-01", end: "2023-09-30", filed: "2023-11-01", val: 3, form: "10-Q" },
    { start: "2023-01-01", end: "2023-12-31", filed: "2024-02-01", val: 4, form: "10-K" },
    { start: "2023-01-01", end: "2023-12-31", filed: "2025-02-01", val: 5, form: "10-K" },
  ], []);
  assert.deepEqual(rows, [{ date: "2023-12-31", eps: 2 }]);
});

test("reporting currency and ADR units are reconciled against multiple listing EPS observations", () => {
  const statement = [{ date: "2024-03-31", eps: 10 }, { date: "2024-06-30", eps: 12 }];
  assert.deepEqual(reconciledListingEps(statement, [
    { date: "2024-03-31", eps: 0.1 }, { date: "2024-06-30", eps: 0.12 },
  ], 0.01), [{ date: "2024-03-31", eps: 0.1 }, { date: "2024-06-30", eps: 0.12 }]);
  const adr = reconciledListingEps(statement, [
    { date: "2024-03-31", eps: 0.5 }, { date: "2024-06-30", eps: 0.6 },
  ], 0.01);
  closeTo(adr[0].eps, 0.5);
  closeTo(adr[1].eps, 0.6);
  assert.equal(reconciledListingEps(statement, [{ date: "2024-03-31", eps: 0.5 }], 0.01), null);
  assert.equal(reconciledListingEps(statement, [
    { date: "2024-03-31", eps: 0.5 }, { date: "2024-06-30", eps: 0.12 },
  ], 0.01), null);
});
