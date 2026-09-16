import { yahooFetch } from "./yahooSession.ts";
import YahooFinance from "yahoo-finance2";

export interface StockMetrics {
  ticker: string; companyName: string | null; currentPrice: number | null;
  peRatioForward: number | null; epsGrowthYoy: number | null; debtToEquity: number | null;
  ma200: number | null; ma50: number | null; rsi: number | null;
  shortInterestPct: number | null; putCallRatio: number | null; beta: number | null;
  impliedVolatility: number | null; lastUpdated: string | null;
}
export interface HistoricalDataPoint { date: string; price: number | null; ma50: number | null; ma200: number | null; rsi: number | null; volume: number | null }
export interface StockHistory { ticker: string; period: string; dataPoints: HistoricalDataPoint[] }
type Chart = { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; longName?: string; shortName?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[]; volume?: (number | null)[] }> } }> } };
type Summary = { quoteSummary?: { result?: Array<{ defaultKeyStatistics?: { forwardPE?: { raw?: number }; shortPercentOfFloat?: { raw?: number }; beta?: { raw?: number } }; financialData?: { debtToEquity?: { raw?: number }; earningsGrowth?: { raw?: number } } }> } };
export const STOCK_METRICS_TTL_MS = 20 * 60_000;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
type StockMetricsProvider = {
  fetchChart: (ticker: string) => Promise<Chart>;
  fetchSummary: (ticker: string) => Promise<Summary>;
  fetchOptions?: (ticker: string) => Promise<{ options?: Array<{ calls?: Array<{ openInterest?: number; impliedVolatility?: number }>; puts?: Array<{ openInterest?: number; impliedVolatility?: number }> }> }>;
  now?: () => number;
};

function sma(values: (number | null)[], period: number, index: number) {
  const slice = values.slice(Math.max(0, index - period + 1), index + 1).filter((value): value is number => value != null);
  return slice.length === period ? slice.reduce((a, b) => a + b, 0) / period : null;
}
function rsi(values: (number | null)[], index: number, period = 14) {
  if (index < period) return null;
  let gains = 0, losses = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const change = (values[i] ?? 0) - (values[i - 1] ?? values[i] ?? 0);
    if (change > 0) gains += change; else losses -= change;
  }
  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
}
export function normalizeTicker(ticker: string) {
  const value = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9^.-]{1,12}$/.test(value) || !/[A-Z0-9]/.test(value)) throw new Error("Invalid ticker symbol format");
  return value;
}
async function fetchChart(ticker: string, range = "2y") {
  return yahooFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}&includePrePost=false`) as Promise<Chart>;
}
function emptyMetrics(ticker: string): StockMetrics {
  return { ticker, companyName: null, currentPrice: null, peRatioForward: null, epsGrowthYoy: null, debtToEquity: null, ma200: null, ma50: null, rsi: null, shortInterestPct: null, putCallRatio: null, beta: null, impliedVolatility: null, lastUpdated: null };
}

export function createStockMetricsService(provider: StockMetricsProvider) {
  const cache = new Map<string, { value: StockMetrics; fetchedAt: number }>();
  const now = provider.now ?? Date.now;
  return async function getMetrics(ticker: string): Promise<StockMetrics> {
    const symbol = normalizeTicker(ticker);
    const cached = cache.get(symbol);
    if (cached && now() - cached.fetchedAt < STOCK_METRICS_TTL_MS) return cached.value;
    const base = cached?.value ?? emptyMetrics(symbol);
    const [chartResult, summaryResult, optionsResult] = await Promise.allSettled([
      provider.fetchChart(symbol),
      provider.fetchSummary(symbol),
      provider.fetchOptions ? provider.fetchOptions(symbol) : Promise.resolve(null),
    ]);
    const next = { ...base, ticker: symbol };
    let refreshed = false;
    if (chartResult.status === "fulfilled") {
      const chart = chartResult.value.chart?.result?.[0];
      const closes = chart?.indicators?.quote?.[0]?.close ?? [];
      const latest = closes.length - 1;
      if (chart) {
        next.companyName = chart.meta?.longName ?? chart.meta?.shortName ?? next.companyName;
        next.currentPrice = chart.meta?.regularMarketPrice ?? closes[latest] ?? next.currentPrice;
        next.ma200 = sma(closes, 200, latest);
        next.ma50 = sma(closes, 50, latest);
        next.rsi = rsi(closes, latest);
        refreshed = true;
      }
    }
    if (summaryResult.status === "fulfilled") {
      const stats = summaryResult.value.quoteSummary?.result?.[0];
      const keys = stats?.defaultKeyStatistics;
      const financial = stats?.financialData;
      if (stats) {
        next.peRatioForward = keys?.forwardPE?.raw ?? next.peRatioForward;
        next.epsGrowthYoy = financial?.earningsGrowth?.raw != null ? financial.earningsGrowth.raw * 100 : next.epsGrowthYoy;
        next.debtToEquity = financial?.debtToEquity?.raw != null ? financial.debtToEquity.raw / 100 : next.debtToEquity;
        next.shortInterestPct = keys?.shortPercentOfFloat?.raw != null ? keys.shortPercentOfFloat.raw * 100 : next.shortInterestPct;
        next.beta = keys?.beta?.raw ?? next.beta;
        refreshed = true;
      }
    }
    if (optionsResult.status === "fulfilled" && optionsResult.value?.options?.[0]) {
      const chain = optionsResult.value.options[0];
      const calls = chain.calls ?? [];
      const puts = chain.puts ?? [];
      const callOpenInterest = calls.reduce((sum, option) => sum + (option.openInterest ?? 0), 0);
      const putOpenInterest = puts.reduce((sum, option) => sum + (option.openInterest ?? 0), 0);
      if (callOpenInterest > 0) next.putCallRatio = Number((putOpenInterest / callOpenInterest).toFixed(2));
      const ivs = [...calls, ...puts].map((option) => option.impliedVolatility).filter((iv): iv is number => iv != null && iv > 0 && iv < 5);
      if (ivs.length > 0) next.impliedVolatility = Number((ivs.reduce((sum, iv) => sum + iv, 0) / ivs.length * 100).toFixed(1));
      refreshed = true;
    }
    if (!refreshed && !cached) throw new Error(`No market data available for ${symbol}`);
    const value = refreshed ? { ...next, lastUpdated: new Date(now()).toISOString() } : base;
    cache.set(symbol, { value, fetchedAt: refreshed ? now() : (cached?.fetchedAt ?? now()) });
    return value;
  };
}

export const getStockMetrics = createStockMetricsService({
  fetchChart: async (ticker) => {
    const result = await yahooFinance.chart(ticker, {
      period1: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000),
      interval: "1d",
    });
    return {
      chart: {
        result: [{
          meta: {
            regularMarketPrice: result.meta?.regularMarketPrice,
            longName: result.meta?.longName,
            shortName: result.meta?.shortName,
          },
          indicators: { quote: [{ close: (result.quotes ?? []).map((quote) => quote.close ?? null) }] },
        }],
      },
    };
  },
  fetchSummary: async (ticker) => {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ["defaultKeyStatistics", "financialData"],
    });
    return {
      quoteSummary: {
        result: [{
          defaultKeyStatistics: {
            forwardPE: quote.defaultKeyStatistics?.forwardPE == null ? undefined : { raw: quote.defaultKeyStatistics.forwardPE },
            shortPercentOfFloat: quote.defaultKeyStatistics?.shortPercentOfFloat == null ? undefined : { raw: quote.defaultKeyStatistics.shortPercentOfFloat },
            beta: quote.defaultKeyStatistics?.beta == null ? undefined : { raw: quote.defaultKeyStatistics.beta },
          },
          financialData: {
            debtToEquity: quote.financialData?.debtToEquity == null ? undefined : { raw: quote.financialData.debtToEquity },
            earningsGrowth: quote.financialData?.earningsGrowth == null ? undefined : { raw: quote.financialData.earningsGrowth },
          },
        }],
      },
    };
  },
  fetchOptions: (ticker) => yahooFinance.options(ticker) as Promise<{ options?: Array<{ calls?: Array<{ openInterest?: number; impliedVolatility?: number }>; puts?: Array<{ openInterest?: number; impliedVolatility?: number }> }> }>,
});
export async function getStockHistory(ticker: string, period = "6mo"): Promise<StockHistory> {
  const symbol = normalizeTicker(ticker);
  const response = await fetchChart(symbol, period);
  const chart = response.chart?.result?.[0];
  if (!chart?.timestamp) throw new Error(`Historical data unavailable for ${symbol}`);
  const quote = chart.indicators?.quote?.[0] ?? {};
  const closes = quote.close ?? [];
  return {
    ticker: symbol, period,
    dataPoints: chart.timestamp.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString(), price: closes[index] ?? null,
      ma50: sma(closes, 50, index), ma200: sma(closes, 200, index),
      rsi: rsi(closes, index), volume: quote.volume?.[index] ?? null,
    })),
  };
}
/**
 * Validate only the symbol syntax. External quote availability is intentionally
 * not checked here: Yahoo can be rate-limited or temporarily unavailable, and
 * that must not prevent a user from saving a valid symbol for a later refresh.
 */
export function isValidTickerSymbol(ticker: string) {
  try {
    normalizeTicker(ticker);
    return true;
  } catch {
    return false;
  }
}