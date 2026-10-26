import type { MomentumCandidate } from "@workspace/api-zod";
import { ETF_UNIVERSE } from "./momentum-engine";

// Actual Yahoo Finance quotes and calculated 200-session SMAs captured live
// on launch day, not a backtest. quote/regularMarketTime and chart/close fields;
// close window ends 2026-10-23, split-adjusted and NOT dividend-adjusted.
// Frozen only for initial seeding of a new environment. Existing portfolios
// are never reset. Ongoing signals/valuations come from the live provider.
// Source: https://finance.yahoo.com/quote/{ticker}/history/
export const MOMENTUM_CAPTURED_AT = "2026-10-26T16:51:19.255Z";
const OBSERVATIONS = [
  { ticker: "VTI", price: 375.34, at: "2026-10-26T16:51:18.000Z", sma: 358.47954879760744 },
  { ticker: "VEU", price: 80.91, at: "2026-10-26T16:51:14.000Z", sma: 81.33864994049073 },
  { ticker: "VWO", price: 56.485, at: "2026-10-26T16:50:51.000Z", sma: 58.31564992904663 },
  { ticker: "VNQ", price: 93.01, at: "2026-10-26T16:51:18.000Z", sma: 94.5257500076294 },
  { ticker: "TLT", price: 81.7, at: "2026-10-26T16:51:12.000Z", sma: 84.77880004882813 },
  { ticker: "TIP", price: 106.2815, at: "2026-10-26T16:50:28.000Z", sma: 108.95405014038086 },
] as const;
export const MOMENTUM_INCEPTION_SIGNALS: MomentumCandidate[] = ETF_UNIVERSE.map((etf) => {
  const source = OBSERVATIONS.find((o) => o.ticker === etf.ticker)!;
  return {
    ...etf, price: source.price, priceDate: source.at, sma200: source.sma, smaDate: "2026-10-23",
    sessions: 200, aboveSma: source.price > source.sma, distancePercent: (source.price / source.sma - 1) * 100,
    status: "ready", reason: null,
  };
});
