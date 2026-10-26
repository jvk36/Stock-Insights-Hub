import assert from "node:assert/strict";
import test from "node:test";
import { UNIVERSE, initialModelState, rankCandidates, allocate, advanceModel, anniversary, applyActions } from "./model-portfolio-engine";
import { normalizeBookInputs, undoFutureSplits, completedThrough, confirmedNoCoverage } from "./model-portfolio-market";
import { createRequirePremium } from "./premium-middleware";
import { parsePershingSquareNav } from "./pershing-square-nav";

const day = "2026-10-26";
const candidates = (date = day) => UNIVERSE.map((business, i) => ({
  ...business, price: i === 0 ? 800_000 : 10 * (i + 1), bookValue: 100,
  priceToBook: 0.5 + i * 0.1, priceDate: date, bookDate: "2026-06-30",
  observedAt: `${date}T21:00:00Z`, status: "eligible" as const, reason: null, rank: null, selected: false,
}));
const priceMap = (cs = candidates()) => Object.fromEntries(cs.map((c) => [c.ticker, c.price]));
const input = (date = day) => ({
  candidates: candidates(date), targetDate: date, observedAt: `${date}T21:00:00Z`,
  actions: [], prices: Object.fromEntries(candidates(date).map((c) => [c.ticker, { [date]: c.price }])),
});

test("eight exact identities excluding IAC and stable positive P/B ranking", () => {
  assert.deepEqual(UNIVERSE.map((b) => b.ticker), ["BRK.A", "MKL", "FRFHF", "JEF", "L", "HHH", "PSUS", "BOC"]);
  const cs = candidates();
  cs[1].priceToBook = cs[0].priceToBook;
  cs[2] = { ...cs[2], priceToBook: -1 };
  const sorted = rankCandidates(cs);
  assert.deepEqual(sorted.filter((c) => c.selected).map((c) => c.ticker), ["BRK.A", "MKL", "JEF"]);
  assert.equal(sorted.find((c) => c.ticker === "FRFHF")!.rank, null);
});

test("initial capital: three exact $10,000 costs and fractional BRK.A, no recreation", () => {
  const first = advanceModel(initialModelState(day), input());
  assert.equal(first.state.positions.length, 3);
  assert.equal(first.state.positions[0].shares, 0.0125);
  assert.ok(first.state.positions.every((p) => p.costBasis === 10_000));
  assert.equal(first.state.cash, 0);
  assert.equal(first.snapshots[0].value, 30_000);
  assert.equal(first.state.nextRebalanceDate, "2027-10-26");
  assert.equal(advanceModel(first.state, input()).events.length, 0);
});

test("requested inception uses October 26 opens for both ranking and execution before the close", () => {
  const state = { ...initialModelState(day), inceptionPriceBasis: "open" as const };
  const prices: Record<string, number> = { ...priceMap(), BOC: 1, PSUS: 2, JEF: 3 };
  const opening = { date: day, prices, candidates: candidates().map((c) => ({
    ...c, price: prices[c.ticker], priceToBook: prices[c.ticker] / c.bookValue,
  })) };
  const first = advanceModel(state, { ...input("2026-10-23"), opening });
  assert.equal(first.state.inceptionDate, day);
  assert.deepEqual(first.state.positions.map((p) => p.ticker), ["BOC", "PSUS", "JEF"]);
  assert.deepEqual(first.state.positions.map((p) => p.entryPrice), [1, 2, 3]);
  assert.ok(first.state.positions.every((p) => p.costBasis === 10_000));
  assert.equal(first.snapshots[0].priceBasis, "open");
  assert.equal(first.snapshots[0].value, 30_000);
  assert.equal(first.state.nextRebalanceDate, "2027-10-26");
  assert.equal(advanceModel(first.state, { ...input("2026-10-23"), opening }).events.length, 0);

  const close = input(day);
  for (const ticker of Object.keys(prices)) close.prices[ticker][day] = prices[ticker] * 1.1;
  close.actions = [{ ticker: "BOC", date: day, type: "dividend", value: 10 }] as never;
  const valued = advanceModel(first.state, close);
  assert.ok(Math.abs(valued.snapshots[0].value - 33_000) < 1e-8);
  assert.equal(valued.snapshots[0].priceBasis, "close");
  assert.equal(valued.state.processedDate, day);
  assert.equal(valued.state.cash, 0); // bought on the ex-date: no dividend entitlement
  assert.equal(valued.events.length, 0);
});

test("opening-price policy never substitutes a closing price or different date", () => {
  const state = { ...initialModelState(day), inceptionPriceBasis: "open" as const };
  assert.equal(advanceModel(state, input(day)).state.inceptionDate, null);
  const wrong = { ...input(day), opening: { date: "2026-10-23", prices: priceMap(), candidates: candidates() } };
  assert.equal(advanceModel(state, wrong).events.length, 0);
  const missing = { date: day, prices: priceMap(), candidates: candidates() };
  missing.candidates[7].status = "temporary_error" as never;
  assert.equal(advanceModel(state, { ...input(day), opening: missing }).events.length, 0);
});

test("official PSUS parser extracts USD NAV, not market price, with verified source date", () => {
  const html = `<div class="current-nav-update--block"><ul>
    <li><strong>PSUS</strong> Exchange Symbol</li><li><strong>$49.91</strong> NAV/Share</li>
    <li><strong>$37.03</strong> NYSE Px/Share</li></ul><p><small>as of 10/20/2026</small></p></div>`;
  assert.deepEqual(parsePershingSquareNav(html, day), {
    value: 49.91, date: "2026-10-20", source: "https://www.pershingsquareusa.com/",
  });
  assert.throws(() => parsePershingSquareNav(html.replace("$49.91", "$0"), day));
  assert.throws(() => parsePershingSquareNav(html.replace("10/20/2026", "10/27/2026"), day));
  assert.throws(() => parsePershingSquareNav(html.replace("10/20/2026", "09/20/2026"), day));
  assert.throws(() => parsePershingSquareNav(html.replace("PSUS", "PSH"), day));
});

test("annual equal-weight rebalance compounds current equity, no new deposits", () => {
  const original = advanceModel(initialModelState(day), input()).state;
  const prices = priceMap();
  for (const ticker of Object.keys(prices)) prices[ticker] *= 2;
  const next = allocate(original, candidates("2027-10-26"), "2027-10-26", prices);
  assert.equal(next.state.positions.reduce((sum, p) => sum + p.costBasis, 0), 60_000);
  assert.ok(next.state.positions.every((p) => p.costBasis === 20_000));
  assert.equal(next.state.inceptionDate, day);
  assert.equal(next.state.nextRebalanceDate, "2028-10-26");
  const ledger = next.events.filter((event) => "cashChange" in event);
  assert.ok(Math.abs(ledger.reduce((sum, event) => sum + event.cashChange, 0)) < 1e-8);
  assert.ok(next.events.filter((event) => event.type === "buy").length === 3);
});

test("material data gaps defer allocation, but known absent book stays visible", () => {
  const bad = input();
  bad.candidates[7] = { ...bad.candidates[7], status: "temporary_error" as never };
  const blocked = advanceModel(initialModelState(day), bad);
  assert.equal(blocked.state.inceptionDate, null);
  assert.equal(blocked.events.length, 0);
  const unavailable = input();
  unavailable.candidates[6] = { ...unavailable.candidates[6], status: "unavailable" as never, priceToBook: null as never };
  assert.equal(advanceModel(initialModelState(day), unavailable).state.positions.length, 3);
});

test("no prelaunch backtest or trade with unmatched closing dates", () => {
  assert.equal(advanceModel(initialModelState("2026-10-27"), input()).state.inceptionDate, null);
  const stale = input(); stale.candidates[0].priceDate = "2026-10-23";
  assert.equal(advanceModel(initialModelState(day), stale).events.length, 0);
});

test("dividend cash and split-adjusted shares preserve cost and total equity", () => {
  const state = advanceModel(initialModelState(day), input()).state;
  const old = state.positions[0];
  const changed = applyActions(state, [
    { ticker: old.ticker, date: "2026-10-27", type: "split", value: 2 },
    { ticker: old.ticker, date: "2026-10-27", type: "dividend", value: 10 },
  ], "2026-10-27");
  assert.equal(changed.state.positions[0].shares, old.shares * 2);
  assert.equal(changed.state.positions[0].entryPrice, old.entryPrice / 2);
  assert.equal(changed.state.positions[0].costBasis, 10_000);
  assert.equal(changed.state.cash, old.shares * 2 * 10);
  assert.equal(state.cash, 0);
  assert.equal(undoFutureSplits(50, day, [{ ticker: "BRK.A", date: "2026-10-27", type: "split", value: 2 }]), 100);
});

test("daily performance includes dividends exactly once, persists after reload", () => {
  const state = advanceModel(initialModelState(day), input()).state;
  const update = input("2026-10-27");
  const holding = state.positions[0];
  update.actions = [{ ticker: holding.ticker, date: "2026-10-27", type: "dividend", value: 100 }] as never;
  const next = advanceModel(JSON.parse(JSON.stringify(state)), update);
  const dividend = holding.shares * 100;
  assert.equal(next.snapshots[0].value, 30_000 + dividend);
  assert.equal(next.snapshots[0].returnPercent, ((30_000 + dividend) / 30_000 - 1) * 100);
  assert.equal(advanceModel(next.state, update).events.length, 0);
});

test("missing held price preserves prior valuation and defers actions", () => {
  const state = advanceModel(initialModelState(day), input()).state;
  const bad = input("2026-10-27");
  delete bad.prices["BRK.A"]["2026-10-27"];
  const next = advanceModel(state, bad);
  assert.equal(next.state.processedDate, day);
  assert.equal(next.snapshots.length, 0);
  assert.equal(next.state.positions[0].shares, state.positions[0].shares);
  assert.ok(next.state.message?.includes("missing"));
});

test("a permanent historical gap cannot block later valuations, actions or annual rebalance", () => {
  const original = advanceModel(initialModelState(day), input()).state;
  const gap = input("2026-10-27");
  delete gap.prices["BRK.A"]["2026-10-27"];
  gap.actions = [
    { ticker: "BRK.A", date: "2026-10-27", type: "split", value: 2 },
    { ticker: "BRK.A", date: "2026-10-27", type: "dividend", value: 10 },
  ] as never;
  const paused = advanceModel(original, gap);
  assert.equal(paused.state.processedDate, day);
  assert.equal(paused.events.length, 0);
  const following = input("2026-10-28");
  following.actions = gap.actions;
  following.prices["BRK.A"]["2026-10-28"] /= 2;
  for (const [ticker, series] of Object.entries(gap.prices)) Object.assign(following.prices[ticker], series);
  const recovered = advanceModel(JSON.parse(JSON.stringify(paused.state)), following);
  assert.equal(recovered.state.processedDate, "2026-10-28");
  assert.deepEqual(recovered.state.valuationGaps, ["2026-10-27"]);
  assert.deepEqual(recovered.snapshots.map((snapshot) => snapshot.date), ["2026-10-28"]);
  assert.equal(recovered.snapshots[0].value, 30_000.25);
  assert.equal(recovered.state.positions[0].shares, 0.025);
  assert.equal(recovered.state.cash, 0.25);
  assert.deepEqual(recovered.events.map((event) => event.type), ["split", "dividend"]);
  assert.equal(advanceModel(recovered.state, following).events.length, 0);
  const annual = input("2027-10-26");
  annual.prices["BRK.A"]["2027-10-26"] /= 2;
  const rebalanced = advanceModel(recovered.state, annual);
  assert.equal(rebalanced.state.lastRebalanceDate, "2027-10-26");
  assert.equal(rebalanced.state.nextRebalanceDate, "2028-10-26");
  assert.equal(rebalanced.events.filter((event) => event.type === "rebalance").length, 1);
  assert.ok(Math.abs(rebalanced.state.positions[0].costBasis - 30_000.25 / 3) < 1e-8);
});

test("missed annual date executes on available session without invented old P/B", () => {
  const state = advanceModel(initialModelState(day), input()).state;
  const caughtUp = advanceModel(state, input("2027-10-28"));
  const rebalance = caughtUp.events.find((event) => event.type === "rebalance");
  assert.equal(rebalance?.date, "2027-10-28");
  assert.equal(rebalance && "scheduledDate" in rebalance ? rebalance.scheduledDate : null, "2027-10-26");
  assert.equal(caughtUp.state.nextRebalanceDate, "2028-10-26");
});

test("FX normalization and class mismatch detection prevent inflated P/B", () => {
  const normalized = normalizeBookInputs({ close: 20, livePrice: 20, book: 1_000, reportedPb: 2, priceRate: 1, bookRate: 0.01 });
  assert.equal(normalized.book, 10);
  assert.equal(normalized.pb, 2);
  assert.equal(normalizeBookInputs({ close: 800_000, livePrice: 800_000, book: 350, reportedPb: 1.5, priceRate: 1, bookRate: 1 }).pb, null);
  assert.equal(normalizeBookInputs({ close: 20, livePrice: 20, book: 100, reportedPb: 2, priceRate: 1, bookRate: null }).pb, null);
});

test("calendar anniversaries and completed-session timing", () => {
  assert.equal(anniversary("2024-02-29", "2024-03-01"), "2025-02-28");
  assert.equal(completedThrough(new Date("2026-10-26T19:59:00Z")), "2026-10-25");
  assert.equal(completedThrough(new Date("2026-10-26T20:21:00Z")), "2026-10-26");
});

test("one failed upstream request cannot silently exclude a potentially eligible business", () => {
  assert.equal(confirmedNoCoverage([new Error("Quote not found for symbol: IAC")]), false);
  assert.equal(confirmedNoCoverage([new Error("Quote not found"), new Error("Network timeout")]), false);
  assert.equal(confirmedNoCoverage([new Error("Quote not found"), new Error("No data found, symbol may be delisted")]), true);
});

test("Premium middleware permits paid/admin and denies free/signed out", async () => {
  for (const [membership, expected] of [
    [null, 401],
    [{ role: "free", subscriptionStatus: null, currentPeriodEnd: null, deletionStartedAt: null }, 403],
    [{ role: "paid", subscriptionStatus: "active", currentPeriodEnd: new Date("2999-01-01"), deletionStartedAt: null }, 200],
    [{ role: "admin", subscriptionStatus: null, currentPeriodEnd: null, deletionStartedAt: null }, 200],
  ] as const) {
    let status = 200; let authorized = false;
    const response = { locals: {}, status(code: number) { status = code; return this; }, json() { return this; } };
    await createRequirePremium(async () => membership)({ log: { error() {} } } as never, response as never, () => { authorized = true; });
    assert.equal(status, expected);
    assert.equal(authorized, expected === 200);
  }
});
