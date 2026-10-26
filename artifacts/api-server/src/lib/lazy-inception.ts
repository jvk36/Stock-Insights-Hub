import { LAZY_UNIVERSE } from "./lazy-engine";
import type { LazyAsset } from "@workspace/api-zod";

// Real USD regular-market quotes fetched from Yahoo Finance on launch day.
// Preserve this actual observation when publishing into a separate database.
export const LAZY_CAPTURED_AT = "2026-10-26T20:03:29.031Z";
const quotes: Record<string, { price: number; at: string }> = {
  VTI: { price: 375.64, at: "2026-10-26T19:59:59.000Z" },
  VNQ: { price: 93.17, at: "2026-10-26T19:59:58.000Z" },
  VEU: { price: 80.855, at: "2026-10-26T19:59:58.000Z" },
  VWO: { price: 56.51, at: "2026-10-26T19:59:55.000Z" },
  TIP: { price: 106.31, at: "2026-10-26T19:59:55.000Z" },
  IEI: { price: 114.65, at: "2026-10-26T20:00:01.000Z" },
};
export const LAZY_INCEPTION_ASSETS: LazyAsset[] = LAZY_UNIVERSE.map((e) => ({
  ...e, price: quotes[e.ticker].price, priceDate: quotes[e.ticker].at,
}));
