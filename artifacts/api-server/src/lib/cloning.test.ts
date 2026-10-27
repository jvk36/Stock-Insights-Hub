import test from "node:test";
import assert from "node:assert/strict";
import { selectCloningPicks, reviewDates, filingDeadline, nextCloningDate, canonicalTicker, type CloneFiling, type CloneReview } from "./cloning-selection";
import { runCloning } from "./cloning-engine";
import type { MomentumMarket } from "./momentum-engine";

const holding = (ticker: string, shares: number, value: number) => ({ ticker, name: ticker, cusip: ticker, shares, value });
function pair(cik = "1", ticker = "AAA", amount = 100): CloneFiling[] {
  const base = { fundCik: cik, manager: `Manager ${cik}`, total: 1000, accession: `0000000001-26-00000${cik}` };
  return [
    { ...base, reportDate: "2026-03-31", filingDate: "2026-05-01", holdings: [holding("OLD", 100, 100)] },
    { ...base, reportDate: "2026-06-30", filingDate: "2026-08-14", holdings: [holding("OLD", 100, 100), holding(ticker, 100, amount)] },
  ];
}
function market(dates = ["2026-08-17", "2026-08-18", "2026-11-16"]): MomentumMarket {
  return { targetDate: dates.at(-1)!, observedAt: "2026-11-17T00:00:00Z", prices: {
    SPY: Object.fromEntries(dates.map((d) => [d, 100])),
    AAA: Object.fromEntries(dates.map((d, i) => [d, 10 + i])),
  }, adjusted: {}, actions: [], live: {} };
}
function review(date = "2026-08-17", scheduledDate = "2026-08-15"): CloneReview {
  return { date, scheduledDate, reportDate: "2026-06-30", ...selectCloningPicks(pair(), "2026-06-30", date) };
}
test("quarter deadlines are literal 45 calendar days, not quarter-start anniversaries", () => {
  assert.equal(filingDeadline("2026-06-30"), "2026-08-14");
  assert.equal(filingDeadline("2026-09-30"), "2026-11-14");
  assert.equal(filingDeadline("2026-12-31"), "2027-02-14");
  assert.equal(filingDeadline("2027-03-31"), "2027-05-15");
  assert.equal(nextCloningDate("2026-10-27"), "2026-11-14");
});
test("requested Saturday inception moves to Monday; later review remains quarter anchored", () => {
  const r = reviewDates("2026-08-15", "2026-12-01", ["2026-08-17", "2026-11-16"]);
  assert.deepEqual(r.map((x) => [x.scheduledDate, x.date]), [["2026-08-15", "2026-08-17"], ["2026-11-14", "2026-11-16"]]);
});
test("the exact decade includes its final August 14 deadline before Saturday inception", () => {
  const sessions = Array.from({ length: 3660 }, (_, i) => new Date(Date.parse("2016-08-15") + i * 864e5))
    .filter((d) => ![0, 6].includes(d.getUTCDay())).map((d) => d.toISOString().slice(0, 10));
  const r = reviewDates("2016-08-15", "2026-08-15", sessions);
  assert.equal(r.length, 41);
  assert.equal(r[0].date, "2016-08-15");
  assert.ok(r.every((d) => d.date! < "2026-08-15"));
});
test("rank added share value relative to the current portfolio, not total position-weight change", () => {
  const f = pair();
  f[1].holdings = [holding("OLD", 150, 300), holding("NEW", 100, 80)];
  const { picks } = selectCloningPicks(f, "2026-06-30", "2026-08-17");
  assert.equal(picks.length, 1);
  assert.equal(picks[0].ticker, "OLD");
  assert.equal(picks[0].addedWeight, 10);
  assert.equal(picks[0].activity, "increase");
});
test("only one winner per manager; deduplicate across managers and continue to ten distinct stocks", () => {
  const f = Array.from({ length: 12 }, (_, i) => pair(String(i + 1), i < 2 ? "SAME" : `T${i}`, 500 - i)).flat();
  const { picks } = selectCloningPicks(f, "2026-06-30", "2026-08-17");
  const selected = picks.filter((p) => p.selected);
  assert.equal(selected.length, 10);
  assert.equal(new Set(selected.map((p) => p.ticker)).size, 10);
  assert.equal(selected.filter((p) => p.ticker === "SAME").length, 1);
  assert.equal(picks.length, 12);
});
test("no purchases is different from an unavailable prior comparison", () => {
  const f = pair();
  f[1].holdings = [holding("OLD", 90, 100)];
  assert.deepEqual(selectCloningPicks(f, "2026-06-30", "2026-08-17"), { picks: [], issues: [] });
  const missing = selectCloningPicks([f[1]], "2026-06-30", "2026-08-17");
  assert.equal(missing.picks.length, 0);
  assert.match(missing.issues[0], /previous quarter/);
});
test("reject future and same-day filings, and retain the original available filing", () => {
  const f = pair();
  const later = { ...f[1], filingDate: "2026-08-16", holdings: [holding("FUTURE", 1, 999)] };
  assert.equal(selectCloningPicks([...f, later], "2026-06-30", "2026-08-17").picks[0].ticker, "AAA");
  f[1].filingDate = "2026-08-17";
  assert.equal(selectCloningPicks(f, "2026-06-30", "2026-08-17").picks.length, 0);
});
test("share splits do not become fictitious purchases; reverse splits normalize too", () => {
  const f = pair();
  f[1].holdings = [holding("OLD", 200, 200)];
  const actions = [{ ticker: "OLD", type: "split" as const, date: "2026-05-01", value: 2 }];
  assert.equal(selectCloningPicks(f, "2026-06-30", "2026-08-17", actions).picks.length, 0);
  f[1].holdings[0].shares = 75;
  actions[0].value = 0.5;
  assert.ok(Math.abs(selectCloningPicks(f, "2026-06-30", "2026-08-17", actions).picks[0].addedWeight - 20 / 3) < 1e-10);
});
test("documented USD listing and unchanged-CUSIP rename use verified ticker aliases", () => {
  assert.equal(canonicalTicker("BRK.A"), "BRK-A");
  assert.equal(canonicalTicker("AJG.MX"), "AJG");
  assert.equal(canonicalTicker("YNDX"), "NBIS");
});
test("allocate 30k at execution close and compound all current equity at quarterly review", () => {
  const m = market(), input = JSON.stringify(m);
  const b = runCloning(m, [review(), review("2026-11-16", "2026-11-14")], "2026-08-15", "2026-11-17");
  assert.equal(b.status, "complete");
  assert.equal(b.allocations[0].positions[0].shares, 3000);
  assert.equal(b.allocations[1].equity, 36000);
  assert.equal(b.finalValue, 36000);
  assert.equal(JSON.stringify(m), input);
});
test("fewer than ten picks are equally funded; verified no-buys means cash", () => {
  const m = market();
  m.prices.BBB = { ...m.prices.AAA };
  const r = review();
  r.picks = selectCloningPicks([...pair(), ...pair("2", "BBB")], "2026-06-30", r.date).picks;
  const b = runCloning(m, [r], "2026-08-15", "2026-11-17");
  assert.deepEqual(b.allocations[0].positions.map((p) => p.value), [15000, 15000]);
  const cash = runCloning(m, [{ ...r, picks: [] }], "2026-08-15", "2026-11-17");
  assert.equal(cash.finalValue, 30000);
  assert.equal(cash.performance[0].cash, 30000);
});
test("never skip an unpriced selected winner or silently execute at a later close", () => {
  const m = market();
  delete m.prices.AAA["2026-08-17"];
  const b = runCloning(m, [review()], "2026-08-15", "2026-11-17");
  assert.equal(b.status, "unavailable");
  assert.equal(b.finalValue, null);
  assert.equal(b.allocations.length, 0);
  assert.match(b.message!, /AAA/);
});
test("dividends accrue to prior holders, not inception-day buyers", () => {
  const m = market();
  m.actions = [
    { ticker: "AAA", date: "2026-08-17", type: "dividend", value: 100 },
    { ticker: "AAA", date: "2026-08-18", type: "dividend", value: 1 },
  ];
  const b = runCloning(m, [review()], "2026-08-15", "2026-11-17");
  assert.equal(b.performance[0].cash, 0);
  assert.equal(b.performance[1].cash, 3000);
});
test("a verified cash acquisition removes the holding and preserves proceeds", () => {
  const m = { ...market(), settlements: [{ ticker: "AAA", date: "2026-08-18", price: 15, source: "https://issuer.example/closing" }] };
  delete m.prices.AAA["2026-08-18"];
  delete m.prices.AAA["2026-11-16"];
  const b = runCloning(m, [review()], "2026-08-15", "2026-11-17");
  assert.equal(b.finalValue, 45000);
  assert.equal(b.performance.at(-1)!.cash, 45000);
});
test("immutable saved execution counts survive later changes to manager rankings", () => {
  const m = market();
  const first = runCloning(m, [review()], "2026-08-15", "2026-11-17");
  const changed = { ...review(), picks: [] };
  const second = runCloning(m, [changed], "2026-08-15", "2026-11-17", first.allocations);
  assert.deepEqual(second.allocations, first.allocations);
  assert.equal(second.finalValue, first.finalValue);
});
test("unsupported fractional stock distributions stop returns instead of inflating parent shares", () => {
  const m = market();
  m.actions = [{ ticker: "AAA", date: "2026-08-18", type: "split", value: 1.046 }];
  const b = runCloning(m, [review()], "2026-08-15", "2026-11-17");
  assert.equal(b.status, "partial");
  assert.equal(b.actualEndDate, "2026-08-17");
  assert.match(b.message!, /unsupported stock distribution/);
});
