import { db, modelPortfoliosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetModelPortfolioBacktestResponse, type ModelPortfolioBacktest } from "@workspace/api-zod";
import { ETF_UNIVERSE } from "./momentum-engine";
import { LAZY_UNIVERSE } from "./lazy-engine";
import { fetchMomentumMarket } from "./momentum-market";
import { BACKTEST_START, runPortfolioBacktest, type BacktestStrategy } from "./portfolio-backtest-engine";
import { logger } from "./logger";
import { fetchBlindTrustBooks } from "./blind-trust-history";
import { fetchBlindTrustPriceHistory, runBlindTrustBacktest } from "./blind-trust-backtest";

// A separately namespaced historical cache, never a live strategy/ledger.
const VERSION = 1;
const CACHE_MS = 24 * 60 * 60_000;
const pending = new Map<BacktestStrategy, Promise<ModelPortfolioBacktest>>();
let history: ReturnType<typeof fetchMomentumMarket> | null = null;
const universe = [...new Map([...ETF_UNIVERSE, ...LAZY_UNIVERSE].map((e) => [e.ticker, e])).values()];
type Cache = { version: number; result: ModelPortfolioBacktest };

function fetchHistory() {
  // Share one seven-ETF download when both sections load concurrently.
  if (!history) {
    history = fetchMomentumMarket(BACKTEST_START, new Date(), universe)
      .finally(() => { history = null; });
  }
  return history;
}

export function getPortfolioBacktest(strategy: BacktestStrategy): Promise<ModelPortfolioBacktest> {
  const current = pending.get(strategy);
  if (current) return current;
  const run = (async () => {
    const slug = `historical-backtest:${strategy}`;
    const [row] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    const cache = row?.state as Cache | undefined;
    const cached = cache?.version === VERSION ? GetModelPortfolioBacktestResponse.safeParse(cache.result) : null;
    const previous = cached?.success ? cached.data : null;
    const freshMs = previous?.status === "complete" ? CACHE_MS : 15 * 60_000;
    if (previous && Date.now() - Date.parse(previous.refreshedAt) < freshMs) return previous;
    try {
      const raw = strategy === "blind-trust" ? await (async () => {
        const [market, fundamentals] = await Promise.all([fetchBlindTrustPriceHistory(), fetchBlindTrustBooks()]);
        return runBlindTrustBacktest(market, fundamentals.books, fundamentals.issues);
      })() : runPortfolioBacktest(strategy, await fetchHistory());
      const result = GetModelPortfolioBacktestResponse.parse(raw);
      if (result.status !== "complete" && previous?.status === "complete") {
        return { ...previous, status: "partial" as const,
          message: "Historical data refresh is incomplete. Showing the previous verified simulation; its data timestamp is unchanged." };
      }
      await db.insert(modelPortfoliosTable).values({ slug, state: { version: VERSION, result } })
        .onConflictDoUpdate({ target: modelPortfoliosTable.slug, set: { state: { version: VERSION, result }, updatedAt: new Date() } });
      return result;
    } catch (error) {
      logger.error({ err: error, strategy }, "Historical ETF backtest could not refresh");
      if (previous) return { ...previous, status: "partial" as const,
        message: "Historical refresh failed. Showing the last stored simulation and its original data timestamp." };
      throw error;
    }
  })().finally(() => pending.delete(strategy));
  pending.set(strategy, run);
  return run;
}
