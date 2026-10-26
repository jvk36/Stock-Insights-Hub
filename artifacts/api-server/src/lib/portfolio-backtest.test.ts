import test from "node:test";
import assert from "node:assert/strict";
import { runPortfolioBacktest, BACKTEST_START, BACKTEST_END_EXCLUSIVE } from "./portfolio-backtest-engine";
import { ETF_UNIVERSE, type MomentumMarket } from "./momentum-engine";
import { LAZY_UNIVERSE } from "./lazy-engine";

const tickers = [...new Set([...ETF_UNIVERSE, ...LAZY_UNIVERSE].map((e) => e.ticker))];
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fixture(dates = [BACKTEST_START, "2017-01-26", "2026-10-23"]): MomentumMarket {
  const m: MomentumMarket = { prices: {}, adjusted: {}, actions: [], live: {}, observedAt: "2026-10-26T22:00:00Z", targetDate: "2026-10-26" };
  for (const ticker of tickers) {
    m.prices[ticker] = {};
    m.adjusted[ticker] = {};
    for (let i = 201; i > 0; i--) {
      const d = new Date(Date.parse(`${BACKTEST_START}T12:00:00Z`) - i * 864e5).toISOString().slice(0, 10);
      m.prices[ticker][d] = m.adjusted[ticker][d] = 100;
    }
    for (const date of dates) m.prices[ticker][date] = m.adjusted[ticker][date] = 100;
  }
  return m;
}

test("Historical simulation is bounded before live inception, with $30k and every quarterly allocation recorded", () => {
  const dates = [BACKTEST_START, "2017-01-26", "2017-04-26", "2017-07-26", "2026-10-23", BACKTEST_END_EXCLUSIVE];
  const m = fixture(dates);
  for (const t of tickers) m.prices[t][BACKTEST_END_EXCLUSIVE] = 1e9;
  const r = runPortfolioBacktest("lazy", m);
  assert.equal(r.actualStartDate, BACKTEST_START);
  assert.equal(r.actualEndDate, "2026-10-23");
  assert.equal(r.initialCapital, 30000);
  near(r.finalValue!, 30000);
  assert.equal(r.allocations.length, 5);
  assert.ok(r.performance.every((p) => p.date < BACKTEST_END_EXCLUSIVE));
  assert.deepEqual(r.allocations[0].positions.map((p) => [p.ticker, p.value, p.weight]),
    [["VTI", 9000, 30], ["VNQ", 6000, 20], ["VEU", 4500, 15], ["VWO", 1500, 5], ["TIP", 4500, 15], ["IEI", 4500, 15]]);
});

test("Momentum strict equality stays in cash, with no fabricated interest", () => {
  const r = runPortfolioBacktest("momentum", fixture());
  assert.ok(r.allocations.every((a) => a.cash === 30000 && a.positions.every((p) => p.shares === 0 && !p.selected)));
  assert.ok(r.performance.every((p) => p.value === 30000 && p.returnPercent === 0));
});

test("Momentum selects all qualifiers equally and uses a prior 200-session warmup, not future prices", () => {
  const m = fixture();
  for (const t of ["VTI", "VEU", "VWO"]) m.prices[t][BACKTEST_START] = m.adjusted[t][BACKTEST_START] = 110;
  const r = runPortfolioBacktest("momentum", m);
  const first = r.allocations[0];
  assert.equal(first.positions.filter((p) => p.selected).length, 3);
  for (const p of first.positions.filter((p) => p.selected)) { near(p.value, 10000); near(p.weight, 100 / 3); near(p.sma200!, 100.05); }
  for (const t of tickers) m.adjusted[t]["2030-01-01"] = 1e10;
  const again = runPortfolioBacktest("momentum", m);
  assert.deepEqual(again.allocations[0], first);
});

test("Quarterly compounding includes dividend cash and never resets to the initial $30k", () => {
  const m = fixture([BACKTEST_START, "2016-12-01", "2017-01-26", "2026-10-23"]);
  m.actions = [{ ticker: "VTI", date: "2016-12-01", type: "dividend", value: 1 }];
  for (const t of tickers) m.prices[t]["2017-01-26"] = 200;
  const r = runPortfolioBacktest("lazy", m);
  const dividend = 9000 / 100;
  const interim = r.performance.find((p) => p.date === "2016-12-01")!;
  near(interim.value, 30000 + dividend);
  near(interim.cash, dividend);
  const quarter = r.allocations.find((a) => a.date === "2017-01-26")!;
  near(quarter.equity, 60000 + dividend);
  near(quarter.positions[0].value, quarter.equity * .3);
  assert.equal(quarter.cash, 0);
});

test("Nontrading quarterly anniversary executes on next available session without drifting the next due date", () => {
  const r = runPortfolioBacktest("lazy", fixture([BACKTEST_START, "2017-01-27", "2017-04-26", "2026-10-23"]));
  assert.equal(r.allocations[1].date, "2017-01-27");
  assert.equal(r.allocations[1].scheduledDate, "2017-01-26");
  assert.equal(r.allocations[2].date, "2017-04-26");
  assert.equal(r.allocations[2].scheduledDate, "2017-04-26");
});

test("Data gaps omit valuations, defer rebalancing, and carry intervening distributions once", () => {
  const m = fixture([BACKTEST_START, "2017-01-26", "2017-01-27", "2026-10-23"]);
  delete m.prices.IEI["2017-01-26"];
  m.actions = [{ ticker: "VTI", date: "2017-01-26", type: "dividend", value: 1 }];
  const r = runPortfolioBacktest("lazy", m);
  assert.equal(r.status, "partial");
  assert.deepEqual(r.omittedDates, ["2017-01-26"]);
  assert.ok(!r.performance.some((p) => p.date === "2017-01-26"));
  near(r.allocations[1].equity, 30090);
  assert.equal(r.allocations[1].date, "2017-01-27");
  near(r.finalValue!, 30090);
});

test("Splits preserve equity and purchases receive no same-day distribution", () => {
  const m = fixture([BACKTEST_START, "2016-12-01", "2017-01-26", "2026-10-23"]);
  m.actions = [
    { ticker: "VTI", date: BACKTEST_START, type: "dividend", value: 100 },
    { ticker: "VTI", date: "2016-12-01", type: "split", value: 2 },
  ];
  for (const d of ["2016-12-01", "2017-01-26", "2026-10-23"]) m.prices.VTI[d] = 50;
  const r = runPortfolioBacktest("lazy", m);
  assert.ok(r.performance.every((p) => Math.abs(p.value - 30000) < 1e-6));
  near(r.allocations[1].positions[0].shares, 180);
});

test("Missing SMA history cannot silently remove an ETF or fabricate a Momentum allocation", () => {
  const m = fixture();
  m.adjusted.TIP = {};
  const r = runPortfolioBacktest("momentum", m);
  assert.equal(r.status, "unavailable");
  assert.equal(r.finalValue, null);
  assert.equal(r.allocations.length, 0);
  assert.equal(r.performance.length, 0);
});

test("Truncated history is explicitly partial and repeated runs are deterministic without modifying source", () => {
  const m = fixture(["2020-01-02", "2020-04-27"]);
  const original = structuredClone(m);
  const a = runPortfolioBacktest("lazy", m);
  assert.equal(a.status, "partial");
  assert.match(a.message!, /start.*missing|does not reach/);
  assert.deepEqual(a, runPortfolioBacktest("lazy", m));
  assert.deepEqual(m, original);
});
