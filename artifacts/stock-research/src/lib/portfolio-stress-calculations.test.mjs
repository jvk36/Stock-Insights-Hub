import assert from "node:assert/strict";
import { test } from "node:test";
import { CRISIS_WINDOWS, portfolioRecovery, simulateCrises } from "./portfolio-stress-calculations.ts";
import { simulatePortfolio } from "./portfolio-tools-calculations.ts";
import { addDays } from "./performance-calculations.ts";

const holdings = [{ symbol: "AAA", weight: 50 }, { symbol: "BBB", weight: 50 }];
const options = { initialValue: 10000, annualRiskFree: 0, rebalance: "none" };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function history(symbol, start, end, value = () => 100, currency = "USD") {
  const prices = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) prices.push({ date, adjustedClose: value(date, prices.length) });
  }
  return { symbol, currency, prices };
}
const point = (date, adjustedClose) => ({ date, adjustedClose });

test("crisis windows explicitly distinguish calendar years from the COVID crash", () => {
  assert.equal(CRISIS_WINDOWS.length, 4);
  assert.deepEqual(CRISIS_WINDOWS.map((w) => [w.start, w.end]), [
    ["1999-12-31", "2002-12-31"], ["2007-12-31", "2008-12-31"],
    ["2020-02-19", "2020-03-23"], ["2021-12-31", "2022-12-31"],
  ]);
});

test("each crisis resets the initial allocation and honors all rebalance options", () => {
  const hs = [
    history("AAA", "1999-12-31", "2022-12-31", (_, i) => 100 + i * 0.1),
    history("BBB", "1999-12-31", "2022-12-31", (_, i) => 300 + i * 0.02),
  ];
  for (const rebalance of ["none", "monthly", "quarterly", "annual"]) {
    const scenarios = simulateCrises(holdings, hs, { ...options, rebalance });
    for (const { window, outcome, totalReturn } of scenarios) {
      assert.equal(outcome.ok, true, outcome.reason);
      close(outcome.prices[0].adjustedClose, 10000);
      const independent = simulatePortfolio(holdings, hs, { ...options, rebalance, start: window.start, end: window.end });
      assert.deepEqual(outcome, independent);
      close(totalReturn, independent.prices.at(-1).adjustedClose / 10000 - 1);
      // Only sessions INSIDE the labeled crisis contribute.
      assert.ok(outcome.start >= window.start && outcome.end <= window.end);
    }
  }
});

test("recent listings leave early crises unavailable rather than clipping or substituting", () => {
  const hs = [history("AAA", "2010-01-01", "2022-12-31"), history("BBB", "2010-01-01", "2022-12-31")];
  const rows = simulateCrises(holdings, hs, options);
  assert.deepEqual(rows.map((r) => r.outcome.ok), [false, false, true, true]);
  assert.equal(rows[0].totalReturn, null);
  assert.match(rows[0].outcome.reason, /AAA.*predates/);
});

test("COVID return and peak-to-trough loss use the actual combined path", () => {
  const hs = [
    history("AAA", "2020-02-19", "2020-03-23", (d) => d === "2020-02-19" ? 100 : 50),
    history("BBB", "2020-02-19", "2020-03-23"),
  ];
  const covid = simulateCrises(holdings, hs, options).find((r) => r.window.id === "covid");
  assert.equal(covid.outcome.ok, true);
  close(covid.totalReturn, -0.25);
  close(covid.outcome.stats.maxDrawdown, 0.25);
  close(covid.outcome.prices.at(-1).adjustedClose, 7500);
});

test("a listing or feed missing even the first or last crisis sessions is not passed as complete", () => {
  for (const [start, end] of [["2020-02-21", "2020-03-23"], ["2020-02-19", "2020-03-20"]]) {
    const hs = [history("AAA", "2020-02-19", "2020-03-23"), history("BBB", start, end)];
    const covid = simulateCrises(holdings, hs, options)[2];
    assert.equal(covid.outcome.ok, false);
    assert.equal(covid.totalReturn, null);
    assert.match(covid.outcome.reason, /Incomplete crisis coverage/);
  }
});

test("crises preserve weight, USD, zero-weight and continuous-history safeguards", () => {
  const hs = [history("AAA", "2020-02-19", "2020-03-23"), history("BBB", "2020-02-19", "2020-03-23")];
  assert.ok(simulateCrises([{ ...holdings[0], weight: 20 }, holdings[1]], hs, options).every((r) => !r.outcome.ok));
  const foreign = [hs[0], { ...hs[1], currency: "INR" }];
  assert.match(simulateCrises(holdings, foreign, options)[2].outcome.reason, /USD/);
  const zero = [...holdings, { symbol: "UNLISTED", weight: 0 }];
  assert.equal(simulateCrises(zero, hs, options)[2].outcome.ok, true);
  const gapped = hs.map((h) => ({ ...h, prices: h.prices.filter((p) => p.date < "2020-03-01" || p.date > "2020-03-15") }));
  assert.match(simulateCrises(holdings, gapped, options)[2].outcome.reason, /gap/);
});

const recoveryPrices = [
  point("2020-01-02", 100), point("2020-01-03", 80), point("2020-01-06", 60),
  point("2020-01-07", 100), point("2020-01-08", 90), point("2020-01-09", 105),
  point("2020-01-10", 70),
];
test("recovery separates decline, trough-to-recovery and total underwater calendar days", () => {
  const r = portfolioRecovery(recoveryPrices);
  assert.equal(r.episodes.length, 3);
  const deepest = r.episodes[0];
  assert.equal(deepest.peak, "2020-01-02");
  assert.equal(deepest.trough, "2020-01-06");
  assert.equal(deepest.recovery, "2020-01-07"); // equality counts
  assert.equal(deepest.declineDays, 4);
  assert.equal(deepest.recoveryDays, 1);
  assert.equal(deepest.underwaterDays, 5);
  close(deepest.loss, -0.4);
});

test("ongoing and range-truncated drawdowns never invent future recovery", () => {
  const r = portfolioRecovery(recoveryPrices);
  const ongoing = r.episodes.find((e) => e.peak === "2020-01-09");
  assert.equal(ongoing.recovery, null);
  assert.equal(ongoing.recoveryDays, null);
  assert.equal(ongoing.underwaterDays, 1);
  assert.equal(r.asOf, "2020-01-10");
  const clipped = portfolioRecovery(recoveryPrices.slice(0, 3));
  assert.equal(clipped.episodes[0].recovery, null);
  assert.equal(clipped.episodes[0].underwaterDays, 4);
});

test("major drawdowns include threshold equality, omit smaller episodes and keep the full chart", () => {
  const ten = portfolioRecovery(recoveryPrices, 0.1);
  const twenty = portfolioRecovery(recoveryPrices, 0.2);
  assert.equal(ten.episodes.length, 3);
  assert.equal(twenty.episodes.length, 2);
  assert.equal(twenty.analysis.points.length, recoveryPrices.length);
  assert.equal(ten.episodes.find((e) => e.peak === "2020-01-07").recoveryDays, 1);
});

test("no drawdown and empty histories are explicit; invalid thresholds rejected", () => {
  assert.deepEqual(portfolioRecovery([]).episodes, []);
  assert.equal(portfolioRecovery([]).asOf, null);
  assert.deepEqual(portfolioRecovery([point("2020-01-02", 100), point("2020-01-03", 110)]).episodes, []);
  for (const n of [NaN, 0, -0.1, 1.1]) assert.throws(() => portfolioRecovery(recoveryPrices, n), /threshold/);
});
