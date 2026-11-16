import assert from "node:assert/strict";
import { dedupeSuggestions, rankSuggestions, tickerPath, normalizeTicker } from "./ticker-search.ts";

const all = dedupeSuggestions([
  [{ symbol: "AAPL", name: "Apple Inc.", sector: "Tech" }, { symbol: "A", name: "Agilent", sector: "Health" }],
  undefined,
  [{ symbol: "aapl", name: "Apple dup", sector: "x" }, { symbol: "MSFT", name: "Microsoft", sector: "Tech" }, { symbol: "PAA", name: "Plains All American", sector: "Energy" }],
]);
assert.equal(all.length, 4);
assert.equal(all.find((s) => s.symbol === "AAPL").name, "Apple Inc.");
assert.deepEqual(rankSuggestions(all, "a").map((s) => s.symbol).slice(0, 2), ["A", "AAPL"]);
assert.equal(rankSuggestions(all, "micro")[0].symbol, "MSFT");
assert.equal(rankSuggestions(all, "american")[0].symbol, "PAA");
assert.deepEqual(rankSuggestions(all, "  "), []);
assert.equal(normalizeTicker("  brk.b "), "BRK.B");
assert.equal(tickerPath(" brk/b "), "/stock/BRK%2FB");
assert.equal(tickerPath("   "), null);
console.log("ticker-search tests passed");
