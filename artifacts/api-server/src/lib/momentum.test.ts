import assert from "node:assert/strict";
import test from "node:test";
import { ETF_UNIVERSE, advanceMomentum, initialMomentum, momentumSignals, nextQuarter, capturedMomentumInception, type MomentumMarket } from "./momentum-engine";
import { MOMENTUM_CAPTURED_AT, MOMENTUM_INCEPTION_SIGNALS } from "./momentum-inception";

function fixture(qualifying = ["VTI", "VEU", "VWO"]): MomentumMarket {
  const dates: string[] = [];
  let cursor = Date.parse("2026-10-23T12:00:00Z");
  while (dates.length < 200) {
    const d = new Date(cursor);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.unshift(d.toISOString().slice(0, 10));
    cursor -= 864e5;
  }
  const adjusted = Object.fromEntries(ETF_UNIVERSE.map((e) => [e.ticker, Object.fromEntries(dates.map((d) => [d, 100]))]));
  return {
    observedAt: "2026-10-26T16:00:00.000Z", targetDate: "2026-10-23",
    prices: structuredClone(adjusted), adjusted, actions: [],
    live: Object.fromEntries(ETF_UNIVERSE.map((e) => [e.ticker, { price: qualifying.includes(e.ticker) ? 110 : 90, at: "2026-10-26T15:59:55.000Z" }])),
  };
}
function addClose(m: MomentumMarket, date: string, prices: Record<string, number>) {
  m.targetDate = date;
  m.observedAt = `${date}T21:00:00.000Z`;
  m.live = {};
  for (const e of ETF_UNIVERSE) {
    m.prices[e.ticker][date] = prices[e.ticker] ?? 90;
    m.adjusted[e.ticker][date] = prices[e.ticker] ?? 90;
  }
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test("actual launch capture is complete, timestamped and portable without changing inception", () => {
  const r = capturedMomentumInception(MOMENTUM_INCEPTION_SIGNALS, MOMENTUM_CAPTURED_AT);
  assert.equal(r.state.inceptionDate, "2026-10-26");
  assert.equal(r.state.inceptionAt, MOMENTUM_CAPTURED_AT);
  assert.deepEqual(r.state.positions.map((p) => p.ticker), ["VTI"]);
  assert.equal(r.state.positions[0].entryPrice, 375.34);
  assert.equal(r.snapshots[0].value, 30000);
  assert.throws(() => capturedMomentumInception(MOMENTUM_INCEPTION_SIGNALS.slice(1), MOMENTUM_CAPTURED_AT));
  assert.throws(() => capturedMomentumInception(MOMENTUM_INCEPTION_SIGNALS, "2026-10-27T16:00:00Z"));
});

test("SMA uses exactly 200 completed closes, live price is not inserted, equality does not qualify", () => {
  const m = fixture();
  m.live.VTI.price = 100;
  const rows = momentumSignals(m, "2026-10-26", true);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].sma200, 100);
  assert.equal(rows[0].sessions, 200);
  assert.equal(rows[0].aboveSma, false);
  assert.equal(rows[1].aboveSma, true);
  assert.equal(rows[0].smaDate, "2026-10-23");
});

test("all qualifying ETFs get equal fractions of $30k, without a fixed three-ETF limit", () => {
  for (const count of [1, 3, 6]) {
    const m = fixture(ETF_UNIVERSE.slice(0, count).map((e) => e.ticker));
    const r = advanceMomentum(initialMomentum(), m);
    assert.equal(r.state.positions.length, count);
    r.state.positions.forEach((p) => { near(p.costBasis, 30000 / count); near(p.shares, 30000 / count / 110); });
    assert.equal(r.state.nextRebalanceDate, "2027-01-26");
    assert.equal(r.snapshots[0].value, 30000);
    assert.equal(r.state.cash, 0);
  }
});

test("none qualifying is a funded cash-only inception, not pending", () => {
  const r = advanceMomentum(initialMomentum(), fixture([]));
  assert.equal(r.state.inceptionDate, "2026-10-26");
  assert.equal(r.state.positions.length, 0);
  assert.equal(r.state.cash, 30000);
  assert.equal(r.state.nextRebalanceDate, "2027-01-26");
  assert.equal(r.events.filter((e) => e.type === "buy").length, 0);
});

test("missing SMA bar, insufficient history, stale quote or absent quote block the entire allocation", () => {
  for (const change of [
    (m: MomentumMarket) => { delete m.adjusted.TIP[Object.keys(m.adjusted.TIP)[50]]; },
    (m: MomentumMarket) => { for (const e of ETF_UNIVERSE) delete m.adjusted[e.ticker][Object.keys(m.adjusted[e.ticker])[0]]; },
    (m: MomentumMarket) => { m.live.TIP.at = "2026-10-23T16:00:00Z"; },
    (m: MomentumMarket) => { delete m.live.TIP; },
  ]) {
    const m = fixture();
    change(m);
    const r = advanceMomentum(initialMomentum(), m);
    assert.equal(r.state.inceptionDate, null);
    assert.equal(r.state.cash, 30000);
    assert.equal(r.events.length, 0);
  }
});

test("quarterly compounding rotates all equity and dividends; restarts cannot duplicate trades", () => {
  const m = fixture(["VTI"]);
  let state = advanceMomentum(initialMomentum(), m).state;
  addClose(m, "2026-10-27", { VTI: 110 });
  m.actions = [{ ticker: "VTI", date: "2026-10-27", type: "dividend", value: 1.1 }];
  state = advanceMomentum(state, m).state;
  near(state.cash, 300);
  addClose(m, "2027-01-26", { VTI: 220, VEU: 150 });
  const r = advanceMomentum(state, m);
  assert.deepEqual(r.state.positions.map((p) => p.ticker), ["VTI", "VEU"]);
  r.state.positions.forEach((p) => near(p.costBasis, 60300 / 2));
  assert.equal(r.state.cash, 0);
  assert.equal(r.state.nextRebalanceDate, "2027-04-26");
  const retry = advanceMomentum(r.state, m);
  assert.equal(retry.events.length, 0);
  assert.equal(retry.snapshots.length, 0);
});

test("quarterly all-cash exit and later re-entry; no fabricated interest", () => {
  const m = fixture(["VTI"]);
  const initial = advanceMomentum(initialMomentum(), m).state;
  addClose(m, "2027-01-26", { VTI: 80 });
  const cash = advanceMomentum(initial, m);
  assert.equal(cash.state.positions.length, 0);
  near(cash.state.cash, 30000 * 80 / 110);
  addClose(m, "2027-04-26", { VTI: 120, TIP: 120 });
  const invested = advanceMomentum(cash.state, m);
  assert.deepEqual(invested.state.positions.map((p) => p.ticker), ["VTI", "TIP"]);
  invested.state.positions.forEach((p) => near(p.costBasis, cash.state.cash / 2));
});

test("historical gaps recover with carried actions, without double dividends or resetting capital", () => {
  const m = fixture(["VTI"]);
  let state = advanceMomentum(initialMomentum(), m).state;
  addClose(m, "2026-10-27", {});
  delete m.prices.VTI["2026-10-27"];
  m.actions = [{ ticker: "VTI", date: "2026-10-27", type: "dividend", value: 1.1 }];
  const gap = advanceMomentum(state, m);
  state = gap.state;
  assert.equal(gap.snapshots.length, 0);
  assert.deepEqual(state.valuationGaps, ["2026-10-27"]);
  addClose(m, "2026-10-28", { VTI: 110 });
  const recovered = advanceMomentum(state, m);
  near(recovered.state.cash, 300);
  near(recovered.snapshots.at(-1)!.value, 30300);
  assert.equal(recovered.state.processedDate, "2026-10-28");
  assert.equal(advanceMomentum(recovered.state, m).events.length, 0);
});

test("split adjusts shares, entry PPS and entry SMA, not cost basis; no launch-day entitlement", () => {
  const m = fixture(["VTI"]);
  m.actions = [{ ticker: "VTI", date: "2026-10-26", type: "dividend", value: 5 }];
  let state = advanceMomentum(initialMomentum(), m).state;
  addClose(m, "2026-10-26", { VTI: 110 });
  state = advanceMomentum(state, m).state;
  assert.equal(state.cash, 0);
  addClose(m, "2026-10-27", { VTI: 55 });
  m.actions.push({ ticker: "VTI", date: "2026-10-27", type: "split", value: 2 });
  const split = advanceMomentum(state, m);
  near(split.state.positions[0].shares, 30000 / 55);
  assert.equal(split.state.positions[0].entryPrice, 55);
  assert.equal(split.state.positions[0].entrySma, 50);
  assert.equal(split.state.positions[0].costBasis, 30000);
  near(split.snapshots.at(-1)!.value, 30000);
});

test("anchored calendar quarters clamp month ends without schedule drift", () => {
  assert.equal(nextQuarter("2026-01-31", "2026-01-31"), "2026-04-30");
  assert.equal(nextQuarter("2026-01-31", "2026-04-30"), "2026-07-31");
  assert.equal(nextQuarter("2026-11-30", "2026-11-30"), "2027-02-28");
  assert.equal(nextQuarter("2026-11-30", "2027-03-01"), "2027-05-30");
});

test("missed quarters replay point-in-time SMA, with no look-ahead to later prices", () => {
  const m = fixture(["VTI"]);
  const state = advanceMomentum(initialMomentum(), m).state;
  addClose(m, "2027-01-26", { VTI: 80, VEU: 120 });
  addClose(m, "2027-04-26", { VTI: 200, VEU: 80 });
  const r = advanceMomentum(state, m);
  const rebalances = r.events.filter((e) => e.type === "rebalance");
  assert.equal(rebalances.length, 2);
  assert.deepEqual((rebalances[0] as { tickers: string[] }).tickers, ["VEU"]);
  assert.deepEqual((rebalances[1] as { tickers: string[] }).tickers, ["VTI"]);
});

test("quarterly missing signal waits, then retries same closing valuation without duplicate actions", () => {
  const m = fixture(["VTI"]);
  const initial = advanceMomentum(initialMomentum(), m).state;
  addClose(m, "2027-01-26", { VTI: 110, VEU: 150 });
  const missingDate = Object.keys(m.adjusted.TIP)[20];
  delete m.adjusted.TIP[missingDate];
  const blocked = advanceMomentum(initial, m);
  assert.equal(blocked.events.filter((e) => e.type === "rebalance").length, 0);
  assert.match(blocked.state.message!, /waiting/);
  m.adjusted.TIP[missingDate] = 100;
  const recovered = advanceMomentum(blocked.state, m);
  assert.equal(recovered.events.filter((e) => e.type === "rebalance").length, 1);
  assert.equal(advanceMomentum(recovered.state, m).events.length, 0);
});
