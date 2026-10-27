import type { LazyAsset, LazyHolding, BlindTrustPerformance } from "@workspace/api-zod";
import type { EngineEvent } from "./model-portfolio-engine";
import { nextQuarter, type MomentumMarket } from "./momentum-engine";
import { portfolioLivePrices } from "./portfolio-live-prices";

export const LAZY_INCEPTION = "2026-10-26";
export const LAZY_CAPITAL = 30_000;
export const LAZY_UNIVERSE = [
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF", assetClass: "US total stock market", targetWeight: 30 },
  { ticker: "VNQ", name: "Vanguard Real Estate ETF", assetClass: "US real estate / REITs", targetWeight: 20 },
  { ticker: "VEU", name: "Vanguard FTSE All-World ex-US ETF", assetClass: "International equity (developed + emerging)", targetWeight: 15 },
  { ticker: "VWO", name: "Vanguard FTSE Emerging Markets ETF", assetClass: "Emerging markets equity", targetWeight: 5 },
  { ticker: "TIP", name: "iShares TIPS Bond ETF", assetClass: "Treasury inflation-protected securities", targetWeight: 15 },
  { ticker: "IEI", name: "iShares 3-7 Year Treasury Bond ETF", assetClass: "Intermediate US Treasury bonds", targetWeight: 15 },
] as const;
type Position = Pick<LazyHolding, "ticker" | "name" | "targetWeight" | "entryDate" | "entryPrice" | "shares" | "costBasis">;
export type LazyState = {
  version: 1; launchDate: string; inceptionDate: string; inceptionAt: string;
  nextRebalanceDate: string; lastRebalanceDate: string; processedDate: string;
  positions: Position[]; cash: number; assets: LazyAsset[];
  refreshedAt: string | null; message: string | null; valuationGaps: string[];
  liveValuationVersion?: 1;
};
export type LazySnapshot = BlindTrustPerformance & {
  prices: Record<string, number>; priceBasis: "quote" | "close"; valuedAt: string;
};
export type LazyEvent = EngineEvent & { targetWeights?: Record<string, number>; observedAt?: string };

function validPrices(prices: Record<string, number>): boolean {
  return LAZY_UNIVERSE.every((e) => Number.isFinite(prices[e.ticker]) && prices[e.ticker] > 0);
}

function allocate(state: LazyState, date: string, prices: Record<string, number>, inception = false) {
  if (!validPrices(prices)) throw new Error("All six verified USD prices are required");
  const equity = state.cash + state.positions.reduce((s, p) => s + p.shares * prices[p.ticker], 0);
  if (!Number.isFinite(equity) || equity <= 0) throw new Error("Invalid Lazy portfolio equity");
  const scheduledDate = inception ? date : state.nextRebalanceDate;
  const id = `lazy:allocation:${scheduledDate}`;
  const events: LazyEvent[] = state.positions.map((p) => ({
    id: `${id}:sell:${p.ticker}`, date, type: "sell", ticker: p.ticker, shares: p.shares,
    price: prices[p.ticker], cashChange: p.shares * prices[p.ticker],
  }));
  const positions = LAZY_UNIVERSE.map((e): Position => {
    const amount = equity * e.targetWeight / 100;
    const price = prices[e.ticker];
    const shares = amount / price;
    events.push({ id: `${id}:buy:${e.ticker}`, date, type: "buy", ticker: e.ticker, shares, price, cashChange: -amount });
    return { ticker: e.ticker, name: e.name, targetWeight: e.targetWeight, entryDate: date, entryPrice: price, shares, costBasis: amount };
  });
  // The shared allocation contract allows null when weights are unequal.
  events.push({
    id, date, scheduledDate, type: inception ? "inception" : "rebalance",
    equity, amountPerPosition: null, tickers: positions.map((p) => p.ticker),
    targetWeights: Object.fromEntries(LAZY_UNIVERSE.map((e) => [e.ticker, e.targetWeight])),
    note: "Fixed weights: VTI 30%, VNQ 20%, VEU 15%, VWO 5%, TIP 15%, IEI 15%." +
      (scheduledDate < date ? " Executed at the next complete trading session after the scheduled date." : ""),
  });
  return { state: { ...state, positions, cash: 0, lastRebalanceDate: date,
    nextRebalanceDate: nextQuarter(state.inceptionDate, date), message: null }, events };
}

export function capturedLazyInception(assets: LazyAsset[], observedAt: string) {
  if (observedAt.slice(0, 10) !== LAZY_INCEPTION || assets.length !== LAZY_UNIVERSE.length ||
      new Set(assets.map((a) => a.ticker)).size !== LAZY_UNIVERSE.length ||
      LAZY_UNIVERSE.some((e) => !assets.some((a) => a.ticker === e.ticker && a.targetWeight === e.targetWeight)) ||
      assets.some((a) => !Number.isFinite(a.price) || a.price! <= 0 ||
        a.priceDate?.slice(0, 10) !== LAZY_INCEPTION ||
        !Number.isFinite(Date.parse(a.priceDate!)) ||
        Date.parse(observedAt) - Date.parse(a.priceDate!) < -60_000 ||
        Date.parse(observedAt) - Date.parse(a.priceDate!) > 3600_000)) {
    throw new Error("Invalid contemporaneous Lazy inception observation");
  }
  const prices = Object.fromEntries(assets.map((a) => [a.ticker, a.price!]));
  const state: LazyState = {
    version: 1, launchDate: LAZY_INCEPTION, inceptionDate: LAZY_INCEPTION, inceptionAt: observedAt,
    nextRebalanceDate: nextQuarter(LAZY_INCEPTION, LAZY_INCEPTION), lastRebalanceDate: LAZY_INCEPTION,
    // No launch-day ex-dividend entitlement: model purchased after market open.
    processedDate: "2026-10-25", positions: [], cash: LAZY_CAPITAL, assets,
    refreshedAt: observedAt, message: null, valuationGaps: [],
  };
  const result = allocate(state, LAZY_INCEPTION, prices, true);
  const snapshot: LazySnapshot = {
    date: LAZY_INCEPTION, value: LAZY_CAPITAL, cash: 0, returnPercent: 0,
    prices, priceBasis: "quote", valuedAt: observedAt,
  };
  return { state: result.state, events: result.events.map((e) => ({ ...e, observedAt })), snapshots: [snapshot] };
}

export function advanceLazy(state: LazyState, market: MomentumMarket) {
  let next = structuredClone(state);
  next.refreshedAt = market.observedAt;
  next.liveValuationVersion = 1;
  next.message = null;
  const events: LazyEvent[] = [];
  const snapshots: LazySnapshot[] = [];
  next.assets = LAZY_UNIVERSE.map((e) => {
    const quote = market.live[e.ticker];
    const age = quote ? Date.parse(market.observedAt) - Date.parse(quote.at) : Infinity;
    const fresh = quote && age >= -60_000 && age <= 3600_000 && Number.isFinite(quote.price) && quote.price > 0;
    const price = fresh ? quote.price : market.prices[e.ticker]?.[market.targetDate];
    return { ...e, price: Number.isFinite(price) && price > 0 ? price : null,
      priceDate: Number.isFinite(price) && price > 0 ? fresh ? quote.at : market.targetDate : null };
  });
  const dates = [...new Set(Object.values(market.prices).flatMap((p) => Object.keys(p)))]
    .filter((d) => d >= next.inceptionDate && d > next.processedDate && d <= market.targetDate).sort();
  for (const date of dates) {
    const prices = Object.fromEntries(LAZY_UNIVERSE.map((e) => [e.ticker, market.prices[e.ticker]?.[date]]));
    if (!validPrices(prices)) {
      next.valuationGaps = [...new Set([...next.valuationGaps, date])].sort();
      next.message = `Missing an ETF close for ${date}. Holding the last verified portfolio; no prices are estimated.`;
      continue;
    }
    const actions = market.actions.filter((a) => a.date > next.processedDate && a.date <= date && a.date > next.inceptionDate)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.type === "split" ? -1 : 1));
    for (const a of actions) {
      const p = next.positions.find((p) => p.ticker === a.ticker);
      if (!p) continue;
      const cashChange = a.type === "dividend" ? p.shares * a.value : 0;
      if (a.type === "split") { p.shares *= a.value; p.entryPrice /= a.value; }
      else next.cash += cashChange;
      events.push({ id: `lazy:${a.type}:${a.ticker}:${a.date}`, date: a.date, type: a.type,
        ticker: a.ticker, shares: p.shares, price: a.value, cashChange });
    }
    next.message = null;
    if (date >= next.nextRebalanceDate) {
      const allocation = allocate(next, date, prices);
      next = allocation.state;
      events.push(...allocation.events.map((e) => ({ ...e, observedAt: market.observedAt })));
    }
    next.processedDate = date;
    const value = next.cash + next.positions.reduce((s, p) => s + p.shares * prices[p.ticker], 0);
    snapshots.push({ date, value, cash: next.cash, returnPercent: (value / LAZY_CAPITAL - 1) * 100,
      prices, priceBasis: "close", valuedAt: date });
  }
  if (next.assets.some((a) => a.price == null) && !next.message) {
    next.message = "Current ETF prices are incomplete; existing holdings and last verified valuation are preserved.";
  }
  const liveMark = portfolioLivePrices(next.positions, next.processedDate, market);
  if (liveMark) {
    const value = next.cash + next.positions.reduce((sum, p) => sum + p.shares * liveMark.prices[p.ticker], 0);
    snapshots.push({ date: liveMark.date, value, cash: next.cash, returnPercent: (value / LAZY_CAPITAL - 1) * 100,
      prices: liveMark.prices, priceBasis: "quote", valuedAt: liveMark.valuedAt });
  }
  return { state: next, events, snapshots };
}
