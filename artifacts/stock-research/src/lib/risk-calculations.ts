/** Risk statistics on sorted, dividend-adjusted daily closes. Rates are decimals. */
import { annualizedReturn, daysBetween } from "./performance-calculations.ts";
import type { PricePoint } from "./performance-calculations.ts";

export const SESSIONS_PER_YEAR = 252;
export interface DailyReturn { date: string; previousDate: string; value: number }
export function dailyReturns(prices: PricePoint[]): DailyReturn[] {
  const out: DailyReturn[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1], b = prices[i], days = daysBetween(a.date, b.date);
    // Do not call a return spanning a missing week a daily observation.
    if (days > 0 && days <= 7 && a.adjustedClose > 0 && b.adjustedClose > 0) {
      const value = b.adjustedClose / a.adjustedClose - 1;
      if (Number.isFinite(value)) out.push({ date: b.date, previousDate: a.date, value });
    }
  }
  return out;
}
export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
export function sampleDeviation(values: number[]): number | null {
  const avg = mean(values);
  if (avg === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}
export function annualizedVolatility(prices: PricePoint[]): number | null {
  const std = sampleDeviation(dailyReturns(prices).map((r) => r.value));
  return std === null ? null : std * Math.sqrt(SESSIONS_PER_YEAR);
}
export interface DrawdownPoint { date: string; drawdown: number }
export interface DrawdownEpisode {
  peak: string; trough: string; recovery: string | null; loss: number;
  declineDays: number; recoveryDays: number | null; underwaterDays: number;
}
export interface DrawdownAnalysis { points: DrawdownPoint[]; episodes: DrawdownEpisode[]; maxDrawdown: number }
/** Recovery is first adjusted close at/above prior peak. Durations are calendar days. */
export function analyzeDrawdowns(prices: PricePoint[]): DrawdownAnalysis {
  if (!prices.length) return { points: [], episodes: [], maxDrawdown: 0 };
  let peak = prices[0], trough = prices[0], underwater = false, maxDrawdown = 0;
  const points: DrawdownPoint[] = [], episodes: DrawdownEpisode[] = [];
  const finish = (recovery: PricePoint | null) => {
    episodes.push({
      peak: peak.date, trough: trough.date, recovery: recovery?.date ?? null,
      loss: trough.adjustedClose / peak.adjustedClose - 1,
      declineDays: daysBetween(peak.date, trough.date),
      recoveryDays: recovery ? daysBetween(trough.date, recovery.date) : null,
      underwaterDays: daysBetween(peak.date, recovery?.date ?? prices[prices.length - 1].date),
    });
  };
  for (const p of prices) {
    if (p.adjustedClose >= peak.adjustedClose) {
      if (underwater) finish(p);
      peak = p; trough = p; underwater = false;
    } else {
      underwater = true;
      if (p.adjustedClose < trough.adjustedClose) trough = p;
    }
    const drawdown = p.adjustedClose / peak.adjustedClose - 1;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    points.push({ date: p.date, drawdown });
  }
  if (underwater) finish(null);
  return { points, episodes: episodes.sort((a, b) => a.loss - b.loss), maxDrawdown };
}
export interface RiskRatios {
  observations: number; volatility: number | null; cagr: number | null;
  sharpe: number | null; sortino: number | null; calmar: number | null;
  downsideDeviation: number | null; maxDrawdown: number | null;
}
function finite(value: number): number | null { return Number.isFinite(value) ? value : null; }
/** Sharpe: arithmetic mean daily excess / sample daily SD × sqrt(252).
 * Sortino: arithmetic annual excess / annualized downside RMS across ALL observations.
 * Annual effective risk-free rate also supplies the minimum acceptable return (MAR).
 * Calmar: geometric CAGR / absolute maximum drawdown (not excess return).
 */
export function riskRatios(prices: PricePoint[], annualRiskFree = 0): RiskRatios {
  const returns = dailyReturns(prices).map((r) => r.value);
  const base: RiskRatios = { observations: returns.length, volatility: null, cagr: null, sharpe: null, sortino: null, calmar: null, downsideDeviation: null, maxDrawdown: null };
  if (returns.length < 2 || !Number.isFinite(annualRiskFree) || annualRiskFree <= -1) return base;
  const dailyRf = Math.pow(1 + annualRiskFree, 1 / SESSIONS_PER_YEAR) - 1;
  const excess = returns.map((r) => r - dailyRf);
  const avg = mean(excess)!;
  const std = sampleDeviation(returns)!;
  const downside = Math.sqrt(excess.reduce((sum, r) => sum + Math.min(0, r) ** 2, 0) / returns.length) * Math.sqrt(SESSIONS_PER_YEAR);
  const maxDrawdown = Math.abs(analyzeDrawdowns(prices).maxDrawdown);
  const cagr = annualizedReturn(prices[0].date, prices[0].adjustedClose, prices[prices.length - 1].date, prices[prices.length - 1].adjustedClose);
  return {
    observations: returns.length, volatility: std * Math.sqrt(SESSIONS_PER_YEAR), cagr,
    sharpe: std > 1e-12 ? finite(avg / std * Math.sqrt(SESSIONS_PER_YEAR)) : null,
    sortino: downside > 1e-12 ? finite(avg * SESSIONS_PER_YEAR / downside) : null,
    calmar: maxDrawdown > 1e-12 && cagr !== null ? finite(cagr / maxDrawdown) : null,
    downsideDeviation: downside, maxDrawdown,
  };
}
export interface PairedReturn { date: string; stock: number; benchmark: number }
/** Match BOTH return endpoints, not only end dates, to avoid mixing unequal intervals. */
export function pairedReturns(stock: PricePoint[], benchmark: PricePoint[]): PairedReturn[] {
  const bm = new Map(dailyReturns(benchmark).map((r) => [`${r.previousDate}/${r.date}`, r.value]));
  return dailyReturns(stock).flatMap((r) => {
    const b = bm.get(`${r.previousDate}/${r.date}`);
    return b === undefined ? [] : [{ date: r.date, stock: r.value, benchmark: b }];
  });
}
export interface BetaCorrelation {
  observations: number; beta: number | null; correlation: number | null;
  rSquared: number | null; stockVolatility: number | null; benchmarkVolatility: number | null;
}
export function betaCorrelation(pairs: PairedReturn[]): BetaCorrelation {
  const base: BetaCorrelation = { observations: pairs.length, beta: null, correlation: null, rSquared: null, stockVolatility: null, benchmarkVolatility: null };
  if (pairs.length < 2) return base;
  const x = mean(pairs.map((p) => p.benchmark))!, y = mean(pairs.map((p) => p.stock))!;
  let xx = 0, yy = 0, xy = 0;
  for (const p of pairs) { xx += (p.benchmark - x) ** 2; yy += (p.stock - y) ** 2; xy += (p.benchmark - x) * (p.stock - y); }
  const correlation = xx > 1e-24 && yy > 1e-24 ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null;
  return {
    observations: pairs.length, beta: xx > 1e-24 ? finite(xy / xx) : null, correlation,
    rSquared: correlation === null ? null : correlation ** 2,
    stockVolatility: Math.sqrt(yy / (pairs.length - 1)) * Math.sqrt(SESSIONS_PER_YEAR),
    benchmarkVolatility: Math.sqrt(xx / (pairs.length - 1)) * Math.sqrt(SESSIONS_PER_YEAR),
  };
}
export interface RollingVolatility { date: string; value: number }
export function rollingVolatility(prices: PricePoint[], window = 63): RollingVolatility[] {
  if (!Number.isInteger(window) || window < 2) return [];
  const returns = dailyReturns(prices);
  const out: RollingVolatility[] = [];
  for (let i = window - 1; i < returns.length; i++) {
    const slice = returns.slice(i - window + 1, i + 1);
    // Discontinuous observation windows must not appear continuous in rolling estimates.
    if (slice.some((r, j) => j > 0 && r.previousDate !== slice[j - 1].date)) continue;
    out.push({ date: returns[i].date, value: sampleDeviation(slice.map((r) => r.value))! * Math.sqrt(SESSIONS_PER_YEAR) });
  }
  return out;
}
