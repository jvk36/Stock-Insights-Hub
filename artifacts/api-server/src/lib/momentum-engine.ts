import type { MomentumCandidate, MomentumHolding, BlindTrustPerformance } from "@workspace/api-zod";
import type { Action, Prices, EngineEvent } from "./model-portfolio-engine";
import { portfolioLivePrices } from "./portfolio-live-prices";

export const MOMENTUM_INCEPTION = "2026-10-26";
export const MOMENTUM_CAPITAL = 30_000;
export const ETF_UNIVERSE = [
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF", assetClass: "Domestic equity" },
  { ticker: "VEU", name: "Vanguard FTSE All-World ex-US ETF", assetClass: "Foreign equity (developed + emerging)" },
  { ticker: "VWO", name: "Vanguard FTSE Emerging Markets ETF", assetClass: "Emerging markets equity" },
  { ticker: "VNQ", name: "Vanguard Real Estate ETF", assetClass: "US REITs" },
  { ticker: "TLT", name: "iShares 20+ Year Treasury Bond ETF", assetClass: "Long-term US Treasuries" },
  { ticker: "TIP", name: "iShares TIPS Bond ETF", assetClass: "Inflation-protected US Treasuries" },
] as const;
type Position = Pick<MomentumHolding, "ticker" | "name" | "entryDate" | "entryPrice" | "entrySma" | "shares" | "costBasis">;
export type MomentumState = {
  version: 1; launchDate: string; inceptionDate: string | null; inceptionAt: string | null;
  nextRebalanceDate: string | null; lastRebalanceDate: string | null; processedDate: string | null;
  positions: Position[]; cash: number; candidates: MomentumCandidate[];
  refreshedAt: string | null; message: string | null; valuationGaps: string[];
  liveValuationVersion?: 1;
};
export type MomentumMarket = {
  observedAt: string; targetDate: string; prices: Prices; adjusted: Prices; actions: Action[];
  opens?: Prices;
  live: Record<string, { price: number; at: string }>;
};
export type MomentumSnapshot = BlindTrustPerformance & {
  prices: Record<string, number>; priceBasis: "quote" | "close"; valuedAt: string;
};
export function initialMomentum(): MomentumState {
  return {
    version: 1, launchDate: MOMENTUM_INCEPTION, inceptionDate: null, inceptionAt: null,
    nextRebalanceDate: null, lastRebalanceDate: null, processedDate: null,
    positions: [], cash: MOMENTUM_CAPITAL, candidates: [], refreshedAt: null,
    message: "Awaiting today's verified quotes and 200 completed trading sessions for all six ETFs.", valuationGaps: [],
  };
}

// Always anchor to the original calendar day; Jan 31 -> Apr 30 -> Jul 31.
export function nextQuarter(inception: string, after: string): string {
  const origin = new Date(`${inception}T12:00:00Z`);
  for (let n = 1; n < 2000; n++) {
    const first = new Date(Date.UTC(origin.getUTCFullYear(), origin.getUTCMonth() + n * 3, 1));
    const max = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(origin.getUTCDate(), max));
    const date = first.toISOString().slice(0, 10);
    if (date > after) return date;
  }
  throw new Error("Quarterly schedule exceeds supported horizon");
}

export function momentumSignals(market: MomentumMarket, date: string, live = false): MomentumCandidate[] {
  // A common session calendar catches a missing bar in any one ETF, rather
  // than silently replacing it with an older 201st observation.
  const sessions = [...new Set(Object.values(market.adjusted).flatMap((series) => Object.keys(series)))]
    .filter((d) => live ? d < date : d <= date).sort().slice(-200);
  return ETF_UNIVERSE.map((etf) => {
    const quote = live ? market.live[etf.ticker] : null;
    const price = live ? quote?.price : market.prices[etf.ticker]?.[date];
    const splitFactor = market.actions.filter((a) => a.ticker === etf.ticker && a.type === "split" && a.date > date)
      .reduce((factor, a) => factor * a.value, 1);
    const values = sessions.map((d) => market.adjusted[etf.ticker]?.[d]);
    const valid = values.filter((v) => Number.isFinite(v) && v > 0);
    const sma200 = sessions.length === 200 && valid.length === 200
      ? valid.reduce((sum, value) => sum + value, 0) / 200 * splitFactor : null;
    const priceAt = live ? quote?.at ?? null : price ? date : null;
    const freshQuote = !live || Boolean(quote && quote.at.slice(0, 10) === date &&
      Date.parse(market.observedAt) - Date.parse(quote.at) >= -60_000 &&
      Date.parse(market.observedAt) - Date.parse(quote.at) <= 60 * 60_000);
    const ready = sma200 != null && Number.isFinite(price) && price! > 0 && freshQuote;
    return {
      ...etf, price: Number.isFinite(price) && price! > 0 ? price! : null, priceDate: priceAt,
      sma200, smaDate: sessions.at(-1) ?? null, sessions: valid.length,
      aboveSma: ready && price! > sma200!, distancePercent: ready ? (price! / sma200! - 1) * 100 : null,
      status: ready ? "ready" : "temporary_error",
      reason: ready ? null : sma200 == null ? "Need 200 matching completed-session closes; no missing bars are estimated."
        : "A verified, current USD execution price is unavailable.",
    };
  });
}

function allocate(state: MomentumState, candidates: MomentumCandidate[], date: string, prices: Record<string, number>) {
  if (candidates.length !== 6 || candidates.some((c) => c.status !== "ready")) throw new Error("Incomplete ETF signals");
  const selected = candidates.filter((c) => c.aboveSma);
  const equity = state.cash + state.positions.reduce((sum, p) => sum + p.shares * prices[p.ticker], 0);
  if (!Number.isFinite(equity) || equity <= 0) throw new Error("Cannot allocate invalid equity");
  const scheduledDate = state.nextRebalanceDate ?? date;
  const id = `momentum:allocation:${scheduledDate}`;
  const events: EngineEvent[] = state.positions.map((p) => ({
    id: `${id}:sell:${p.ticker}`, date, type: "sell", ticker: p.ticker, shares: p.shares,
    price: prices[p.ticker], cashChange: p.shares * prices[p.ticker],
  }));
  const amount = selected.length ? equity / selected.length : 0;
  const positions = selected.map((c): Position => {
    const price = prices[c.ticker];
    if (!Number.isFinite(price) || price <= 0) throw new Error("Missing ETF execution price");
    const shares = amount / price;
    events.push({ id: `${id}:buy:${c.ticker}`, date, type: "buy", ticker: c.ticker, shares, price, cashChange: -amount });
    return { ticker: c.ticker, name: c.name, entryDate: date, entryPrice: price, entrySma: c.sma200!, shares, costBasis: amount };
  });
  events.push({
    id, date, scheduledDate, type: state.inceptionDate ? "rebalance" : "inception",
    equity, amountPerPosition: amount, tickers: positions.map((p) => p.ticker),
    note: !selected.length ? "No ETF was strictly above its 200-day SMA; all equity is held as non-interest-bearing cash."
      : scheduledDate < date ? "Executed at the next complete trading session after the scheduled date." : null,
  });
  const next: MomentumState = {
    ...state, positions, cash: selected.length ? 0 : equity, inceptionDate: state.inceptionDate ?? date,
    lastRebalanceDate: date, nextRebalanceDate: nextQuarter(state.inceptionDate ?? date, date), message: null,
  };
  return { state: next, events };
}

// Accept only a contemporaneously captured, complete inception observation.
// Persist this observation with the allocation so publishing after launch day
// cannot change its execution prices or backfill a fictional later inception.
export function capturedMomentumInception(candidates: MomentumCandidate[], observedAt: string) {
  if (candidates.length !== ETF_UNIVERSE.length ||
      new Set(candidates.map((c) => c.ticker)).size !== ETF_UNIVERSE.length ||
      ETF_UNIVERSE.some((etf) => !candidates.some((c) => c.ticker === etf.ticker)) ||
      observedAt.slice(0, 10) !== MOMENTUM_INCEPTION ||
      candidates.some((c) => c.status !== "ready" || c.sessions !== 200 ||
        !Number.isFinite(c.sma200) || c.sma200! <= 0 || !Number.isFinite(c.price) || c.price! <= 0 ||
        c.priceDate?.slice(0, 10) !== MOMENTUM_INCEPTION || !c.smaDate || c.smaDate >= MOMENTUM_INCEPTION ||
        Math.abs(Date.parse(observedAt) - Date.parse(c.priceDate!)) > 60 * 60_000 ||
        c.aboveSma !== (c.price! > c.sma200!))) {
    throw new Error("Invalid captured Momentum inception");
  }
  const prices = Object.fromEntries(candidates.map((c) => [c.ticker, c.price!]));
  const result = allocate(initialMomentum(), candidates, MOMENTUM_INCEPTION, prices);
  result.state.inceptionAt = observedAt;
  result.state.processedDate = "2026-10-25";
  result.state.candidates = candidates;
  result.state.refreshedAt = observedAt;
  const snapshot: MomentumSnapshot = {
    date: MOMENTUM_INCEPTION, value: MOMENTUM_CAPITAL, cash: result.state.cash, returnPercent: 0,
    prices, priceBasis: "quote", valuedAt: observedAt,
  };
  return { state: result.state, events: result.events.map((event) => ({ ...event, selectionSnapshot: candidates, observedAt })), snapshots: [snapshot] };
}

export function advanceMomentum(state: MomentumState, market: MomentumMarket) {
  let next = structuredClone(state);
  next.refreshedAt = market.observedAt;
  next.liveValuationVersion = 1;
  next.message = null;
  const events: (EngineEvent & { selectionSnapshot?: MomentumCandidate[]; observedAt?: string })[] = [];
  const snapshots: MomentumSnapshot[] = [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(market.observedAt));
  const liveScreen = today === market.targetDate || today > market.targetDate;
  const liveCandidates = momentumSignals(market, today, true);
  next.candidates = liveScreen && liveCandidates.every((c) => c.status === "ready")
    ? liveCandidates : momentumSignals(market, market.targetDate);
  const record = (date: string, prices: Record<string, number>, basis: "quote" | "close", valuedAt: string) => {
    const value = next.cash + next.positions.reduce((sum, p) => sum + p.shares * prices[p.ticker], 0);
    snapshots.push({ date, value, cash: next.cash, returnPercent: (value / MOMENTUM_CAPITAL - 1) * 100, prices, priceBasis: basis, valuedAt });
  };
  if (!next.inceptionDate) {
    const signals = momentumSignals(market, next.launchDate, true);
    if (today !== next.launchDate || signals.some((c) => c.status !== "ready")) {
      next.message = `Inception awaits verified ${next.launchDate} time-stamped quotes and 200 prior closes for every ETF. No later quote or historical execution is substituted.`;
      return { state: next, events, snapshots };
    }
    const captured = capturedMomentumInception(signals, market.observedAt);
    next = captured.state;
    events.push(...captured.events);
    snapshots.push(...captured.snapshots);
  }
  const dates = [...new Set(Object.values(market.prices).flatMap((s) => Object.keys(s)))]
    .filter((d) => d >= next.inceptionDate! && d > next.processedDate! && d <= market.targetDate).sort();
  // Retry a deferred rebalance at the same close after provider data recovers.
  if (next.nextRebalanceDate! <= market.targetDate && next.processedDate === market.targetDate && !dates.includes(market.targetDate)) dates.push(market.targetDate);
  for (const date of dates) {
    const prices = Object.fromEntries(ETF_UNIVERSE.map((e) => [e.ticker, market.prices[e.ticker]?.[date]]));
    if (next.positions.some((p) => !Number.isFinite(prices[p.ticker]) || prices[p.ticker] <= 0)) {
      next.valuationGaps = [...new Set([...next.valuationGaps, date])].sort();
      next.message = `A held ETF is missing its ${date} close; retaining the last verified valuation.`;
      continue;
    }
    // Apply all actions since last complete valuation, not just this session.
    const actions = market.actions.filter((a) => a.date > next.processedDate! && a.date <= date && a.date > next.inceptionDate!)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.type === "split" ? -1 : 1));
    for (const action of actions) {
      const p = next.positions.find((p) => p.ticker === action.ticker);
      if (!p) continue;
      const cashChange = action.type === "dividend" ? p.shares * action.value : 0;
      if (action.type === "split") { p.shares *= action.value; p.entryPrice /= action.value; p.entrySma /= action.value; }
      else next.cash += cashChange;
      events.push({ id: `momentum:${action.type}:${action.ticker}:${action.date}`, date: action.date, type: action.type,
        ticker: action.ticker, shares: p.shares, price: action.value, cashChange });
    }
    next.message = null;
    if (date >= next.nextRebalanceDate!) {
      const signals = momentumSignals(market, date);
      if (signals.some((c) => c.status !== "ready")) next.message = `Quarterly allocation due ${next.nextRebalanceDate}; waiting for complete 200-session signals. Existing holdings are unchanged.`;
      else {
        const allocation = allocate(next, signals, date, prices);
        next = allocation.state;
        events.push(...allocation.events.map((e) => ({ ...e, selectionSnapshot: signals, observedAt: market.observedAt })));
      }
    }
    next.processedDate = date;
    next.valuationGaps = next.valuationGaps.filter((gap) => gap !== date);
    record(date, prices, "close", date);
  }
  if (next.candidates.some((c) => c.status !== "ready") && !next.message) {
    next.message = "Current ETF signals are incomplete. Existing holdings and the last verified valuation are preserved; allocations require all six verified signals.";
  }
  const liveMark = portfolioLivePrices(next.positions, next.processedDate, market);
  if (liveMark) record(liveMark.date, liveMark.prices, "quote", liveMark.valuedAt);
  return { state: next, events, snapshots };
}
