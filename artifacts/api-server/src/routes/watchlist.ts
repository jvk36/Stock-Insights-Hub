import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq } from "drizzle-orm";
import { db, watchlistTable } from "@workspace/db";
import { getStockHistory, getStockMetrics, validateTicker } from "../lib/stockData";

const router: IRouter = Router();
function userId(req: Request) {
  return getAuth(req).userId;
}
function requireUser(req: Request, res: Response) {
  const clerkUserId = userId(req);
  if (!clerkUserId) { res.status(401).json({ error: "Sign in required" }); return null; }
  return clerkUserId;
}

router.get("/watchlist", async (req, res) => {
  const clerkUserId = requireUser(req, res); if (!clerkUserId) return;
  const entries = await db.select().from(watchlistTable)
    .where(eq(watchlistTable.clerkUserId, clerkUserId)).orderBy(asc(watchlistTable.addedAt));
  res.json(entries.map((entry) => ({ id: entry.id, ticker: entry.ticker, addedAt: entry.addedAt.toISOString() })));
});
router.post("/watchlist/add", async (req, res) => {
  const clerkUserId = requireUser(req, res); if (!clerkUserId) return;
  const ticker = typeof req.body?.ticker === "string" ? req.body.ticker.trim().toUpperCase() : "";
  if (!ticker) return res.status(400).json({ error: "Ticker symbol is required" });
  if (!await validateTicker(ticker)) return res.status(400).json({ error: `Invalid ticker symbol: ${ticker}` });
  try {
    const [entry] = await db.insert(watchlistTable).values({ id: crypto.randomUUID(), clerkUserId, ticker }).returning();
    return res.status(201).json({ id: entry.id, ticker: entry.ticker, addedAt: entry.addedAt.toISOString() });
  } catch (error) {
    if (String(error).includes("watchlist_user_ticker_idx")) return res.status(409).json({ error: `${ticker} is already in your watchlist` });
    throw error;
  }
});
router.delete("/watchlist/:id", async (req, res) => {
  const clerkUserId = requireUser(req, res); if (!clerkUserId) return;
  const [deleted] = await db.delete(watchlistTable).where(and(eq(watchlistTable.id, req.params.id), eq(watchlistTable.clerkUserId, clerkUserId))).returning();
  if (!deleted) return res.status(404).json({ error: "Watchlist entry not found" });
  return res.sendStatus(204);
});
router.get("/watchlist/bulk-metrics", async (req, res) => {
  const clerkUserId = requireUser(req, res); if (!clerkUserId) return;
  const entries = await db.select().from(watchlistTable).where(eq(watchlistTable.clerkUserId, clerkUserId)).orderBy(asc(watchlistTable.addedAt));
  const results = await Promise.all(entries.map(async (entry) => {
    try { return await getStockMetrics(entry.ticker); }
    catch (error) { req.log.warn({ err: error, ticker: entry.ticker }, "Failed to fetch watchlist metrics"); return { ticker: entry.ticker, companyName: null, currentPrice: null, peRatioForward: null, epsGrowthYoy: null, debtToEquity: null, ma200: null, ma50: null, rsi: null, shortInterestPct: null, putCallRatio: null, beta: null, impliedVolatility: null, lastUpdated: null }; }
  }));
  return res.json(results);
});
router.get("/stocks/:ticker/history", async (req, res) => {
  const period = typeof req.query.period === "string" ? req.query.period : "6mo";
  try { return res.json(await getStockHistory(req.params.ticker, period)); }
  catch { return res.status(404).json({ error: "Historical data unavailable" }); }
});
export default router;