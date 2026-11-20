import { test } from "node:test";
import assert from "node:assert/strict";
import { groupStockHoldings, isNonStockPosition, selectVerifiedStock, stockTicker, VERIFIED_SEARCH_SOURCE } from "./thirteen-f-security-policy";

const verified = new Map([
  ["A", { ticker: "AAPL", source: VERIFIED_SEARCH_SOURCE }],
  ["B", { ticker: "MSFT", source: "override" }],
]);
const h = (cusip: string, name: string, ticker: string | null, value = 10) =>
  ({ id: 1, filingId: 2, cusip, name, ticker, marketValueThousands: value, shares: 5 });

test("all reported stock corrections override incorrect and missing stored tickers", () => {
  const examples = [
    ["74624M102", "Everpure Inc", "P"],
    ["12510Q100", "CCC Intelligent Solutions", "CCC"],
    ["V7780T103", "Royal Caribbean Group", "RCL"],
    ["T19377109", "Bending Spoons SpA", "BSP"],
    ["780087102", "The Royal Bank of Canada", "RY"],
    ["817565104", "Service Corp.Intl.", "SCI"],
    ["07725L102", "BeOne Medicines Ltd", "ONC"],
    ["76243J105", "Rhythm Pharmaceuticals Inc", "RYTM"],
    ["98401F105", "Xencor Inc", "XNCR"],
    ["918385204", "vTv Therapeutics Inc", "VTVT"],
  ];
  for (const [cusip, name, expected] of examples) {
    assert.equal(stockTicker(h(cusip!, name!, "GYGY"), new Map()), expected);
    assert.equal(stockTicker(h(cusip!, name!, null), new Map()), expected);
  }
});

test("all reported ETF examples and warrant classes are excluded even with known tickers", () => {
  for (const name of ["ARK 21Shares Bitcoin ETF", "ARK Active Autocallable Income",
    "ISHARES TR", "VANGUARD INTL EQUITY INDEX F", "VANGUARD TAX-MANAGED FDS",
    "COLUMBIA ETF TR II", "SCHWAB STRATEGIC TR", "ACME WARRANTS",
    "ACME [NON-STOCK UNIT]", "ACME PREFERRED"]) {
    assert.equal(isNonStockPosition({ name, cusip: "TEST" }), true, name);
    assert.equal(stockTicker(h("TEST", name, "ARKB"), new Map([["TEST", { ticker: "ARKB", source: "override" }]])), null);
  }
  assert.equal(isNonStockPosition({ name: "BANK OF AMERICA", cusip: "060505153" }), true);
});

test("unverified legacy Yahoo matches and foreign listings cannot leak into stock links", () => {
  assert.equal(stockTicker(h("A", "Apple", "AAPL"), new Map()), null);
  assert.equal(stockTicker(h("A", "Apple", "AAPL"), new Map([["A", { ticker: "AAPL", source: "yahoo_search" }]])), null);
  assert.equal(stockTicker(h("A", "Apple", "AAPL"), new Map([["A", { ticker: "RCL.MX", source: "override" }]])), null);
  assert.equal(stockTicker(h("A", "Apple", null), verified), "AAPL");
});

test("matching a US exchange is insufficient when issuer names disagree", () => {
  const wrong = { symbol: "GYGY", exchange: "NCM", quoteType: "EQUITY", longName: "Game Your Game, Inc." };
  for (const issuer of ["Rhythm Pharmaceuticals", "Xencor Inc", "vTv Therapeutics"])
    assert.equal(selectVerifiedStock(issuer, [wrong]), null);
  assert.equal(selectVerifiedStock("Royal Caribbean Group", [{
    symbol: "RCL.MX", exchange: "MEX", quoteType: "EQUITY", longName: "Royal Caribbean Group",
  }]), null);
});

test("verified search handles SEC abbreviations, rejects ETF quotes and ambiguous classes", () => {
  const quote = { symbol: "SCI", exchange: "NYQ", quoteType: "EQUITY", longname: "Service Corporation International" };
  assert.equal(selectVerifiedStock("Service Corp Intl.", [quote]), "SCI");
  assert.equal(selectVerifiedStock("Apple Inc", [{ symbol: "AAPL", exchange: "NMS", quoteType: "ETF", longName: "Apple Inc" }]), null);
  assert.equal(selectVerifiedStock("Alphabet Inc", [
    { symbol: "GOOG", exchange: "NMS", quoteType: "EQUITY", shortname: "Alphabet Inc" },
    { symbol: "GOOGL", exchange: "NMS", quoteType: "EQUITY", shortname: "Alphabet Inc" },
  ]), null);
});

test("Miscellaneous combines ETFs, warrants, unresolved rows and pre-existing tail without losing value", () => {
  const input = [
    h("A", "Apple", "WRONG", 100), h("B", "Microsoft", null, 80),
    h("ETF", "ISHARES TR", "IWN", 30), h("W", "ACME WARRANTS", "ACME", 20),
    h("U", "Unknown company", "GYGY", 15), h("__MISC__", "Miscellaneous", null, 40),
  ];
  const before = structuredClone(input);
  const result = groupStockHoldings(input, verified);
  assert.deepEqual(input, before);
  assert.deepEqual(result.map(row => row.ticker), ["AAPL", "MSFT", null]);
  assert.equal(result.at(-1)!.name, "Miscellaneous");
  assert.equal(result.at(-1)!.marketValueThousands, 105);
  assert.equal(result.at(-1)!.shares, 0);
  assert.equal(result.reduce((n, row) => n + row.marketValueThousands, 0),
    input.reduce((n, row) => n + row.marketValueThousands, 0));
});

test("separate quarters can be grouped without mutating or merging their amounts", () => {
  const current = groupStockHoldings([h("A", "Apple", null, 100), h("E", "VANGUARD TR", "VT", 30)], verified);
  const prior = groupStockHoldings([h("A", "Apple", null, 70), h("X", "Unknown", null, 12)], verified);
  assert.equal(current.at(-1)!.marketValueThousands, 30);
  assert.equal(prior.at(-1)!.marketValueThousands, 12);
});
