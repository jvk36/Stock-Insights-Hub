import { db, modelPortfoliosTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { GetCloningPortfolioResponse, GetModelPortfolioBacktestResponse,
  type CloningPortfolio, type ModelPortfolioBacktest } from "@workspace/api-zod";
import { loadCloningFilings } from "./cloning-data";
import { addCloningSymbols, compatibleIssuer, emptyCloningMarket } from "./cloning-market";
import { CLONING_HISTORY, CLONING_INCEPTION, nextCloningDate, previousQuarter, reviewDates, selectCloningPicks, type CloneReview } from "./cloning-selection";
import { runCloning } from "./cloning-engine";
import { completedThrough } from "./model-portfolio-market";
import { logger } from "./logger";

const VERSION = 4;
const REFRESH_MS = 15 * 60_000;
const pending = new Map<string, Promise<unknown>>();
type Stored = { version: number; portfolio?: CloningPortfolio; backtest?: ModelPortfolioBacktest };
const nextDay = (date: string) => new Date(Date.parse(date) + 864e5).toISOString().slice(0, 10);

async function prepare(start: string, end: string) {
  const market = emptyCloningMarket();
  await addCloningSymbols(market, ["SPY"]);
  const calendar = Object.keys(market.prices.SPY ?? {}).sort();
  const dates = reviewDates(start, end, calendar).filter((r): r is typeof r & { date: string } => r.date != null && r.date <= market.targetDate);
  const reviews: CloneReview[] = [];
  // Lazy split verification: if a winner's share growth came from a split,
  // remove the false buy and fetch its replacement before final ranking.
  for (const r of dates) {
    // Bound memory by quarter rather than materializing every manager's full
    // ten-year holdings archive in the API process.
    const filings = await loadCloningFilings([r.reportDate, previousQuarter(r.reportDate)]);
    let selection = selectCloningPicks(filings, r.reportDate, r.date, market.actions);
    for (let pass = 0; pass < 40; pass++) {
      const missing = [...new Set(selection.picks.map((p) => p.ticker).filter((t) => t && !(t in market.prices)))];
      if (!missing.length) break;
      await addCloningSymbols(market, missing);
      selection = selectCloningPicks(filings, r.reportDate, r.date, market.actions);
    }
    reviews.push({ ...r, ...selection });
  }
  // Do not confuse a ticker collision with verified pricing for a filing issuer.
  for (const review of reviews) for (const pick of review.picks) {
    if (pick.ticker && !compatibleIssuer(pick.name, market.issuers[pick.ticker] ?? "")) {
      if (Object.keys(market.prices[pick.ticker] ?? {}).length) {
        review.issues.push(`${pick.manager}: ${pick.ticker} price provider identifies "${market.issuers[pick.ticker]}", not filed issuer "${pick.name}"; prices rejected.`);
      }
      market.prices[pick.ticker] = {};
    }
  }
  return { market, reviews };
}

async function read(slug: string): Promise<Stored | undefined> {
  const [row] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
  const data = row?.state as Stored | undefined;
  return data?.version === VERSION ? data : undefined;
}
function recent(result?: ModelPortfolioBacktest) {
  return result && Date.now() - Date.parse(result.refreshedAt) < REFRESH_MS
    && (result.actualEndDate == null || result.actualEndDate <= completedThrough());
}
async function write(slug: string, state: Stored) {
  await db.insert(modelPortfoliosTable).values({ slug, state })
    .onConflictDoUpdate({ target: modelPortfoliosTable.slug, set: { state, updatedAt: new Date() } });
}
function dedupe<T>(slug: string, run: () => Promise<T>): Promise<T> {
  const current = pending.get(slug);
  if (current) return current as Promise<T>;
  const promise = run().finally(() => pending.delete(slug));
  pending.set(slug, promise);
  return promise;
}

export function getCloningPortfolio(): Promise<CloningPortfolio> {
  return dedupe("cloning", async () => {
    const old = await read("cloning");
    const previous = old?.portfolio ? GetCloningPortfolioResponse.parse(old.portfolio) : undefined;
    // Rebuild older snapshots once to add the ledger, preserving sealed allocations.
    if (previous?.result.ledger && recent(previous.result)) return previous;
    try {
      const end = nextDay(completedThrough());
      const { market, reviews } = await prepare(CLONING_INCEPTION, end);
      const result = GetModelPortfolioBacktestResponse.parse(runCloning(market, reviews, CLONING_INCEPTION, end, previous?.result.allocations));
      const last = result.performance.at(-1);
      const allocation = result.allocations.at(-1);
      const review = reviews.find((r) => r.date === allocation?.date) ?? reviews[0];
      // Reconstruct current quantities from sealed execution shares plus actions
      // after that execution; cost basis is never reset to a new market price.
      const holdings = (allocation?.positions ?? []).filter((p) =>
        !market.settlements.some((event) => event.ticker === p.ticker && event.date > allocation!.date && last && event.date <= last.date)
      ).map((p) => {
        const factor = market.actions.filter((a) => a.ticker === p.ticker && a.type === "split"
          && a.date > allocation!.date && last && a.date <= last.date).reduce((f, a) => f * a.value, 1);
        const shares = p.shares * factor;
        const price = last ? market.prices[p.ticker]?.[last.date] ?? null : null;
        const value = price == null ? 0 : price * shares;
        return { ...p, shares, entryPrice: (p.entryPrice ?? p.price!) / factor, price, value,
          weight: last && last.value > 0 ? value / last.value * 100 : 0,
          gain: price == null ? null : value - (p.costBasis ?? p.value) };
      });
      const portfolio = GetCloningPortfolioResponse.parse({
        slug: "cloning", title: "Cloning", inceptionDate: CLONING_INCEPTION,
        nextRebalanceDate: nextCloningDate(market.targetDate), reportPeriod: review?.picks[0]?.reportPeriod ?? null,
        result, holdings, candidates: review?.picks ?? [],
        coverage: [...new Set(reviews.flatMap((r) => r.issues))],
      });
      // Atomic replacement; lock protects immutable allocations across replicas.
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('cloning-portfolio'))`);
        const [current] = await tx.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, "cloning"));
        const currentState = current?.state as Stored | undefined;
        const concurrent = currentState?.version === VERSION ? currentState.portfolio : undefined;
        const baseline = previous?.result.refreshedAt;
        if (concurrent && concurrent.result.refreshedAt !== baseline) return GetCloningPortfolioResponse.parse(concurrent);
        if (previous?.result.performance.length && result.performance.length < previous.result.performance.length) {
          return { ...previous, result: { ...previous.result, status: "partial", message: "Refresh coverage is incomplete. The last verified portfolio is preserved; data timestamp is unchanged." } };
        }
        const state: Stored = { version: VERSION, portfolio };
        await tx.insert(modelPortfoliosTable).values({ slug: "cloning", state })
          .onConflictDoUpdate({ target: modelPortfoliosTable.slug, set: { state, updatedAt: new Date() } });
        return portfolio;
      });
    } catch (error) {
      if (previous) return { ...previous, result: { ...previous.result, status: "partial", message: "Refresh failed. Showing the last stored portfolio and its original timestamp." } };
      throw error;
    }
  });
}

export function getCloningBacktest(): Promise<ModelPortfolioBacktest> {
  return dedupe("historical-backtest:cloning", async () => {
    const slug = "historical-backtest:cloning";
    const previous = (await read(slug))?.backtest;
    if (recent(previous)) return previous!;
    try {
      const { market, reviews } = await prepare(CLONING_HISTORY, CLONING_INCEPTION);
      const result = GetModelPortfolioBacktestResponse.parse(runCloning(market, reviews, CLONING_HISTORY, CLONING_INCEPTION));
      if (previous?.status === "complete" && result.status !== "complete") {
        return { ...previous, status: "partial", message: "Refresh is incomplete; the previous verified simulation is preserved with its original timestamp." };
      }
      await write(slug, { version: VERSION, backtest: result });
      return result;
    } catch (error) {
      if (previous) return { ...previous, status: "partial", message: "Historical refresh failed; showing the last stored simulation." };
      throw error;
    }
  });
}

export function startCloningScheduler() {
  const run = () => void getCloningPortfolio().catch((error) =>
    logger.error({ err: error }, "Cloning automatic update failed; existing portfolio preserved"));
  run();
  const timer = setInterval(run, REFRESH_MS);
  timer.unref();
}
