import assert from "node:assert/strict";
import test from "node:test";
import { advanceLazy, capturedLazyInception, LAZY_UNIVERSE, type LazyState } from "./lazy-engine";
import { LAZY_CAPTURED_AT, LAZY_INCEPTION_ASSETS } from "./lazy-inception";
import { nextQuarter, type MomentumMarket } from "./momentum-engine";

const inception = () => capturedLazyInception(LAZY_INCEPTION_ASSETS, LAZY_CAPTURED_AT);
function market(dates: string[], factor = 1): MomentumMarket {
  return {
    observedAt: `${dates.at(-1)}T22:00:00.000Z`, targetDate: dates.at(-1)!,
    prices: Object.fromEntries(LAZY_INCEPTION_ASSETS.map((a) => [a.ticker,
      Object.fromEntries(dates.map((d) => [d, a.price! * factor]))])),
    adjusted: {}, actions: [], live: {},
  };
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("Lazy refresh values fresh quotes and clears recovered errors without changing holdings", () => {
  const initial: LazyState = inception().state;
  initial.message = "Current ETF prices are incomplete; existing holdings and last verified valuation are preserved.";
  const m = market(["2026-10-26"]);
  m.observedAt = "2026-10-27T16:00:00.000Z";
  m.live = Object.fromEntries(LAZY_INCEPTION_ASSETS.map((a) => [a.ticker, { price: a.price! * 1.1, at: "2026-10-27T15:59:00.000Z" }]));
  const r = advanceLazy(initial, m);
  assert.equal(r.state.message, null);
  assert.equal(r.snapshots.at(-1)!.priceBasis, "quote");
  assert.equal(r.snapshots.at(-1)!.date, "2026-10-27");
  near(r.snapshots.at(-1)!.value, 33000);
  assert.deepEqual(r.state.positions, initial.positions);
  assert.equal(r.state.processedDate, "2026-10-26");
  assert.equal(r.state.nextRebalanceDate, "2027-01-26");
  assert.equal(r.events.length, 0);
  assert.equal(advanceLazy(r.state, m).events.length, 0);
  // The completed close replaces the intraday mark; it is not another purchase.
  m.prices = market(["2026-10-27"], 1.2).prices;
  m.targetDate = "2026-10-27"; m.observedAt = "2026-10-27T22:00:00Z";
  const closed = advanceLazy(r.state, m);
  assert.equal(closed.snapshots.at(-1)!.priceBasis, "close");
  near(closed.snapshots.at(-1)!.value, 36000);
  assert.equal(closed.events.length, 0);
});

test("Lazy rejects partial/stale intraday marks and waits for corporate-action accounting", () => {
  for (const kind of ["missing", "stale", "dividend"] as const) {
    const initial = inception().state;
    const m = market(["2026-10-26"]);
    m.observedAt = "2026-10-27T16:00:00Z";
    m.live = Object.fromEntries(LAZY_INCEPTION_ASSETS.map((a) => [a.ticker, { price: a.price!, at: "2026-10-27T15:59:00Z" }]));
    if (kind === "missing") delete m.live.IEI;
    if (kind === "stale") m.live.IEI.at = "2026-10-26T19:59:00Z";
    if (kind === "dividend") m.actions = [{ type: "dividend", ticker: "TIP", date: "2026-10-27", value: 1 }];
    const r = advanceLazy(initial, m);
    assert.ok(r.snapshots.every((s) => s.priceBasis === "close"));
    assert.equal(r.events.length, 0);
    assert.deepEqual(r.state.positions, initial.positions);
  }
});

test("Lazy captures six exact weights and fractional shares totaling $30,000", () => {
  const r = inception();
  assert.equal(r.state.inceptionDate, "2026-10-26");
  assert.equal(r.state.inceptionAt, LAZY_CAPTURED_AT);
  assert.equal(r.state.nextRebalanceDate, "2027-01-26");
  assert.deepEqual(r.state.positions.map((p) => [p.ticker, p.targetWeight, p.costBasis]),
    [["VTI", 30, 9000], ["VNQ", 20, 6000], ["VEU", 15, 4500], ["VWO", 5, 1500], ["TIP", 15, 4500], ["IEI", 15, 4500]]);
  near(r.state.positions.reduce((s, p) => s + p.shares * p.entryPrice, 0), 30000);
  assert.equal(r.events.filter((e) => e.type === "buy").length, 6);
  assert.equal(r.snapshots[0].returnPercent, 0);
  assert.equal(r.snapshots[0].priceBasis, "quote");
});

test("Lazy rejects missing, duplicate, wrong-weight, invalid, stale and wrong-day inception inputs", () => {
  assert.throws(() => capturedLazyInception(LAZY_INCEPTION_ASSETS.slice(1), LAZY_CAPTURED_AT));
  for (const change of [
    { price: 0 }, { price: NaN }, { priceDate: "not-a-date" },
    { priceDate: "2026-10-26T10:00:00Z" }, { targetWeight: 50 }, { ticker: "VNQ" },
  ]) {
    const assets = structuredClone(LAZY_INCEPTION_ASSETS);
    Object.assign(assets[0], change);
    assert.throws(() => capturedLazyInception(assets, LAZY_CAPTURED_AT));
  }
  assert.throws(() => capturedLazyInception(LAZY_INCEPTION_ASSETS, "2026-10-27T20:03:00Z"));
});

test("Lazy holds fixed shares between quarters even when weights drift", () => {
  const r = inception();
  const m = market(["2026-11-02"]);
  m.prices.VTI["2026-11-02"] *= 2;
  const next = advanceLazy(r.state, m);
  assert.deepEqual(next.state.positions, r.state.positions);
  assert.equal(next.events.length, 0);
  near(next.snapshots[0].value, 39000);
  near(next.snapshots[0].returnPercent, 30);
});

test("Lazy rebalances entire appreciated equity plus dividend cash, never resetting capital", () => {
  const r = inception();
  const m = market(["2027-01-26"], 2);
  m.actions = [{ ticker: "VTI", date: "2026-12-15", type: "dividend", value: 1 }];
  const next = advanceLazy(r.state, m);
  const equity = 60000 + r.state.positions[0].shares;
  near(next.snapshots[0].value, equity);
  assert.equal(next.state.cash, 0);
  for (const p of next.state.positions) near(p.costBasis, equity * p.targetWeight / 100);
  assert.equal(next.events.filter((e) => e.type === "sell").length, 6);
  assert.equal(next.events.filter((e) => e.type === "buy").length, 6);
  assert.equal(next.state.nextRebalanceDate, "2027-04-26");
  assert.equal(advanceLazy(next.state, m).events.length, 0);
});

test("Missing close defers valuation/rebalance and carries corporate actions exactly once", () => {
  const m = market(["2027-01-26", "2027-01-27"]);
  delete m.prices.IEI["2027-01-26"];
  m.actions = [{ ticker: "TIP", date: "2027-01-26", type: "dividend", value: 1 }];
  const initial = inception().state;
  const r = advanceLazy(initial, m);
  assert.deepEqual(r.state.valuationGaps, ["2027-01-26"]);
  assert.equal(r.snapshots.length, 1);
  assert.equal(r.state.lastRebalanceDate, "2027-01-27");
  assert.equal(r.state.nextRebalanceDate, "2027-04-26");
  near(r.snapshots[0].value, 30000 + initial.positions.find((p) => p.ticker === "TIP")!.shares);
  assert.equal(r.events.filter((e) => e.type === "dividend").length, 1);
  assert.equal(advanceLazy(r.state, m).events.length, 0);
});

test("Stock split preserves value/cost basis and launch-day distributions are excluded", () => {
  const initial = inception().state;
  const m = market(["2026-11-02"]);
  m.prices.VTI["2026-11-02"] /= 2;
  m.actions = [
    { ticker: "TIP", date: "2026-10-26", type: "dividend", value: 100 },
    { ticker: "VTI", date: "2026-11-02", type: "split", value: 2 },
  ];
  const r = advanceLazy(initial, m);
  near(r.snapshots[0].value, 30000);
  near(r.state.positions[0].shares, initial.positions[0].shares * 2);
  near(r.state.positions[0].entryPrice, initial.positions[0].entryPrice / 2);
  assert.equal(r.state.positions[0].costBasis, 9000);
  assert.equal(r.state.cash, 0);
});

test("Missed quarterly sessions replay in order and date anchor does not drift", () => {
  const m = market(["2027-01-27", "2027-04-26", "2027-07-26"], 1.1);
  const r = advanceLazy(inception().state, m);
  assert.equal(r.events.filter((e) => e.type === "rebalance").length, 3);
  assert.equal(r.state.nextRebalanceDate, "2027-10-26");
  near(r.snapshots.at(-1)!.value, 33000);
  assert.equal(nextQuarter("2026-01-31", "2026-04-30"), "2026-07-31");
});

test("Failed complete-session prices preserve last verified holdings; current assets remain explicit", () => {
  const initial = inception().state;
  const m = market(["2027-01-26"]);
  delete m.prices.VEU["2027-01-26"];
  const r = advanceLazy(initial, m);
  assert.equal(r.snapshots.length, 0);
  assert.equal(r.events.length, 0);
  assert.deepEqual(r.state.positions, initial.positions);
  assert.equal(r.state.assets.find((a) => a.ticker === "VEU")!.price, null);
  assert.match(r.state.message!, /Missing/);
  assert.equal(LAZY_UNIVERSE.reduce((s, e) => s + e.targetWeight, 0), 100);
});
