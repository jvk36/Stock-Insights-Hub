import type { RequestHandler } from "express";

const FREE_INDEX_PATHS = new Set([
  "/indexes/sp500", "/indexes/nasdaq100", "/indexes/sp400",
  "/indexes/sp600", "/indexes/djia", "/indexes/adrs",
]);

/** Constituents and their sector/country fields are free; screening metrics are not. */
export function createIndexAccess(requirePremium: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET" && FREE_INDEX_PATHS.has(req.path)) return next();
    return requirePremium(req, res, next);
  };
}
