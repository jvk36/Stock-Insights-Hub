import { test } from "node:test";
import assert from "node:assert/strict";
import { rankPositions } from "./position-ranking";
import type { ThirteenFSummaryPosition } from "@workspace/api-client-react";

const position = (patch: Partial<ThirteenFSummaryPosition>): ThirteenFSummaryPosition => ({
  securityKey: "CUSIP", ticker: "ABC", name: "Example", fundCik: "1",
  fundName: "Fund", fundSlug: "fund", marketValue: 100, priorMarketValue: 100,
  portfolioPct: 2, buyPct: 0, sellPct: 0, activity: "unchanged", ...patch,
});

test("sells ranks individual trims and full exits, not share reductions or aggregate ticker totals", () => {
  const rows = [
    position({ fundName: "Trim", sellPct: 4, activity: "decrease" }),
    position({ fundName: "Exit", sellPct: 8, marketValue: 0, activity: "sell" }),
    position({ fundName: "Other trim", sellPct: 3, activity: "decrease" }),
    position({ fundName: "Unknown", sellPct: null, activity: "unavailable" }),
    position({ fundName: "Buy", buyPct: 9, activity: "buy" }),
  ];
  assert.deepEqual(rankPositions(rows, "sells").map(p => p.fundName), ["Exit", "Trim", "Other trim"]);
  assert.equal(rows[0].fundName, "Trim", "does not mutate source order");
});

test("ranking ties are deterministic and unknown, zero or negative sales are excluded", () => {
  const rows = [
    position({ ticker: "ZZZ", sellPct: 2 }),
    position({ ticker: "AAA", fundName: "Z fund", sellPct: 2 }),
    position({ ticker: "AAA", fundName: "A fund", sellPct: 2 }),
    position({ ticker: "NEG", sellPct: -1 }),
    position({ ticker: "ZERO", sellPct: 0 }),
    position({ ticker: "NULL", sellPct: null }),
  ];
  assert.deepEqual(rankPositions(rows, "sells").map(p => `${p.ticker}:${p.fundName}`), ["AAA:A fund", "AAA:Z fund", "ZZZ:Fund"]);
});

test("existing buys and biggest bets retain their criteria", () => {
  const rows = [
    position({ ticker: "BUY", buyPct: 4, portfolioPct: 3, activity: "increase" }),
    position({ ticker: "HOLD", portfolioPct: 9 }),
    position({ ticker: "EXIT", sellPct: 8, marketValue: 0, activity: "sell" }),
  ];
  assert.deepEqual(rankPositions(rows, "buys").map(p => p.ticker), ["BUY"]);
  assert.deepEqual(rankPositions(rows, "bets").map(p => p.ticker), ["HOLD", "BUY"]);
});
