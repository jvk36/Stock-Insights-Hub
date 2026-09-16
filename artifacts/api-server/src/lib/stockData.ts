import { yahooFetch } from "./yahooSession";

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
function normalize(ticker: string) {
  const value = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9^.-]{1,12}$/.test(value)) throw new Error("Invalid ticker");
  return value;
}
async function fetchChart(ticker: string, range: string) {
  return yahooFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}&includePrePost=false`) as Promise<Chart>;
}
export async function getStockMetrics(ticker: string): Promise<StockMetrics> {
  const symbol = normalize(ticker);
  const [chartResponse, summaryResponse] = await Promise.all([
    fetchChart(symbol, "2y"),
    yahooFetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,financialData`) as Promise<Summary>,
  ]);
  const chart = chartResponse.chart?.result?.[0];
  if (!chart) throw new Error(`Ticker ${symbol} not found`);
  const closes = chart.indicators?.quote?.[0]?.close ?? [];
  const latest = closes.length - 1;
  const stats = summaryResponse.quoteSummary?.result?.[0];
  return {
    ticker: symbol, companyName: chart.meta?.longName ?? chart.meta?.shortName ?? null,
    currentPrice: chart.meta?.regularMarketPrice ?? closes[latest] ?? null,
    peRatioForward: stats?.defaultKeyStatistics?.forwardPE?.raw ?? null,
    epsGrowthYoy: stats?.financialData?.earningsGrowth?.raw ?? null,
    debtToEquity: stats?.financialData?.debtToEquity?.raw ?? null,
    ma200: sma(closes, 200, latest), ma50: sma(closes, 50, latest), rsi: rsi(closes, latest),
    shortInterestPct: stats?.defaultKeyStatistics?.shortPercentOfFloat?.raw ?? null,
    putCallRatio: null, beta: stats?.defaultKeyStatistics?.beta?.raw ?? null,
    impliedVolatility: null, lastUpdated: new Date().toISOString(),
  };
}
export async function getStockHistory(ticker: string, period = "6mo"): Promise<StockHistory> {
  const symbol = normalize(ticker);
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
export async function validateTicker(ticker: string) {
  try { await getStockMetrics(ticker); return true; } catch { return false; }
}