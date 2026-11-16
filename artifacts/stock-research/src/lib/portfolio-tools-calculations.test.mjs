import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizePortfolioSymbol, validateHoldings, simulatePortfolio, portfolioCorrelationMatrix,
} from "./portfolio-tools-calculations.ts";
import { riskRatios } from "./risk-calculations.ts";

const close = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const holdings = [{ symbol: "AAA", weight: 50 }, { symbol: "BBB", weight: 50 }];
const dates = ["2020-01-31", "2020-02-03", "2020-02-04"];
function history(symbol, values, ds = dates, currency = "USD") {
  return { symbol, currency, prices: ds.map((date, i) => ({ date, adjustedClose: values[i] })) };
}
const histories = [history("AAA", [100, 200, 200]), history("BBB", [100, 100, 200])];
const options = { start: dates[0], end: dates.at(-1), rebalance: "none", initialValue: 10000, annualRiskFree: 0 };
const mustWork = (result) => { assert.equal(result.ok, true, result.reason); return result; };
const mustFail = (result, match) => { assert.equal(result.ok, false); assert.match(result.reason, match); };

test("validates weighted holdings without requiring weights for correlation", () => {
  assert.deepEqual(validateHoldings(holdings), []);
  assert.ok(validateHoldings([{ symbol: "AAA", weight: NaN }, { symbol: "BBB", weight: NaN }]).length);
  assert.deepEqual(validateHoldings([{ symbol: "AAA", weight: NaN }, { symbol: "BBB", weight: NaN }], false), []);
  assert.ok(validateHoldings([{ symbol: "AAA", weight: 30 }, { symbol: "BBB", weight: 40 }]).some((e) => /100/.test(e)));
  assert.ok(validateHoldings([{ symbol: "AAA", weight: -20 }, { symbol: "BBB", weight: 120 }]).length);
  assert.ok(validateHoldings([{ symbol: "brk.a", weight: 50 }, { symbol: "BRK-A", weight: 50 }]).some((e) => /Duplicate/.test(e)));
  assert.ok(validateHoldings([{ symbol: " ", weight: 50 }, { symbol: "BBB", weight: 50 }]).length);
  assert.ok(validateHoldings([holdings[0]]).length);
  assert.ok(validateHoldings(Array.from({ length: 21 }, (_, i) => ({ symbol: `A${i}`, weight: 100 / 21 }))).length);
  assert.equal(normalizePortfolioSymbol(" brk.b "), "BRK-B");
  assert.equal(normalizePortfolioSymbol(" 7203.t "), "7203.T");
});

test("buy-and-hold is based on units and allows weights to drift", () => {
  const r = mustWork(simulatePortfolio(holdings, histories, options));
  assert.deepEqual(r.prices.map((p) => p.adjustedClose), [10000, 15000, 20000]);
  close(r.allocations[0].value, 10000);
  close(r.allocations[1].value, 10000);
  assert.deepEqual(r.rebalances, []);
  const asymmetric = mustWork(simulatePortfolio(holdings, [histories[0], history("BBB", [100, 100, 100])], options));
  close(asymmetric.allocations[0].endingWeight, 100 * 2 / 3);
  close(asymmetric.allocations[1].endingWeight, 100 / 3);
  assert.deepEqual(r.stats, riskRatios(r.prices, 0));
});

test("monthly rebalancing marks old positions first and resets weights at that close", () => {
  const r = mustWork(simulatePortfolio(holdings, histories, { ...options, rebalance: "monthly" }));
  assert.deepEqual(r.prices.map((p) => p.adjustedClose), [10000, 15000, 22500]);
  assert.deepEqual(r.rebalances, ["2020-02-03"]);
  close(r.allocations[0].value, 7500);
  close(r.allocations[1].value, 15000);
  const quarterly = mustWork(simulatePortfolio(holdings, histories, { ...options, rebalance: "quarterly" }));
  assert.deepEqual(quarterly.rebalances, []);
  close(quarterly.prices.at(-1).adjustedClose, 20000);
});

test("quarterly and annual rebalancing use calendar boundaries, not future prices", () => {
  for (const [ds, rule] of [
    [["2020-03-31", "2020-04-01", "2020-04-02"], "quarterly"],
    [["2020-12-31", "2021-01-04", "2021-01-05"], "annual"],
  ]) {
    const hs = [history("AAA", [100, 200, 200], ds), history("BBB", [100, 100, 200], ds)];
    const r = mustWork(simulatePortfolio(holdings, hs, { ...options, start: ds[0], end: ds.at(-1), rebalance: rule }));
    close(r.prices.at(-1).adjustedClose, 22500);
    assert.deepEqual(r.rebalances, [ds[1]]);
    const before = mustWork(simulatePortfolio(holdings, histories, { ...options, rebalance: "none" }));
    close(before.prices[1].adjustedClose, r.prices[1].adjustedClose);
  }
});

test("weighted portfolios reject missing holdings, mixed currencies and impossible inputs", () => {
  mustFail(simulatePortfolio(holdings, histories.slice(0, 1), options), /unavailable for BBB/);
  mustFail(simulatePortfolio(holdings, [histories[0], { ...histories[1], currency: "INR" }], options), /USD/);
  mustFail(simulatePortfolio(holdings, [histories[0], { ...histories[1], currency: null }], options), /USD/);
  mustFail(simulatePortfolio(holdings, histories, { ...options, initialValue: 0 }), /positive/);
  mustFail(simulatePortfolio(holdings, histories, { ...options, initialValue: Infinity }), /positive/);
  mustFail(simulatePortfolio(holdings, histories, { ...options, annualRiskFree: NaN }), /risk-free/);
  mustFail(simulatePortfolio(holdings, histories, { ...options, annualRiskFree: -1 }), /risk-free/);
  mustFail(simulatePortfolio(holdings, histories, { ...options, rebalance: "weekly" }), /rebalancing/);
  mustFail(simulatePortfolio(holdings, histories, { ...options, start: "2020-02-30" }), /valid date/);
  mustFail(simulatePortfolio(holdings, histories, { ...options, start: "2010-01-01" }), /predates/);
  mustFail(simulatePortfolio(holdings, histories, { ...options, end: "2020-01-01" }), /before/);
  const invalid = [{ ...histories[0], prices: [...histories[0].prices].reverse() }, histories[1]];
  mustFail(simulatePortfolio(holdings, invalid, options), /unsorted/);
  const zero = [history("AAA", [100, 0, 200]), histories[1]];
  mustFail(simulatePortfolio(holdings, zero, options), /Invalid/);
});

test("uses common dates only, explicitly counts omissions and rejects long gaps", () => {
  const ds = ["2020-01-02", "2020-01-03", "2020-01-06", "2020-01-07"];
  const a = history("AAA", [100, 101, 102, 103], ds);
  const b = history("BBB", [100, 101, 102, 103], ds);
  b.prices.splice(1, 1);
  const r = mustWork(simulatePortfolio(holdings, [a, b], { ...options, start: ds[0], end: ds.at(-1) }));
  assert.deepEqual(r.prices.map((p) => p.date), [ds[0], ds[2], ds[3]]);
  assert.equal(r.omittedSessions, 1);
  const gapDates = ["2020-01-02", "2020-01-20", "2020-01-21"];
  mustFail(simulatePortfolio(holdings, [history("AAA", [100, 101, 102], gapDates), history("BBB", [100, 101, 102], gapDates)], { ...options, start: gapDates[0], end: gapDates.at(-1) }), /gap longer/);
  mustFail(simulatePortfolio(holdings, histories, { ...options, start: dates[1] }), /three/);
});

test("zero-weight holdings do not block simulation or contribute phantom capital", () => {
  const r = mustWork(simulatePortfolio([{ symbol: "AAA", weight: 100 }, { symbol: "MISSING", weight: 0 }], histories.slice(0, 1), options));
  assert.deepEqual(r.allocations.map((a) => a.symbol), ["AAA"]);
  close(r.prices.at(-1).adjustedClose, 20000);
});

test("correlation ignores weights, is symmetric and retains negative relationships", () => {
  const ds = ["2020-01-02", "2020-01-03", "2020-01-06", "2020-01-07"];
  const hs = [history("AAA", [100, 110, 99, 108.9], ds), history("BBB", [100, 90, 99, 89.1], ds, "GBP")];
  const blank = holdings.map((h) => ({ ...h, weight: NaN }));
  const cells = portfolioCorrelationMatrix(blank, hs, ds[0], ds.at(-1));
  assert.equal(cells.length, 4);
  close(cells[0].correlation, 1);
  close(cells[1].correlation, -1);
  close(cells[2].correlation, -1);
  assert.equal(cells[1].observations, 3);
  assert.equal(cells[1].start, ds[1]);
  assert.equal(cells[1].end, ds[3]);
});

test("matrix never substitutes zero or one for undefined correlations", () => {
  const flat = [history("AAA", [100, 100, 100]), history("BBB", [100, 100, 100])];
  const cells = portfolioCorrelationMatrix(holdings, flat, options.start, options.end);
  assert.ok(cells.every((c) => c.correlation === null && /variance/.test(c.reason)));
  const missing = portfolioCorrelationMatrix(holdings, histories.slice(0, 1), options.start, options.end);
  assert.equal(missing[1].correlation, null);
  assert.match(missing[1].reason, /unavailable/);
  const short = portfolioCorrelationMatrix(holdings, histories, "2010-01-01", options.end);
  assert.ok(short.every((c) => c.correlation === null && /predates/.test(c.reason)));
});
