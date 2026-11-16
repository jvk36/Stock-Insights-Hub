import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dailyReturns, sampleDeviation, annualizedVolatility, analyzeDrawdowns, riskRatios,
  pairedReturns, betaCorrelation, rollingVolatility,
} from "./risk-calculations.ts";
import { annualizedReturn } from "./performance-calculations.ts";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function prices(values, start = "2020-01-01") {
  let time = Date.parse(`${start}T00:00:00Z`);
  return values.map((adjustedClose) => {
    while ([0, 6].includes(new Date(time).getUTCDay())) time += 86400000;
    const date = new Date(time).toISOString().slice(0, 10);
    time += 86400000;
    return { date, adjustedClose };
  });
}
function fromReturns(returns) {
  let value = 100;
  return prices([100, ...returns.map((r) => (value *= 1 + r))]);
}

test("drawdown episodes identify peak, trough, exact recovery and unrecovered decline", () => {
  const px = prices([100, 120, 90, 100, 120, 130, 104, 110]);
  const result = analyzeDrawdowns(px);
  close(result.maxDrawdown, -0.25);
  assert.equal(result.points.length, px.length);
  assert.equal(result.episodes.length, 2);
  assert.deepEqual(result.episodes[0], {
    peak: "2020-01-02", trough: "2020-01-03", recovery: "2020-01-07",
    loss: -0.25, declineDays: 1, recoveryDays: 4, underwaterDays: 5,
  });
  assert.equal(result.episodes[1].recovery, null);
  assert.equal(result.episodes[1].recoveryDays, null);
  assert.equal(result.episodes[1].underwaterDays, 2);
  close(result.points[6].drawdown, -0.2);
});

test("new equal highs reset the peak and increasing prices have no drawdown episodes", () => {
  assert.equal(analyzeDrawdowns(prices([100, 101, 102])).episodes.length, 0);
  assert.deepEqual(analyzeDrawdowns([]), { points: [], episodes: [], maxDrawdown: 0 });
  const result = analyzeDrawdowns(prices([100, 100, 90]));
  assert.equal(result.episodes[0].peak, "2020-01-02");
});

test("sample annualized volatility and risk-adjusted ratios match independent formulas", () => {
  const returns = [0.02, -0.01, 0.03, -0.02];
  const px = fromReturns(returns);
  const avg = 0.005;
  const variance = returns.reduce((s, r) => s + (r - avg) ** 2, 0) / 3;
  const vol = Math.sqrt(variance * 252);
  close(annualizedVolatility(px), vol);
  const r = riskRatios(px);
  close(r.volatility, vol);
  close(r.sharpe, (avg * 252) / vol);
  const downside = Math.sqrt((0.01 ** 2 + 0.02 ** 2) / 4 * 252);
  close(r.downsideDeviation, downside);
  close(r.sortino, avg * 252 / downside);
  close(r.maxDrawdown, 0.02);
  close(r.cagr, annualizedReturn(px[0].date, 100, px.at(-1).date, px.at(-1).adjustedClose));
  close(r.calmar, r.cagr / 0.02);
  assert.equal(r.observations, 4);
});

test("risk-free input is effective annual rate and Sortino uses all observations", () => {
  const returns = [0.01, -0.005, 0.002, -0.01, 0.015];
  const rf = 0.04, dailyRf = Math.pow(1.04, 1 / 252) - 1;
  const excess = returns.map((r) => r - dailyRf);
  const avg = excess.reduce((s, r) => s + r, 0) / 5;
  const downside = Math.sqrt(excess.reduce((s, r) => s + Math.min(0, r) ** 2, 0) / 5 * 252);
  const result = riskRatios(fromReturns(returns), rf);
  close(result.sortino, avg * 252 / downside);
  close(result.sharpe, avg / sampleDeviation(returns) * Math.sqrt(252));
  assert.equal(riskRatios(fromReturns(returns), -1).sharpe, null);
  assert.equal(riskRatios(fromReturns(returns), NaN).sortino, null);
});

test("undefined denominators and insufficient observations never produce infinity", () => {
  const flat = riskRatios(prices([100, 100, 100]));
  assert.equal(flat.sharpe, null);
  assert.equal(flat.sortino, null);
  assert.equal(flat.calmar, null);
  assert.equal(flat.volatility, 0);
  const up = riskRatios(fromReturns([0.01, 0.02, 0.01]));
  assert.equal(up.sortino, null);
  assert.equal(up.calmar, null);
  assert.equal(riskRatios(prices([100])).maxDrawdown, null);
  assert.equal(annualizedVolatility(prices([100, 110])), null);
  assert.equal(betaCorrelation([]).beta, null);
});

test("daily pairs align both endpoints, rejecting unequal intervals and missing week gaps", () => {
  const a = prices([100, 101, 102, 103, 104]);
  const b = a.filter((_, i) => i !== 2);
  const pairs = pairedReturns(a, b);
  assert.deepEqual(pairs.map((p) => p.date), [a[1].date, a[4].date]);
  const gapped = [{ date: "2020-01-01", adjustedClose: 100 }, { date: "2020-01-20", adjustedClose: 110 }];
  assert.equal(dailyReturns(gapped).length, 0);
});

test("beta and correlation use sample covariance with correct direction and sign", () => {
  const benchmark = [-0.02, 0.01, 0.03, -0.01, 0.02];
  const pairs = benchmark.map((b, i) => ({ date: `2020-01-0${i + 1}`, benchmark: b, stock: 0.001 + 2 * b }));
  const stats = betaCorrelation(pairs);
  close(stats.beta, 2);
  close(stats.correlation, 1);
  close(stats.rSquared, 1);
  close(stats.stockVolatility, 2 * stats.benchmarkVolatility);
  const inverse = betaCorrelation(pairs.map((p) => ({ ...p, stock: -p.benchmark })));
  close(inverse.beta, -1);
  close(inverse.correlation, -1);
  const flatBenchmark = betaCorrelation(pairs.map((p) => ({ ...p, benchmark: 0 })));
  assert.equal(flatBenchmark.beta, null);
  assert.equal(flatBenchmark.correlation, null);
  const flatStock = betaCorrelation(pairs.map((p) => ({ ...p, stock: 0 })));
  close(flatStock.beta, 0);
  assert.equal(flatStock.correlation, null);
});

test("rolling volatility requires full contiguous observation windows", () => {
  const px = fromReturns([0.01, -0.02, 0.03, -0.01]);
  const r = rollingVolatility(px, 3);
  assert.equal(r.length, 2);
  close(r[0].value, sampleDeviation([0.01, -0.02, 0.03]) * Math.sqrt(252));
  assert.equal(r[0].date, px[3].date);
  assert.equal(rollingVolatility(px, 5).length, 0);
  assert.equal(rollingVolatility(px, 1).length, 0);
  assert.equal(rollingVolatility(px, 2.5).length, 0);
  const gapped = [...px, { date: "2020-02-20", adjustedClose: 110 }, { date: "2020-02-21", adjustedClose: 111 }];
  assert.equal(rollingVolatility(gapped, 3).length, 2);
});
