import type { RequestHandler } from "express";

const FREE_STOCK_SECTIONS = new Set([
  "quote", "chart", "earnings-history", "financials", "news", "profile", "sec-filings",
]);

/** Only endpoints needed by Overview are free; all other stock data stays Premium. */
export function createStockAccess(requirePremium: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET" && FREE_STOCK_SECTIONS.has(req.params.section as string)) return next();
    return requirePremium(req, res, next);
  };
}
