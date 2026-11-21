import assert from "node:assert/strict";
import test from "node:test";
import { earningsFairValues } from "./earnings-fair-value";

const history = [
  { date: "2024-03-31", ttmEps: 2 },
  { date: "2024-06-30", ttmEps: 4 },
  { date: "2024-09-30", ttmEps: 3 },
];

test("smooth quarterly interpolation preserves knots and differs from straight segments", () => {
  const dates = ["2024-03-31", "2024-04-23", "2024-06-30", "2024-09-30"];
  const values = earningsFairValues(dates, history, 15);
  assert.equal(values[0], 30);
  assert.equal(values[2], 60);
  assert.equal(values[3], 45);
  assert.ok(values[1]! > 30 && values[1]! < 60);
  const linear = 30 + 30 * 23 / 91;
  assert.ok(Math.abs(values[1]! - linear) > 1);
  assert.equal(earningsFairValues(dates, history, 30)[1], values[1]! * 2);
});

test("hide entire curve for missing beginning, missing end, quarter gaps or invalid EPS", () => {
  for (const dates of [
    ["2024-01-01", "2024-09-30"],
    ["2024-03-31", "2024-11-01"],
  ]) assert.deepEqual(earningsFairValues(dates, history, 15), [null, null]);
  const dates = ["2024-03-31", "2024-09-30"];
  for (const rows of [
    history.filter(p => p.date !== "2024-06-30"),
    history.map((p, i) => i === 1 ? { ...p, ttmEps: null } : p),
    history.map((p, i) => i === 1 ? { ...p, ttmEps: NaN } : p),
  ]) assert.deepEqual(earningsFairValues(dates, rows, 15), [null, null]);
});

test("unused missing history outside a fully covered range does not suppress it", () => {
  const values = earningsFairValues(["2024-06-01", "2024-06-15"], [
    { date: "2023-12-31", ttmEps: null }, ...history,
  ], 15);
  assert.ok(values.every(v => v != null && v > 30 && v < 60));
});
