import assert from "node:assert/strict";
import test from "node:test";
import { build13fSummary, precedingQuarter, type SummaryFiling, type SummaryHolding } from "./thirteen-f-summary-engine";

const funds = [
  { cik: "1", name: "First", slug: "first" },
  { cik: "2", name: "Second", slug: "second" },
  { cik: "3", name: "Missing latest", slug: "missing" },
];
const h = (ticker: string | null, marketValue: number, shares = 100, cusip = ticker ?? "UNRESOLVED"): SummaryHolding =>
  ({ ticker, name: ticker ?? "Unknown issuer", cusip, marketValue, shares });
let id = 0;
const f = (fundCik: string, holdings: SummaryHolding[], prior = false, totalValue = 1000): SummaryFiling => ({
  id: ++id, fundCik, holdings, reportDate: prior ? "2026-06-30" : "2026-09-30",
  filingDate: prior ? "2026-08-14" : "2026-11-14", totalValue,
});
const build = (filings: SummaryFiling[]) => build13fSummary(funds, filings, "2026-09-30", "2026-11-16T12:00:00Z");

test("latest quarter only; a stale manager never substitutes for a missing current filing", () => {
  const r = build([f("1", [h("A", 300)]), f("3", [h("STALE", 900)], true)]);
  assert.equal(r.quarter, "Q3 2026");
  assert.equal(r.previousQuarter, "Q2 2026");
  assert.equal(r.trackedFundCount, 3);
  assert.equal(r.reportingFundCount, 1);
  assert.equal(r.comparisonFundCount, 0);
  assert.deepEqual(r.pendingFunds, ["Second", "Missing latest"]);
  assert.equal(r.positions.some(p => p.ticker === "STALE"), false);
});

test("Biggest Bets keeps individual fund weights; combined weights use only retained positions", () => {
  const r = build([f("1", [h("A", 300), h("B", 100)]), f("2", [h("A", 500)], false, 2000)]);
  assert.deepEqual(r.positions.filter(p => p.ticker === "A").map(p => p.portfolioPct), [30, 25]);
  assert.equal(r.totalValue, 900);
  const a = r.stocks.find(p => p.ticker === "A")!;
  assert.equal(a.marketValue, 800);
  assert.equal(a.ownershipCount, 2);
  assert.equal(a.portfolioPct, 800 / 900 * 100);
  assert.equal(r.stocks.reduce((s, p) => s + p.portfolioPct, 0), 100);
});

test("enforces top100 for legacy uncapped managers; excludes Miscellaneous everywhere", () => {
  const input = Array.from({ length: 110 }, (_, i) => h(`S${i}`, i + 1));
  input.push(h(null, 999999, 0, "__MISC__"));
  const r = build([f("1", input)]);
  assert.equal(r.retainedPositionCount, 100);
  assert.equal(r.positions.length, 100);
  assert.equal(r.positions.some(p => p.securityKey.includes("__MISC__")), false);
  assert.equal(r.positions.some(p => p.ticker === "S0"), false);
  assert.equal(r.totalValue, Array.from({ length: 100 }, (_, i) => i + 11).reduce((s, n) => s + n, 0));
  assert.equal(input.length, 111);
});

test("buys use added shares at current price, not price gains or total position weight", () => {
  const r = build([
    f("1", [h("UP", 400, 200), h("PRICEONLY", 500, 100), h("NEW", 100, 100)]),
    f("1", [h("UP", 100, 100), h("PRICEONLY", 100, 100)], true),
  ]);
  assert.equal(r.comparisonFundCount, 1);
  assert.equal(r.positions.find(p => p.ticker === "UP")!.buyPct, 20);
  assert.equal(r.positions.find(p => p.ticker === "UP")!.activity, "increase");
  assert.equal(r.positions.find(p => p.ticker === "PRICEONLY")!.buyPct, 0);
  assert.equal(r.positions.find(p => p.ticker === "PRICEONLY")!.activity, "unchanged");
  assert.equal(r.positions.find(p => p.ticker === "NEW")!.buyPct, 10);
});

test("partial sales and full exits use prior per-share value and prior full portfolio", () => {
  const r = build([
    f("1", [h("PARTIAL", 500, 50)]),
    f("1", [h("PARTIAL", 400, 100), h("EXIT", 100, 100)], true),
  ]);
  assert.equal(r.positions.find(p => p.ticker === "PARTIAL")!.sellPct, 20);
  assert.equal(r.positions.find(p => p.ticker === "EXIT")!.sellPct, 10);
  assert.equal(r.positions.find(p => p.ticker === "EXIT")!.activity, "sell");
  assert.equal(r.stocks.find(p => p.ticker === "EXIT")!.ownershipCount, 0);
  assert.equal(r.stocks.find(p => p.ticker === "EXIT")!.sellCount, 1);
});

test("a position entering a truncated prior top100 is unknown, never a new buy", () => {
  const r = build([
    f("1", [h("NEW100", 200)]),
    f("1", [h("OLD", 200), h(null, 800, 0, "__MISC__")], true),
  ]);
  const position = r.positions.find(p => p.ticker === "NEW100")!;
  assert.equal(position.buyPct, null);
  assert.equal(position.activity, "unavailable");
  assert.equal(r.stocks.find(p => p.ticker === "NEW100")!.buyCount, 0);
});

test("a position leaving a truncated current top100 is not an inferred sale", () => {
  const r = build([
    f("1", [h("CURRENT", 200), h(null, 800, 0, "__MISC__")]),
    f("1", [h("DROPOUT", 200)], true),
  ]);
  const dropout = r.positions.find(p => p.ticker === "DROPOUT")!;
  assert.equal(dropout.sellPct, null);
  assert.equal(dropout.activity, "unavailable");
  assert.equal(r.stocks.find(p => p.ticker === "DROPOUT")!.sellCount, 0);
});

test("missing adjacent quarter is unknown rather than a multi-quarter buy", () => {
  const older = f("1", [h("A", 100)], true); older.reportDate = "2026-03-31";
  const r = build([f("1", [h("A", 200, 200)]), older]);
  assert.equal(r.positions[0]!.activity, "unavailable");
  assert.equal(r.comparisonFundCount, 0);
});

test("deduplicates filing periods and counts each fund once per ticker", () => {
  const old = f("1", [h("A", 100)]);
  const newer = f("1", [h("A", 200, 100, "ONE"), h("A", 100, 50, "TWO")]);
  newer.filingDate = "2026-11-15";
  const r = build([old, newer]);
  assert.equal(r.positions.length, 1);
  assert.equal(r.totalValue, 300);
  assert.equal(r.stocks[0]!.ownershipCount, 1);
});

test("unresolved holdings remain in combined denominator and get stable drilldown keys", () => {
  const r = build([f("1", [h(null, 100), h("BRK.B", 200)]), f("2", [h("BRK-B", 300)])]);
  assert.equal(r.unresolvedPositionCount, 1);
  assert.equal(r.totalValue, 600);
  assert.equal(r.stocks.find(s => s.ticker === null)!.securityKey, "cusip:UNRESOLVED");
  assert.equal(r.stocks.find(s => s.ticker === "BRK-B")!.ownershipCount, 2);
});

test("counts distinct managers who increased/decreased, not duplicate rows", () => {
  const r = build([
    f("1", [h("A", 400, 200)]), f("1", [h("A", 100, 100)], true),
    f("2", [h("A", 100, 50)]), f("2", [h("A", 200, 100)], true),
  ]);
  assert.equal(r.stocks[0]!.ownershipCount, 2);
  assert.equal(r.stocks[0]!.buyCount, 1);
  assert.equal(r.stocks[0]!.sellCount, 1);
});

test("no reported quarter or a latest stub is explicitly empty, not older summary data", () => {
  assert.equal(build13fSummary(funds, [], null).quarter, null);
  const r = build([f("1", [], false), f("1", [h("OLD", 100)], true)]);
  assert.equal(r.quarter, "Q3 2026");
  assert.equal(r.positions.length, 0);
  assert.equal(r.reportingFundCount, 0);
});

test("zero portfolio totals do not create NaN, Infinity or invented flow metrics", () => {
  const r = build([f("1", [h("A", 100)], false, 0), f("1", [h("A", 100, 50)], true)]);
  assert.equal(r.positions[0]!.portfolioPct, 0);
  assert.equal(r.positions[0]!.buyPct, null);
  assert.equal(JSON.stringify(r).includes("NaN"), false);
});

test("previous quarter crosses the year boundary correctly", () => {
  assert.equal(precedingQuarter("2026-03-31"), "2025-12-31");
  assert.equal(precedingQuarter("2026-12-31"), "2026-09-30");
});
