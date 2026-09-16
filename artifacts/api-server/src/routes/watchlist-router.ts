import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { getStockHistory, getStockMetrics, isValidTickerSymbol } from "../lib/stockData.ts";

export type WatchlistRecord = { id: string; clerkUserId: string; ticker: string; addedAt: Date };
export type WatchlistStore = {
  list: (clerkUserId: string) => Promise<WatchlistRecord[]>;
  add: (clerkUserId: string, ticker: string) => Promise<WatchlistRecord>;
  remove: (clerkUserId: string, id: string) => Promise<WatchlistRecord | undefined>;
};
export type WatchlistRouterDeps = {
  getUserId?: (req: Request) => string | null | undefined;
  store: WatchlistStore;
  getMetrics?: typeof getStockMetrics;
  getHistory?: typeof getStockHistory;
};

function requireUser(req: Request, res: Response, getUserId: (req: Request) => string | null | undefined) {
  const clerkUserId = getUserId(req);
  if (!clerkUserId) { res.status(401).json({ error: "Sign in required" }); return null; }
  return clerkUserId;
}

export function createWatchlistRouter(deps: WatchlistRouterDeps): IRouter {
  const router: IRouter = Router();
  const getUserId = deps.getUserId ?? ((req) => getAuth(req).userId);
  const metrics = deps.getMetrics ?? getStockMetrics;
  const history = deps.getHistory ?? getStockHistory;

  router.get("/watchlist", async (req, res) => {
    const clerkUserId = requireUser(req, res, getUserId); if (!clerkUserId) return;
    const entries = await deps.store.list(clerkUserId);
    res.json(entries.map((entry) => ({ id: entry.id, ticker: entry.ticker, addedAt: entry.addedAt.toISOString() })));
  });
  router.post("/watchlist/add", async (req, res) => {
    const clerkUserId = requireUser(req, res, getUserId); if (!clerkUserId) return;
    const ticker = typeof req.body?.ticker === "string" ? req.body.ticker.trim().toUpperCase() : "";
    if (!ticker) return res.status(400).json({ error: "Ticker symbol is required" });
    if (!isValidTickerSymbol(ticker)) return res.status(400).json({ error: `Invalid ticker symbol format: ${ticker}` });
    try {
      const entry = await deps.store.add(clerkUserId, ticker);
      return res.status(201).json({ id: entry.id, ticker: entry.ticker, addedAt: entry.addedAt.toISOString() });
    } catch (error) {
      if (error instanceof Error && error.name === "DuplicateTicker") return res.status(409).json({ error: `${ticker} is already in your watchlist` });
      req.log.error({ err: error, ticker, clerkUserId }, "Failed to save watchlist ticker");
      return res.status(500).json({ error: "Unable to save ticker right now" });
    }
  });
  router.delete("/watchlist/:id", async (req, res) => {
    const clerkUserId = requireUser(req, res, getUserId); if (!clerkUserId) return;
    const deleted = await deps.store.remove(clerkUserId, req.params.id);
    if (!deleted) return res.status(404).json({ error: "Watchlist entry not found" });
    return res.sendStatus(204);
  });
  router.get("/watchlist/bulk-metrics", async (req, res) => {
    const clerkUserId = requireUser(req, res, getUserId); if (!clerkUserId) return;
    const entries = await deps.store.list(clerkUserId);
    const results = await Promise.all(entries.map(async (entry) => {
      try { return await metrics(entry.ticker); }
      catch (error) {
        req.log.warn({ err: error, ticker: entry.ticker, clerkUserId }, "Watchlist metrics temporarily unavailable");
        return { ticker: entry.ticker, companyName: null, currentPrice: null, peRatioForward: null, epsGrowthYoy: null, debtToEquity: null, ma200: null, ma50: null, rsi: null, shortInterestPct: null, putCallRatio: null, beta: null, impliedVolatility: null, lastUpdated: null };
      }
    }));
    return res.json(results);
  });
  router.get("/stocks/:ticker/history", async (req, res) => {
    const clerkUserId = requireUser(req, res, getUserId); if (!clerkUserId) return;
    const period = typeof req.query.period === "string" ? req.query.period : "6mo";
    try { return res.json(await history(req.params.ticker, period)); }
    catch (error) {
      req.log.warn({ err: error, ticker: req.params.ticker, clerkUserId }, "Watchlist history temporarily unavailable");
      return res.status(404).json({ error: "Historical data unavailable; please try again later" });
    }
  });
  return router;
}