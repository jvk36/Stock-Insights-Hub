import { daysBetween, resolvePeriod } from "./performance-calculations.ts";
import type { PricePoint } from "./performance-calculations.ts";
import { betaCorrelation, pairedReturns, riskRatios } from "./risk-calculations.ts";
import type { RiskRatios } from "./risk-calculations.ts";

export interface PortfolioHolding { symbol: string; weight: number }
export interface HoldingHistory { symbol: string; currency: string | null; prices: PricePoint[] }
export type RebalanceRule = "none" | "monthly" | "quarterly" | "annual";
export interface PortfolioOptions {
  start: string; end: string; rebalance: RebalanceRule;
  initialValue: number; annualRiskFree: number;
}
export interface PortfolioResult {
  ok: true; prices: PricePoint[]; stats: RiskRatios; rebalances: string[];
  allocations: { symbol: string; targetWeight: number; endingWeight: number; value: number }[];
  start: string; end: string; omittedSessions: number;
}
export interface PortfolioError { ok: false; reason: string }
export type PortfolioOutcome = PortfolioResult | PortfolioError;

export function normalizePortfolioSymbol(raw: string): string {
  const symbol = raw.trim().toUpperCase();
  return /^(BRK|BF)\.[AB]$/.test(symbol) ? symbol.replace(".", "-") : symbol;
}
export function validateHoldings(holdings: PortfolioHolding[], weighted = true): string[] {
  const errors: string[] = [];
  if (holdings.length < 2 || holdings.length > 20) errors.push("Enter between 2 and 20 distinct tickers.");
  const symbols = holdings.map((h) => normalizePortfolioSymbol(h.symbol));
  if (symbols.some((s) => !/^[A-Z0-9^][A-Z0-9.^=_-]{0,31}$/.test(s))) errors.push("Each row needs a valid ticker symbol.");
  if (new Set(symbols).size !== symbols.length) errors.push("Duplicate tickers are not allowed.");
  if (weighted) {
    if (holdings.some((h) => !Number.isFinite(h.weight) || h.weight < 0 || h.weight > 100)) errors.push("Weights must be numbers between 0% and 100%.");
    const sum = holdings.reduce((s, h) => s + h.weight, 0);
    if (!Number.isFinite(sum) || Math.abs(sum - 100) > 0.000001) errors.push("Portfolio weights must total 100%.");
  }
  return errors;
}
function validateHistory(history: HoldingHistory): string | null {
  let previous = "";
  for (const p of history.prices) {
    if (!(p.adjustedClose > 0) || !Number.isFinite(p.adjustedClose) || (previous && p.date <= previous)) {
      return `Invalid or unsorted adjusted prices for ${history.symbol}.`;
    }
    previous = p.date;
  }
  return null;
}
function periodBucket(date: string, rule: RebalanceRule): string {
  if (rule === "monthly") return date.slice(0, 7);
  if (rule === "quarterly") return `${date.slice(0, 4)}-${Math.floor((Number(date.slice(5, 7)) - 1) / 3)}`;
  return date.slice(0, 4);
}

/** Long-only, fully invested model. Adjusted-close units reinvest distributions.
 * Rebalance at the first common close in a NEW calendar period, AFTER marking that day's holdings.
 * No leverage, contributions, fees or taxes. No forward filling or currency assumptions.
 */
export function simulatePortfolio(holdings: PortfolioHolding[], histories: HoldingHistory[], options: PortfolioOptions): PortfolioOutcome {
  const errors = validateHoldings(holdings);
  if (errors.length) return { ok: false, reason: errors.join(" ") };
  if (!(options.initialValue > 0) || !Number.isFinite(options.initialValue)) return { ok: false, reason: "Initial investment must be a positive number." };
  if (!Number.isFinite(options.annualRiskFree) || options.annualRiskFree <= -1) return { ok: false, reason: "Enter a valid annual risk-free rate above -100%." };
  if (!["none", "monthly", "quarterly", "annual"].includes(options.rebalance)) return { ok: false, reason: "Choose a valid rebalancing rule." };
  const active = holdings.filter((h) => h.weight > 0);
  const series: HoldingHistory[] = [];
  for (const h of active) {
    const history = histories.find((s) => normalizePortfolioSymbol(s.symbol) === normalizePortfolioSymbol(h.symbol));
    if (!history) return { ok: false, reason: `History is unavailable for ${h.symbol}. No holding has been silently removed.` };
    if (history.currency !== "USD") return { ok: false, reason: `${h.symbol} is not confirmed as USD-listed. Weighted portfolios currently require USD listings; no FX conversion is assumed.` };
    const invalid = validateHistory(history);
    if (invalid) return { ok: false, reason: invalid };
    const period = resolvePeriod(history.prices, options.start, options.end);
    if (!period.ok) return { ok: false, reason: `${h.symbol}: ${period.reason}` };
    series.push(history);
  }
  const maps = series.map((s) => new Map(s.prices.filter((p) => p.date >= options.start && p.date <= options.end).map((p) => [p.date, p.adjustedClose])));
  const dates = [...maps[0].keys()].filter((date) => maps.every((m) => m.has(date)));
  if (dates.length < 3) return { ok: false, reason: "At least three common trading sessions are required for portfolio risk statistics." };
  if (daysBetween(options.start, dates[0]) > 7 || daysBetween(dates[dates.length - 1], options.end) > 7) {
    return { ok: false, reason: "The holdings do not share enough trading dates near the requested range boundaries." };
  }
  if (dates.some((d, i) => i > 0 && daysBetween(dates[i - 1], d) > 7)) {
    return { ok: false, reason: "Common price history has a gap longer than seven days. Choose a continuous date range; missing prices will not be invented." };
  }
  const totalWeight = active.reduce((sum, h) => sum + h.weight, 0);
  const weights = active.map((h) => h.weight / totalWeight);
  let units = weights.map((w, i) => options.initialValue * w / maps[i].get(dates[0])!);
  const prices: PricePoint[] = [], rebalances: string[] = [];
  let endingValues: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    endingValues = units.map((u, j) => u * maps[j].get(date)!);
    const value = endingValues.reduce((s, v) => s + v, 0);
    if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: "Portfolio values exceed the supported numeric range." };
    prices.push({ date, adjustedClose: value });
    if (i > 0 && options.rebalance !== "none" && periodBucket(date, options.rebalance) !== periodBucket(dates[i - 1], options.rebalance)) {
      units = weights.map((w, j) => value * w / maps[j].get(date)!);
      endingValues = weights.map((w) => value * w);
      rebalances.push(date);
    }
  }
  const union = new Set(maps.flatMap((m) => [...m.keys()]));
  const endValue = prices[prices.length - 1].adjustedClose;
  return {
    ok: true, prices, stats: riskRatios(prices, options.annualRiskFree), rebalances,
    allocations: active.map((h, i) => ({
      symbol: normalizePortfolioSymbol(h.symbol), targetWeight: weights[i] * 100,
      endingWeight: endingValues[i] / endValue * 100, value: endingValues[i],
    })),
    start: dates[0], end: dates[dates.length - 1], omittedSessions: union.size - dates.length,
  };
}

export interface CorrelationCell {
  a: string; b: string; correlation: number | null; observations: number;
  start: string | null; end: string | null; reason: string | null;
}
/** Pairwise complete daily returns. Ignores ALL weights, including invalid/missing weights.
 * Matrix pairs can have different samples; counts and dates belong to each cell.
 */
export function portfolioCorrelationMatrix(holdings: PortfolioHolding[], histories: HoldingHistory[], start: string, end: string): CorrelationCell[] {
  return holdings.flatMap((a) => holdings.map((b) => {
    const sa = normalizePortfolioSymbol(a.symbol), sb = normalizePortfolioSymbol(b.symbol);
    const ha = histories.find((h) => normalizePortfolioSymbol(h.symbol) === sa);
    const hb = histories.find((h) => normalizePortfolioSymbol(h.symbol) === sb);
    const base: CorrelationCell = { a: sa, b: sb, correlation: null, observations: 0, start: null, end: null, reason: null };
    if (!ha || !hb) return { ...base, reason: "Holding history unavailable." };
    for (const h of [ha, hb]) {
      const invalid = validateHistory(h);
      if (invalid) return { ...base, reason: invalid };
      const range = resolvePeriod(h.prices, start, end);
      if (!range.ok) return { ...base, reason: `${h.symbol}: ${range.reason}` };
    }
    const pairs = pairedReturns(ha.prices.filter((p) => p.date >= start && p.date <= end), hb.prices.filter((p) => p.date >= start && p.date <= end));
    const stats = betaCorrelation(pairs);
    return {
      ...base, correlation: stats.correlation, observations: pairs.length,
      start: pairs[0]?.date ?? null, end: pairs[pairs.length - 1]?.date ?? null,
      reason: stats.correlation === null ? "Insufficient paired returns or zero return variance." : null,
    };
  }));
}
