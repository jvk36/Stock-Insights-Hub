import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHistoricalBook, parseFairfaxBook, type HistoricalBook } from "./blind-trust-history";
import { applySpinoffCash, historicalCandidates, runBlindTrustBacktest } from "./blind-trust-backtest";
import { UNIVERSE } from "./model-portfolio-engine";
import type { MomentumMarket } from "./momentum-engine";

const context = (id: string, member = "") => `<xbrli:context id="${id}"><xbrli:entity>${member ? `<xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">${member}</xbrldi:explicitMember>` : ""}</xbrli:entity><xbrli:period><xbrli:instant>2016-06-30</xbrli:instant></xbrli:period></xbrli:context>`;
const fact = (tag: string, value: number, ref = "all") => `<us-gaap:${tag} contextRef="${ref}">${value}</us-gaap:${tag}>`;
const xml = (s: string) => `<xbrl>${context("all")}${s}</xbrl>`;
test("uses parent equity minus preferred, never EPS weighted-average shares", () => {
  assert.equal(parseHistoricalBook(xml(fact("StockholdersEquity", 1000) + fact("PreferredStockValue", 100) +
    fact("CommonStockSharesOutstanding", 30) + fact("WeightedAverageNumberOfSharesOutstandingBasic", 2)), "JEF", "2016-06-30"), 30);
});
test("Berkshire equivalent-A shares prefer outstanding over issued including treasury", () => {
  const doc = xml(context("a", "us-gaap:CommonClassAMember") + context("b", "us-gaap:CommonClassBMember") +
    fact("StockholdersEquity", 3000) + fact("CommonStockSharesOutstanding", 10, "a") +
    fact("CommonStockSharesOutstanding", 15000, "b") + fact("CommonStockSharesIssued", 45000, "b"));
  assert.equal(parseHistoricalBook(doc, "BRK.A", "2016-06-30"), 150);
});
test("BOC combines both classes and removes treasury rather than using only Class B", () => {
  const doc = xml(context("a", "us-gaap:CommonClassAMember") + context("b", "us-gaap:CommonClassBMember") +
    fact("StockholdersEquity", 1000) + fact("CommonStockSharesIssued", 95, "a") +
    fact("CommonStockSharesOutstanding", 10, "b") + fact("TreasuryStockCommonShares", 5));
  assert.equal(parseHistoricalBook(doc, "BOC", "2016-06-30"), 10);
});
test("period-end issued minus treasury is supported, wrong instant is rejected", () => {
  const doc = xml(fact("StockholdersEquity", 1000) + fact("CommonStockSharesIssued", 120) + fact("TreasuryStockCommonShares", 20));
  assert.equal(parseHistoricalBook(doc, "L", "2016-06-30"), 10);
  assert.equal(parseHistoricalBook(doc, "L", "2017-06-30"), null);
});
test("Fairfax reads original June USD book value, not prior-year comparison", () => {
  assert.equal(parseFairfaxBook("<p>Book value per basic share at June 30, 2024 was $979.63 compared to $939.65 at December 31, 2023.</p>", 2024), 979.63);
  assert.equal(parseFairfaxBook("Book value per basic share at December 31, 2024 was $979.63", 2024), null);
});
function fixture(): { market: MomentumMarket; books: HistoricalBook[] } {
  const dates = ["2016-10-26", "2017-10-26", "2018-10-26", "2019-10-28", "2020-10-26",
    "2021-10-26", "2022-10-26", "2023-10-26", "2024-10-28", "2025-10-27", "2026-10-23", "2026-10-26"];
  const stocks = UNIVERSE.filter((e) => e.ticker !== "PSUS");
  return {
    market: { observedAt: "2026-10-26T20:30:00Z", targetDate: "2026-10-26", live: {}, adjusted: {}, actions: [],
      prices: Object.fromEntries(stocks.map((e, i) => [e.ticker, Object.fromEntries(dates.map((d) => [d, (i + 1) * 10]))])) },
    books: stocks.flatMap((e) => Array.from({ length: 10 }, (_, i) => ({
      ticker: e.ticker, date: `${2016 + i}-06-30`, filed: `${2016 + i}-08-01`, value: 10, source: "https://www.sec.gov/example",
    }))),
  };
}
test("excludes not-yet-priced PSUS and invests $10k in the three lowest historical P/Bs annually", () => {
  const { market, books } = fixture();
  const result = runBlindTrustBacktest(market, books);
  assert.equal(result.status, "complete");
  assert.equal(result.allocations.length, 10);
  assert.deepEqual(result.allocations[0].positions.filter((p) => p.selected).map((p) => p.ticker), ["BRK.A", "MKL", "FRFHF"]);
  assert.equal(result.allocations[0].positions.find((p) => p.ticker === "PSUS")?.price, null);
  assert.equal(result.finalValue, 30000);
  assert.equal(result.actualEndDate, "2026-10-23");
  for (const p of result.allocations[0].positions.filter((p) => p.selected)) assert.ok(Math.abs(p.value - 10000) < 1e-8);
});
test("rejects future filings and same-day publications and does not substitute current book values", () => {
  const { market, books } = fixture();
  books.push({ ticker: "BOC", date: "2016-09-30", filed: "2016-10-26", value: 100000, source: "future" });
  assert.equal(historicalCandidates(market, books, "2016-10-26").find((c) => c.ticker === "BOC")?.bookValue, 10);
});
test("a priced issuer with missing book value blocks selection instead of silently excluding it", () => {
  const { market, books } = fixture();
  const result = runBlindTrustBacktest(market, books.filter((b) => b.ticker !== "MKL"));
  assert.equal(result.status, "unavailable");
  assert.equal(result.allocations.length, 0);
  assert.equal(result.finalValue, null);
});
test("preserves failed latest-book observations rather than falling back to an older valid value", () => {
  const { market, books } = fixture();
  books.push({ ticker: "MKL", date: "2016-09-30", filed: "2016-10-20", value: null, source: "unparsed" });
  assert.equal(historicalCandidates(market, books, "2016-10-26").find((c) => c.ticker === "MKL")?.bookValue, null);
});
test("compounds dividends at annual rebalance without resetting capital or modifying input data", () => {
  const { market, books } = fixture();
  market.actions.push({ ticker: "BRK.A", date: "2017-01-02", type: "dividend", value: 1 });
  const before = JSON.stringify(market);
  const r = runBlindTrustBacktest(market, books);
  assert.equal(r.allocations[1].equity, 31000);
  assert.ok(Math.abs(r.finalValue! - 31000) < 1e-8);
  assert.equal(JSON.stringify(market), before);
});
test("stock distributions create cash for actual distributed shares, not extra parent shares", async () => {
  const { market } = fixture();
  market.actions.push(
    { ticker: "JEF", date: "2019-09-27", type: "split", value: 1.068 },
    { ticker: "JEF", date: "2023-01-17", type: "split", value: 1.046 },
    { ticker: "HHH", date: "2024-08-01", type: "split", value: 1.049 },
  );
  const children: MomentumMarket = { ...market, prices: {
    SPB: { "2019-09-27": 50 }, VTS: { "2023-01-17": 20 }, SEG: { "2024-08-01": 27 },
  } };
  await applySpinoffCash(market, children);
  assert.equal(market.actions.filter((a) => a.type === "split").length, 0);
  assert.equal(market.actions.find((a) => a.ticker === "HHH")?.value, 3);
  assert.equal(market.actions.find((a) => a.date === "2019-09-27")?.value, 50 * 0.0250589);
});
test("an interior missing candidate quote delays selection instead of changing the cheapest-three set", () => {
  const { market, books } = fixture();
  delete market.prices["BRK.A"]["2017-10-26"];
  market.prices["BRK.A"]["2017-10-27"] = 10;
  for (const e of UNIVERSE.filter((e) => e.ticker !== "PSUS")) market.prices[e.ticker]["2017-10-27"] ??= market.prices[e.ticker]["2018-10-26"];
  const result = runBlindTrustBacktest(market, books);
  assert.equal(result.allocations[1].date, "2017-10-27");
  assert.equal(result.allocations[1].scheduledDate, "2017-10-26");
});
