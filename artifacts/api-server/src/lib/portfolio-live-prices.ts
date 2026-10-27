import type { MomentumMarket } from "./momentum-engine";

const marketDate = (date: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);

/** A display-only mark. Never advances close-based accounting or triggers trades. */
export function portfolioLivePrices(
  positions: readonly { ticker: string }[], processedDate: string | null, market: MomentumMarket,
): { date: string; prices: Record<string, number>; valuedAt: string } | null {
  if (!processedDate || processedDate < market.targetDate) return null;
  const today = marketDate(new Date(market.observedAt));
  // Once a session's close has been accounted for, retain that complete close.
  if (today <= processedDate) return null;
  const tickers = positions.length ? positions.map((p) => p.ticker) : Object.keys(market.live);
  if (!tickers.length) return null;
  const prices: Record<string, number> = {};
  const timestamps: string[] = [];
  for (const ticker of tickers) {
    const quote = market.live[ticker];
    const age = quote ? Date.parse(market.observedAt) - Date.parse(quote.at) : Infinity;
    if (!quote || !Number.isFinite(age) || age < -60_000 || age > 3600_000
      || marketDate(new Date(quote.at)) !== today || !Number.isFinite(quote.price) || quote.price <= 0) return null;
    prices[ticker] = quote.price;
    timestamps.push(quote.at);
  }
  // Today's splits/dividends are booked with the complete close. Until then,
  // do not mix post-action prices with pre-action quantities or cash.
  if (market.actions.some((a) => a.date > processedDate && a.date <= today && positions.some((p) => p.ticker === a.ticker))) return null;
  return { date: today, prices, valuedAt: timestamps.sort()[0] };
}
