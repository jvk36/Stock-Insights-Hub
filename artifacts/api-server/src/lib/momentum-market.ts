import YahooFinance from "yahoo-finance2";
import { ETF_UNIVERSE, type MomentumMarket } from "./momentum-engine";
import { completedThrough, marketDate, undoFutureSplits } from "./model-portfolio-market";
import type { Action } from "./model-portfolio-engine";
import { logger } from "./logger";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
export async function fetchMomentumMarket(
  since: string, now = new Date(),
  universe: readonly { ticker: string }[] = ETF_UNIVERSE,
): Promise<MomentumMarket> {
  const market: MomentumMarket = {
    observedAt: now.toISOString(), targetDate: completedThrough(now), prices: {}, adjusted: {}, actions: [], live: {}, opens: {},
  };
  // Retain inception warmup as well as all post-launch sessions, so missed
  // quarterly decisions can be replayed using only information available then.
  const start = new Date(Date.parse(`${since}T00:00:00Z`) - 420 * 864e5);
  for (let i = 0; i < universe.length; i += 3) {
    await Promise.all(universe.slice(i, i + 3).map(async ({ ticker }) => {
      const [chartResult, quoteResult] = await Promise.allSettled([
        yahoo.chart(ticker, { period1: start, interval: "1d", events: "div,splits" }), yahoo.quote(ticker),
      ]);
      if (quoteResult.status === "fulfilled") {
        const q = quoteResult.value;
        if (q.symbol === ticker && q.currency === "USD" && q.regularMarketTime && q.regularMarketPrice != null && q.regularMarketPrice > 0) {
          market.live[ticker] = { price: q.regularMarketPrice, at: new Date(q.regularMarketTime).toISOString() };
          if (q.regularMarketOpen != null && Number.isFinite(q.regularMarketOpen) && q.regularMarketOpen > 0) {
            market.opens![ticker] = { [marketDate(new Date(q.regularMarketTime))]: q.regularMarketOpen };
          }
        }
      }
      if (chartResult.status === "rejected") {
        logger.warn({ ticker }, "ETF price history unavailable; preserving existing holdings");
        return;
      }
      const chart = chartResult.value;
      if (chart.meta.symbol !== ticker || chart.meta.currency !== "USD") return;
      const splits: Action[] = (chart.events?.splits ?? []).map((s) => ({
        ticker, date: marketDate(s.date), type: "split", value: Number(s.numerator) / Number(s.denominator),
      }));
      if (splits.some((a) => !Number.isFinite(a.value) || a.value <= 0)) return;
      market.actions.push(...splits, ...(chart.events?.dividends ?? []).map((d): Action => ({
        ticker, date: marketDate(d.date), type: "dividend",
        value: undoFutureSplits(d.amount, marketDate(d.date), splits),
      })).filter((a) => Number.isFinite(a.value) && a.value > 0));
      market.prices[ticker] = {};
      market.adjusted[ticker] = {};
      market.opens![ticker] ??= {};
      for (const q of chart.quotes) {
        const date = marketDate(q.date);
        if (date <= marketDate(now) && q.open != null && Number.isFinite(q.open) && q.open > 0) {
          market.opens![ticker][date] = undoFutureSplits(q.open, date, splits);
        }
        if (date > market.targetDate || q.close == null || !Number.isFinite(q.close) || q.close <= 0) continue;
        market.adjusted[ticker][date] = q.close;
        market.prices[ticker][date] = undoFutureSplits(q.close, date, splits);
      }
    }));
  }
  // The most recent actual trading session, not a weekend calendar date.
  market.targetDate = Object.values(market.prices).flatMap((s) => Object.keys(s)).sort().at(-1) ?? market.targetDate;
  return market;
}
