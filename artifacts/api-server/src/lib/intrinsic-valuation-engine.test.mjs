import assert from "node:assert/strict";
import test from "node:test";
import {
  intrinsicTargetPe, intrinsicValuationHistory, intrinsicValuationWindow, secQuarterlyEps, reconciledListingEps,
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
  assert.equal(intrinsicTargetPe(-5), 15);
  assert.equal(intrinsicTargetPe(null), null);
  assert.equal(intrinsicTargetPe(NaN), null);
});

test("historical EPS is a four-quarter sum, not quarterly or partially annualized EPS", () => {
  const rows = intrinsicValuationHistory(flat, null, "2025-01-15");
  assert.equal(rows[0].reportedTtmEps, null);
  assert.equal(rows[2].reportedTtmEps, null);
  assert.equal(rows[3].reportedTtmEps, 4);
  assert.equal(rows[3].fairValue, 34);
  assert.equal(rows[14].fairValue, 34);
  assert.equal(rows[15].growthPercent, 0);
  assert.equal(rows[15].fairValue, 34);
});

test("one CAGR between the first and last plotted EPS applies to every quarter", () => {
  const growing = dates.map((date, i) => ({ date, eps: 1.1 ** (i / 4) }));
  const rows = intrinsicValuationHistory(growing, null, "2025-01-15");
  const first = rows[3];
  const last = rows[19];
  const years = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 86400000);
  const expected = ((last.blendedEps / first.blendedEps) ** (1 / years) - 1) * 100;
  closeTo(rows[3].growthPercent, expected);
  closeTo(rows[15].growthPercent, expected);
  closeTo(rows[19].growthPercent, expected);
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
  const years = (Date.parse(last.date) - Date.parse(rows[3].date)) / (365.25 * 86400000);
  const growth = ((4.5 / 4) ** (1 / years) - 1) * 100;
  closeTo(last.growthPercent, growth);
  closeTo(last.fairValue, 4.5 * intrinsicTargetPe(growth));
  closeTo(rows.at(-2).fairValue, 4 * intrinsicTargetPe(growth));
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

test("undefined signed-endpoint CAGR does not invent growth, but negative earnings are valued at 15x", () => {
  const lossStart = flat.map((q, i) => ({ ...q, eps: i < 4 ? -1 : 1 }));
  const initial = intrinsicValuationHistory(lossStart, null, "2025-01-15")[15];
  assert.equal(initial.fairValue, null);
  assert.match(initial.unavailableReason, /starting EPS/);
  const allLoss = intrinsicValuationHistory(flat.map(q => ({ ...q, eps: -1 })), null, "2025-01-15");
  assert.equal(allLoss[15].growthPercent, null);
  assert.equal(allLoss[15].targetPe, 15);
  assert.equal(allLoss[15].fairValue, -60);
  assert.equal(allLoss[15].unavailableReason, null);
  const latest = intrinsicValuationHistory(flat, { date: "2025-03-31", eps: -20 }, "2025-02-01").at(-1);
  assert.equal(latest.blendedEps, -6.5);
  assert.equal(latest.fairValue, -97.5);
  assert.equal(latest.targetPe, 15);
  assert.equal(latest.unavailableReason, null);
});

test("negative endpoint growth uses 15x throughout, including the latest blended EPS", () => {
  const shrinking = dates.map((date, i) => ({ date, eps: 0.8 ** (i / 4) }));
  const rows = intrinsicValuationHistory(shrinking, { date: "2025-03-31", eps: 0.2 }, "2025-02-01");
  for (const p of rows.filter(p => p.blendedEps != null)) {
    assert.ok(p.growthPercent < 0);
    assert.equal(p.targetPe, 15);
    closeTo(p.fairValue, p.blendedEps * 15);
  }
});

test("changing chart windows recalculates CAGR and valuations without mutating cached history", () => {
  const quarters = flat.map((q, i) => ({ ...q, eps: i < 12 ? 1 : (i - 7) / 4 }));
  const all = intrinsicValuationHistory(quarters, { date: "2025-03-31", eps: 4 }, "2025-02-01");
  const snapshot = JSON.stringify(all);
  const range = intrinsicValuationWindow(all, "2024-01-01");
  assert.equal(range[0].date, "2024-03-31");
  assert.notEqual(range[0].growthPercent, all[3].growthPercent);
  const first = range[0], last = range.at(-1);
  const years = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 86400000);
  closeTo(last.growthPercent, ((last.blendedEps / first.blendedEps) ** (1 / years) - 1) * 100);
  closeTo(last.fairValue, last.blendedEps * intrinsicTargetPe(last.growthPercent));
  assert.equal(JSON.stringify(all), snapshot);
  assert.deepEqual(intrinsicValuationWindow(all, "2030-01-01"), []);
});

test("a single EPS endpoint cannot establish CAGR; zero ending EPS supports -100% growth", () => {
  const rows = intrinsicValuationHistory(flat, null, "2025-01-15");
  const single = intrinsicValuationWindow(rows, "2024-12-31");
  assert.equal(single[0].fairValue, null);
  assert.equal(single[0].growthPercent, null);
  const zeroEnd = rows.map(p => p.date === "2024-12-31" ? { ...p, blendedEps: 0 } : p);
  const valued = intrinsicValuationWindow(zeroEnd);
  assert.equal(valued[3].growthPercent, -100);
  assert.equal(valued.at(-2).fairValue, 0);
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
