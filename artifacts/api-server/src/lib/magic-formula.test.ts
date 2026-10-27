import test from "node:test";
import assert from "node:assert/strict";
import { candidateFromInputs, magicFinancialDate } from "./magic-formula-data";
import { advanceMagic, initialMagicState, rankMagicCandidates, cohortDate, rankingYear, type MagicState } from "./magic-formula-engine";
import type { MagicFormulaRanking } from "@workspace/api-zod";
import type { MomentumMarket } from "./momentum-engine";

const stock = (symbol = "AAA", sector = "Industrials") => ({ symbol, name: symbol, sector });
const inputs = { ebit: 100, ev: 1000, netPpe: 200, currentAssets: 150, currentLiabilities: 50, rate: 1, financialDate: "2026-06-30" };
function ranking(year = 2026, prefix = "A"): MagicFormulaRanking {
  return { year, scheduledDate: `${year}-10-27`, capturedAt: `${year}-10-27T14:00:00Z`, availableOn: `${year}-10-27`, universeCount: 503,
    candidates: Array.from({ length: 20 }, (_, i) => ({ ...candidateFromInputs(stock(`${prefix}${String(i + 1).padStart(2, "0")}`), inputs), rank: i + 1 })) };
}
function market(dates: string[], rankings = [ranking()]): MomentumMarket {
  const tickers = ["SPY", ...rankings.flatMap((r) => r.candidates.map((c) => c.ticker))];
  return { observedAt: `${dates.at(-1)}T22:00:00Z`, targetDate: dates.at(-1)!, prices: Object.fromEntries(tickers.map((t) => [t, Object.fromEntries(dates.map((d) => [d, 10]))])),
    opens: Object.fromEntries(tickers.map((t) => [t, Object.fromEntries(dates.map((d) => [d, 10]))])),
    actions: [], adjusted: {}, live: {} };
}
function state() { const s = initialMagicState(); s.rankings = [ranking()]; return s; }
const sumCash = (s: MagicState) => s.ledger.reduce((n, e) => n + e.cashChange, 0);

test("standard ROC uses EBIT over working capital plus net PP&E, without double depreciation", () => {
  const c = candidateFromInputs(stock(), inputs);
  assert.equal(c.earningsYield, 0.1);
  assert.equal(c.returnOnCapital, 1 / 3);
  assert.equal(c.workingCapital, 100);
  assert.equal(c.netPpe, 200);
});
test("TTM Unix timestamps and quarterly Date objects preserve the accounting date", () => {
  assert.equal(magicFinancialDate({ date: 1782777600 }), "2026-06-30");
  assert.equal(magicFinancialDate({ date: new Date("2026-06-30T00:00:00Z") }), "2026-06-30");
  assert.equal(magicFinancialDate({ asOfDate: "2026-06-30" }), "2026-06-30");
});
test("reporting currency is normalized consistently and missing FX cannot rank", () => {
  const c = candidateFromInputs(stock(), { ...inputs, rate: 0.01 });
  assert.equal(c.ebit, 1); assert.equal(c.enterpriseValue, 10);
  assert.equal(c.earningsYield, 0.1); assert.equal(c.returnOnCapital, 1 / 3);
  assert.ok(candidateFromInputs(stock(), { ...inputs, rate: null }).reason);
});
test("unavailable/nonpositive inputs are excluded, while valid negative working capital is allowed", () => {
  for (const patch of [{ ebit: 0 }, { ev: -1 }, { netPpe: null }, { currentAssets: null }, { currentLiabilities: 400 }]) {
    assert.ok(candidateFromInputs(stock(), { ...inputs, ...patch }).reason);
  }
  assert.equal(candidateFromInputs(stock(), { ...inputs, currentLiabilities: 200 }).returnOnCapital, 2 / 3);
  assert.ok(candidateFromInputs(stock("BANK", "Financials"), inputs).reason);
  assert.ok(candidateFromInputs(stock("POWER", "Utilities"), inputs).reason);
});
test("ranks descend on each ratio, sum ranks, resolve ties by ticker and leave exclusions unranked", () => {
  const a = candidateFromInputs(stock("AAA"), inputs), b = candidateFromInputs(stock("BBB"), { ...inputs, ev: 500, netPpe: 500 });
  const excluded = candidateFromInputs(stock("BAD"));
  const ranked = rankMagicCandidates([b, excluded, a]);
  assert.deepEqual(ranked.map((c) => [c.ticker, c.earningsRank, c.capitalRank, c.score, c.rank]), [
    ["AAA", 2, 1, 3, 1], ["BBB", 1, 2, 3, 2], ["BAD", null, null, null, null],
  ]);
  assert.equal(a.rank, null); // input annual snapshot is not mutated
  const tied = rankMagicCandidates([a, candidateFromInputs(stock("CCC"), inputs), b]);
  assert.equal(tied.find((c) => c.ticker === "AAA")!.capitalRank, tied.find((c) => c.ticker === "CCC")!.capitalRank);
});
test("four scheduled groups use the requested dates and October ranking year", () => {
  assert.deepEqual([0, 1, 2, 3].map((i) => cohortDate(i)), ["2026-10-27", "2027-01-27", "2027-04-27", "2027-07-27"]);
  assert.equal(rankingYear("2027-01-27"), 2026);
  assert.equal(rankingYear("2027-10-27"), 2027);
});
test("initial group buys only five stocks and preserves $22,500 reserved cash in performance", () => {
  const s = advanceMagic(state(), market(["2026-10-27"]));
  assert.equal(s.positions.length, 5); assert.equal(s.cash, 22500); assert.equal(s.reservedCash, 22500);
  assert.ok(s.positions.every((p) => p.costBasis === 1500 && p.shares === 150));
  assert.equal(s.performance.at(-1)!.value, 30000); assert.equal(sumCash(s), s.cash);
});
test("four groups use successive frozen blocks and never rebalance older groups quarterly", () => {
  const s = advanceMagic(state(), market(["2026-10-27", "2027-01-27", "2027-04-27", "2027-07-27"]));
  assert.equal(s.positions.length, 20); assert.equal(s.cash, 0); assert.equal(s.reservedCash, 0);
  assert.equal(s.ledger.filter((e) => e.type === "sell").length, 0);
  assert.deepEqual(s.cohorts[1].tickers, ["A06", "A07", "A08", "A09", "A10"]);
  assert.deepEqual(s.cohorts[3].tickers, ["A16", "A17", "A18", "A19", "A20"]);
  assert.equal(sumCash(s), s.cash);
});
test("annual replacement sells only the mature group and adds dividends without spending reserved cash", () => {
  let s = advanceMagic(state(), market(["2026-10-27"]));
  s.rankings.push(ranking(2027, "B"));
  const m = market(["2027-10-27"], s.rankings);
  // Isolate cohort 1 maturity while untouched future groups retain their reserve.
  s.cohorts.slice(1).forEach((c) => { c.nextDate = "2028-01-27"; });
  m.actions.push({ ticker: "A01", type: "dividend", date: "2027-10-26", value: 1 });
  const previousReserve = s.reservedCash;
  s = advanceMagic(s, m);
  assert.equal(s.ledger.filter((e) => e.type === "sell").length, 5);
  assert.ok(s.positions.every((p) => p.cohort === 1 && p.ticker.startsWith("B")));
  assert.equal(s.positions.reduce((n, p) => n + p.costBasis, 0), 7650);
  assert.equal(s.cash, previousReserve); assert.equal(s.dividendCash, 0);
  assert.equal(sumCash(s), s.cash);
});
test("one-year anniversaries fall on next actual trading session, not earlier sessions", () => {
  let s = advanceMagic(state(), market(["2026-10-27"]));
  s.rankings.push(ranking(2027));
  s.cohorts.slice(1).forEach((c) => { c.nextDate = "2028-01-27"; });
  s = advanceMagic(s, market(["2027-10-26", "2027-10-28"], s.rankings));
  assert.equal(s.cohorts[0].lastTradeDate, "2027-10-28");
  assert.equal(s.cohorts[0].nextDate, "2028-10-28");
  assert.ok(s.ledger.filter((e) => e.type === "sell").every((e) => e.date === "2027-10-28"));
});
test("a late snapshot cannot be used to execute earlier purchases", () => {
  const s = state(); s.rankings[0].availableOn = "2026-10-28";
  const pending = advanceMagic(s, market(["2026-10-27"]));
  assert.equal(pending.ledger.length, 0);
  const executed = advanceMagic(pending, market(["2026-10-28"]));
  assert.equal(executed.cohorts[0].lastTradeDate, "2026-10-28");
});
test("same-day opening prices fund inception while live quotes only mark current value", () => {
  const m = market(["2026-10-26"]);
  m.observedAt = "2026-10-27T15:00:00Z";
  m.live = Object.fromEntries(["SPY", ...ranking().candidates.map((c) => c.ticker)].map((t) => [t, { price: 20, at: "2026-10-27T14:59:00Z" }]));
  m.opens = Object.fromEntries(Object.keys(m.live).map((t) => [t, { "2026-10-27": 15 }]));
  const s = advanceMagic(state(), m);
  assert.equal(s.positions[0].entryPrice, 15);
  assert.equal(s.positions[0].entryDate, "2026-10-27");
  assert.equal(s.positions[0].shares, 100);
  assert.equal(s.performance.at(-1)!.value, 32500);
});
test("initial opening prices win over completed closes and unavailable opens never use quotes", () => {
  const m = market(["2026-10-27"]);
  for (const prices of Object.values(m.opens!)) prices["2026-10-27"] = 8;
  const s = advanceMagic(state(), m);
  assert.deepEqual(s.positions.map((p) => p.rank), [1, 2, 3, 4, 5]);
  assert.ok(s.positions.every((p) => p.entryPrice === 8 && p.shares === 187.5));
  assert.equal(s.performance.at(-1)!.value, 31875);
  delete m.opens!.A01["2026-10-27"];
  const pending = advanceMagic(state(), m);
  assert.equal(pending.positions.length, 0);
  assert.equal(pending.cash, 30000);
  assert.match(pending.message!, /session opening prices/);
});
test("legacy inception entries, ledger and performance are corrected once to opening prices", () => {
  const legacy = advanceMagic(state(), market(["2026-10-27"]));
  delete legacy.inceptionPriceBasis;
  const m = market(["2026-10-27"]);
  for (const prices of Object.values(m.opens!)) prices["2026-10-27"] = 8;
  const corrected = advanceMagic(legacy, m);
  assert.ok(corrected.positions.every((p) => p.entryPrice === 8 && p.shares === 187.5));
  assert.ok(corrected.ledger.filter((e) => e.type === "buy").every((e) => e.price === 8 && e.shares === 187.5));
  assert.equal(corrected.ledger.length, 6);
  assert.equal(corrected.cash, 22500);
  assert.equal(sumCash(corrected), corrected.cash);
  assert.equal(corrected.performance.at(-1)!.value, 31875);
  assert.deepEqual(advanceMagic(corrected, m), corrected);
});
test("verified opens establish today's session even if the calendar quote is missing", () => {
  const m = market(["2026-10-26"]);
  m.observedAt = "2026-10-27T15:00:00Z";
  m.opens = Object.fromEntries(["SPY", ...ranking().candidates.map((c) => c.ticker)].map((t) => [t, { "2026-10-27": 15 }]));
  m.live = Object.fromEntries(ranking().candidates.map((c) => [c.ticker, { price: 20, at: "2026-10-27T14:59:00Z" }]));
  const s = advanceMagic(state(), m);
  assert.equal(s.positions.length, 5);
  assert.equal(s.positions[0].entryPrice, 15);
  assert.equal(s.performance.at(-1)!.date, "2026-10-27");
});
test("legacy correction waits for all opens and does not rewrite later transaction history", () => {
  const legacy = advanceMagic(state(), market(["2026-10-27"]));
  delete legacy.inceptionPriceBasis;
  const m = market(["2026-10-27"]);
  delete m.opens!.A01["2026-10-27"];
  const pending = advanceMagic(legacy, m);
  assert.deepEqual(pending.positions, legacy.positions);
  assert.deepEqual(pending.ledger, legacy.ledger);
  assert.match(pending.message!, /Awaiting verified inception opening prices/);
  legacy.processedThrough = "2026-10-28";
  const later = advanceMagic(legacy, m);
  assert.deepEqual(later.ledger, legacy.ledger);
  assert.match(later.message!, /existing history is preserved/);
});
test("refresh/replay is idempotent and split-adjusted dividend cash is counted once", () => {
  let s = advanceMagic(state(), market(["2026-10-27"]));
  const m = market(["2026-10-28"]);
  m.actions = [{ ticker: "A01", type: "split", date: "2026-10-28", value: 2 }, { ticker: "A01", type: "dividend", date: "2026-10-28", value: 1 }];
  s = advanceMagic(s, m);
  assert.equal(s.positions[0].shares, 300); assert.equal(s.positions[0].entryPrice, 5);
  assert.equal(s.dividendCash, 300);
  const replay = advanceMagic(s, m);
  assert.deepEqual(replay, s); assert.equal(sumCash(s), s.cash);
});
test("unpriced selections cause no partial liquidation or replacement", () => {
  let s = advanceMagic(state(), market(["2026-10-27"]));
  s.rankings.push(ranking(2027, "B"));
  s.cohorts.slice(1).forEach((c) => { c.nextDate = "2028-01-27"; });
  const m = market(["2027-10-27"], s.rankings);
  delete m.prices.B01["2027-10-27"];
  const next = advanceMagic(s, m);
  assert.deepEqual(next.positions, s.positions);
  assert.equal(next.ledger.length, s.ledger.length);
  assert.match(next.message!, /verified execution prices/);
});
test("unsupported actions fail without partial dividend accounting that could replay twice", () => {
  const s = advanceMagic(state(), market(["2026-10-27"]));
  const m = market(["2026-10-28"]);
  m.actions = [{ ticker: "A01", type: "dividend", date: "2026-10-28", value: 1 }, { ticker: "A02", type: "split", date: "2026-10-28", value: 1.046 }];
  const next = advanceMagic(s, m);
  assert.equal(next.processedThrough, s.processedThrough);
  assert.equal(next.ledger.length, s.ledger.length);
  assert.equal(next.cash, s.cash);
});
