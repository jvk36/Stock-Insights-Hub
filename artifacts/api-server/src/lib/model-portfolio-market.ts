import YahooFinance from "yahoo-finance2";
import type { BlindTrustCandidate } from "@workspace/api-zod";
import { convertToUsd, getUsdRate, resolveFinancialCurrency } from "./currency";
import { UNIVERSE, rankCandidates, type Action, type Prices, type OpeningSession } from "./model-portfolio-engine";
import { fetchPershingSquareNav, PSUS_NAV_SOURCE } from "./pershing-square-nav";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
const DAY = 86_400_000;
export function marketDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function completedThrough(now = new Date()): string {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const today = marketDate(now);
  return time >= "16:20" ? today : new Date(Date.parse(`${today}T12:00:00Z`) - DAY).toISOString().slice(0, 10);
}

export type MarketInput = {
  candidates: BlindTrustCandidate[];
  prices: Prices;
  actions: Action[];
  targetDate: string;
  observedAt: string;
  opening?: OpeningSession;
};

export function confirmedNoCoverage(errors: unknown[]): boolean {
  return errors.length === 2 && errors.every((error) =>
    error instanceof Error && /quote not found|no data found|delisted|404/i.test(error.message));
}

export function normalizeBookInputs(input: {
  close: number; livePrice: number | null; book: number | null; reportedPb: number | null;
  priceRate: number | null; bookRate: number | null;
}): { price: number | null; book: number | null; pb: number | null; issue: string | null } {
  const price = convertToUsd(input.close, input.priceRate);
  const book = convertToUsd(input.book, input.bookRate);
  if (price == null || book == null) return { price, book, pb: null, issue: "Currency or book-value data unavailable." };
  if (book <= 0) return { price, book, pb: null, issue: "Nonpositive common book value; P/B is not meaningful." };
  const live = convertToUsd(input.livePrice, input.priceRate);
  // A gross mismatch indicates currency/share-class basis cannot be verified.
  // E.g. a Class B denominator used with a BRK.A numerator must never rank.
  if (live != null && input.reportedPb != null && input.reportedPb > 0) {
    const relative = (live / book) / input.reportedPb;
    if (relative < 0.75 || relative > 1.25) {
      return { price, book, pb: null, issue: "Provider P/B disagrees with currency/share-class-normalized book value; verification required." };
    }
  }
  return { price, book, pb: price / book, issue: null };
}

// Yahoo close/dividend history is split-adjusted, even when adjclose is not
// requested. Restore historical nominal dollars before applying ledger splits.
export function undoFutureSplits(value: number, date: string, splits: Action[]): number {
  return splits.filter((split) => split.type === "split" && split.date > date)
    .reduce((result, split) => result * split.value, value);
}

export async function fetchModelMarket(since: string, now = new Date()): Promise<MarketInput> {
  const observedAt = now.toISOString();
  const through = completedThrough(now);
  const prices: Prices = {};
  const openingPrices: Record<string, number> = {};
  const actions: Action[] = [];
  const candidates: BlindTrustCandidate[] = [];
  const officialNav = await fetchPershingSquareNav(marketDate(now)).catch(() => null);
  // Bound upstream concurrency; an unavailable candidate must not erase others.
  for (let start = 0; start < UNIVERSE.length; start += 3) {
    const batch = await Promise.all(UNIVERSE.slice(start, start + 3).map(async (business) => {
      const base: BlindTrustCandidate = {
        ...business, price: null, bookValue: null, priceToBook: null, priceDate: null, bookDate: null,
        observedAt, status: "temporary_error", reason: null, rank: null, selected: false,
        bookSource: business.ticker === "PSUS" ? PSUS_NAV_SOURCE : null,
        bookValueLabel: business.ticker === "PSUS" ? "NAV/share" : "Book value/share",
      };
      try {
        const [summaryResult, chartResult] = await Promise.allSettled([
          yahoo.quoteSummary(business.providerSymbol, { modules: ["price", "defaultKeyStatistics", "financialData"] }),
          yahoo.chart(business.providerSymbol, {
            period1: new Date(Math.min(Date.parse(`${since}T00:00:00Z`) - 10 * DAY, now.getTime() - 14 * DAY)),
            interval: "1d", events: "div,splits",
          }),
        ]);
        if (summaryResult.status === "rejected" || chartResult.status === "rejected") {
          const errors = [summaryResult, chartResult].flatMap((result) => result.status === "rejected" ? [result.reason] : []);
          const missing = confirmedNoCoverage(errors);
          return { ...base, status: missing ? "unavailable" as const : "temporary_error" as const,
            reason: missing ? "Neither quotes nor price history are available for this exact security. No substitute is used." : "Market data is temporarily incomplete; allocation will retry automatically." };
        }
        const summary = summaryResult.value;
        const chart = chartResult.value;
        const sourcePrice = summary.price;
        if (sourcePrice?.symbol?.toUpperCase() !== business.providerSymbol.toUpperCase()) {
          return { ...base, status: "unavailable" as const, reason: "The requested security could not be verified. No replacement ticker is used." };
        }
        if (!chart.meta?.currency || !sourcePrice.currency || chart.meta.currency !== sourcePrice.currency) {
          return { ...base, reason: "Quote and chart currency disagree or are missing." };
        }
        const priceRate = await getUsdRate(sourcePrice.currency);
        const financialCurrency = resolveFinancialCurrency(summary.financialData, null);
        // Never assume that a foreign issuer's financial figures use USD.
        const bookRate = await getUsdRate(financialCurrency);
        const splitActions: Action[] = (chart.events?.splits ?? []).map((split) => ({
          ticker: business.ticker, date: marketDate(split.date), type: "split" as const,
          value: Number(split.numerator) / Number(split.denominator),
        })).filter((action) => Number.isFinite(action.value) && action.value > 0);
        const series: Record<string, number> = {};
        for (const quote of chart.quotes ?? []) {
          const date = marketDate(quote.date);
          if (date === since && quote.open != null && quote.open > 0 && priceRate != null) {
            openingPrices[business.ticker] = undoFutureSplits(quote.open, date, splitActions) * priceRate;
          }
          if (date > through || quote.close == null || quote.close <= 0 || priceRate == null) continue;
          series[date] = undoFutureSplits(quote.close, date, splitActions) * priceRate;
        }
        prices[business.ticker] = series;
        // This universe currently quotes/reports USD. For non-USD future
        // coverage, historical FX would be required, never today's FX for trades.
        if (sourcePrice.currency !== "USD") return { ...base, reason: "Historical USD exchange rates are required for this quote currency." };
        const dates = Object.keys(series).sort();
        const priceDate = dates.at(-1) ?? null;
        const price = priceDate ? series[priceDate] : null;
        const stats = summary.defaultKeyStatistics;
        const bookDate = business.ticker === "PSUS" ? officialNav?.date ?? null :
          stats?.mostRecentQuarter ? new Date(stats.mostRecentQuarter).toISOString().slice(0, 10) : null;
        const dividendActions: Action[] = (chart.events?.dividends ?? []).map((dividend) => ({
          ticker: business.ticker, date: marketDate(dividend.date), type: "dividend",
          value: undoFutureSplits(dividend.amount, marketDate(dividend.date), splitActions) * (priceRate ?? 0),
        }));
        actions.push(...splitActions, ...dividendActions);
        if (!priceDate || price == null) return { ...base, reason: "Completed-session closing prices are temporarily unavailable." };
        const enriched = { ...base, price, priceDate, bookDate };
        if (business.ticker === "PSUS" && !officialNav) {
          return { ...enriched, reason: "Official PSUS NAV/share could not be verified or is stale. Allocation will retry rather than exclude PSUS." };
        }
        const reportedBook = business.ticker === "PSUS" ? officialNav!.value : stats?.bookValue;
        if (reportedBook == null || !bookDate) {
          return { ...enriched, status: "unavailable" as const, reason: "No reported book value and reporting date are available for this security; excluded until verified." };
        }
        const normalized = normalizeBookInputs({
          close: price, livePrice: sourcePrice.regularMarketPrice ?? null,
          book: reportedBook, reportedPb: business.ticker === "PSUS" ? null : stats?.priceToBook ?? null,
          priceRate: 1, bookRate: business.ticker === "PSUS" ? 1 : bookRate,
        });
        if (normalized.issue) {
          return {
            ...enriched, bookValue: normalized.book,
            status: normalized.book != null && normalized.book <= 0 ? "ineligible" as const : "temporary_error" as const,
            reason: normalized.issue,
          };
        }
        if (Date.parse(through) - Date.parse(priceDate) > 5 * DAY) {
          return { ...enriched, bookValue: normalized.book, reason: "Closing price is stale; allocation is paused." };
        }
        if (Date.parse(bookDate) > Date.parse(through) || Date.parse(through) - Date.parse(bookDate) > 550 * DAY) {
          return { ...enriched, bookValue: normalized.book, reason: "Book-value reporting date is invalid or too old for selection." };
        }
        return { ...enriched, bookValue: normalized.book, priceToBook: normalized.pb, status: "eligible" as const };
      } catch {
        return { ...base, reason: "Market data is temporarily unavailable; retrying automatically." };
      }
    }));
    candidates.push(...batch);
  }
  const targetDate = Object.values(prices).flatMap((series) => Object.keys(series)).sort().at(-1) ?? through;
  const openingCandidates = rankCandidates(candidates.map((candidate) => {
    const open = openingPrices[candidate.ticker];
    const usable = Number.isFinite(open) && open > 0;
    return {
      ...candidate, price: usable ? open : null, priceDate: usable ? since : null,
      priceToBook: usable && candidate.bookValue != null && candidate.bookValue > 0 ? open / candidate.bookValue : null,
      status: candidate.status === "eligible" && !usable ? "temporary_error" as const : candidate.status,
      reason: candidate.status === "eligible" && !usable ? `The ${since} opening price is not available; no closing-price substitute is used.` : candidate.reason,
    };
  }));
  return {
    candidates: rankCandidates(candidates), prices, actions, targetDate, observedAt,
    opening: { date: since, prices: openingPrices, candidates: openingCandidates },
  };
}
