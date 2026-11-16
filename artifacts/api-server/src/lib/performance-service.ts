import YahooFinance from "yahoo-finance2";
import type { PerformanceSeries } from "@workspace/api-zod";
import { normalizePerformanceHistory } from "./performance-history";
import { logger } from "./logger";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
const TTL = 6 * 60 * 60_000;
const cache = new Map<string, { value: HistoryResult; until: number }>();
const pending = new Map<string, Promise<HistoryResult>>();
const failures = new Map<string, { message: string; until: number }>();
type HistoryResult = { series: PerformanceSeries; skipped: number; fetchedAt: string };
export class PerformanceUnavailable extends Error {}

export async function getPerformanceHistory(symbol: string): Promise<HistoryResult> {
  const now = new Date();
  const cutoff = now.toISOString().slice(0, 10);
  const key = `${symbol}:${cutoff}`;
  const stored = cache.get(key);
  if (stored && stored.until > Date.now()) return stored.value;
  const failure = failures.get(key);
  if (failure && failure.until > Date.now()) throw new Error(failure.message);
  const running = pending.get(key);
  if (running) return running;
  const load = (async () => {
    const result = await yahoo.chart(symbol, {
      period1: new Date("1970-01-01T00:00:00Z"),
      period2: new Date(`${cutoff}T00:00:00Z`),
      interval: "1d",
      events: "dividends,splits",
    });
    const { prices, skipped } = normalizePerformanceHistory(result.quotes ?? [], cutoff, result.meta.exchangeTimezoneName || "UTC");
    if (prices.length < 2) throw new PerformanceUnavailable(`No sufficient dividend-adjusted history is available for ${symbol}.`);
    const value: HistoryResult = {
      series: { symbol, currency: result.meta.currency || null, prices },
      skipped,
      fetchedAt: new Date().toISOString(),
    };
    // Bound cache growth: each entry can contain decades of daily observations.
    if (cache.size >= 80) cache.delete(cache.keys().next().value!);
    cache.set(key, { value, until: Date.now() + TTL });
    return value;
  })();
  pending.set(key, load);
  try { return await load; }
  catch (error) {
    if (!(error instanceof PerformanceUnavailable)) {
      if (failures.size >= 100) failures.delete(failures.keys().next().value!);
      failures.set(key, { message: "Historical price provider is temporarily unavailable. Please retry shortly.", until: Date.now() + 30_000 });
    }
    throw error;
  } finally { pending.delete(key); }
}

export async function getTickerPerformance(symbol: string) {
  const [stockResult, benchmarkResult] = await Promise.allSettled([
    getPerformanceHistory(symbol),
    getPerformanceHistory("SPY"),
  ]);
  if (stockResult.status === "rejected") throw stockResult.reason;
  const stock = stockResult.value;
  const warnings: string[] = [];
  if (stock.skipped) warnings.push(`${stock.skipped} observations without valid adjusted prices were omitted.`);
  if (benchmarkResult.status === "rejected") {
    warnings.push("S&P 500 comparison is temporarily unavailable; ticker results remain available.");
    logger.warn({ err: benchmarkResult.reason }, "Performance benchmark history unavailable");
  }
  if (stock.series.currency !== "USD") warnings.push(`Ticker returns are in ${stock.series.currency ?? "the listing currency"}; no exchange-rate adjustment is applied. SPY is denominated in USD.`);
  return {
    stock: stock.series,
    benchmark: benchmarkResult.status === "fulfilled" ? benchmarkResult.value.series : null,
    warnings,
    fetchedAt: stock.fetchedAt,
    returnBasis: "Daily split- and dividend-adjusted prices; reinvested-dividend total-return estimate, before taxes and transaction costs. Completed sessions through the prior calendar day. S&P 500 comparison uses SPY, an ETF proxy with fees and tracking differences, not the index itself.",
  };
}
