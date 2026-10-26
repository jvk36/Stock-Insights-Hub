import { db, modelPortfoliosTable, modelPortfolioEventsTable, modelPortfolioSnapshotsTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import type { BlindTrustAllocation, BlindTrustLedgerEvent, BlindTrustPerformance, BlindTrustPortfolio } from "@workspace/api-zod";
import { advanceModel, INITIAL_CAPITAL, initialModelState, UNIVERSE, type ModelState } from "./model-portfolio-engine";
import { fetchModelMarket, marketDate, completedThrough, type MarketInput } from "./model-portfolio-market";
import { logger } from "./logger";

const SLUG = "blind-trust";
const REFRESH_MS = 15 * 60_000;
let running: Promise<void> | null = null;

export async function ensureModel() {
  const initial = initialModelState(marketDate());
  initial.candidates = UNIVERSE.map((business) => ({
    ...business, price: null, bookValue: null, priceToBook: null, priceDate: null, bookDate: null,
    observedAt: new Date().toISOString(), status: "temporary_error", reason: "Initial market data is loading.", rank: null, selected: false,
  }));
  await db.insert(modelPortfoliosTable).values({ slug: SLUG, state: initial }).onConflictDoNothing();
}

async function refreshModel() {
  await ensureModel();
  const [stored] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, SLUG));
  const initial = stored.state as ModelState;
  if (initial.refreshedAt && Date.now() - Date.parse(initial.refreshedAt) < REFRESH_MS) return;
  // Remote requests happen outside the lock. Re-read state after obtaining it
  // so concurrent requests/processes cannot execute the same annual allocation.
  const market = await fetchModelMarket(initial.launchDate);
  await commitModelMarket(market);
}

export async function commitModelMarket(market: MarketInput, slug = SLUG) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`model-portfolio:${slug}`}))`);
    const [row] = await tx.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    if (!row) throw new Error("Shared portfolio state missing");
    const current = row.state as ModelState;
    // Another process may have committed a more recent provider observation.
    if (current.refreshedAt && current.refreshedAt >= market.observedAt) return;
    const result = advanceModel(current, market);
    for (const event of result.events) {
      const allocation = "tickers" in event;
      const payload = allocation
        ? { ...event, selectionSnapshot: market.candidates, observedAt: market.observedAt, source: "Yahoo Finance quoteSummary and completed-session chart" }
        : event;
      // Unique event IDs are a second guard in addition to the strategy lock.
      await tx.insert(modelPortfolioEventsTable).values({
        id: `${slug}:${event.id}`, slug, date: event.date, type: event.type, payload,
      });
    }
    for (const snapshot of result.snapshots) {
      const prices = Object.fromEntries(Object.entries(market.prices).map(([ticker, series]) => [ticker, series[snapshot.date] ?? null]));
      await tx.insert(modelPortfolioSnapshotsTable).values({
        slug, date: snapshot.date, payload: { ...snapshot, prices },
      }).onConflictDoUpdate({
        target: [modelPortfolioSnapshotsTable.slug, modelPortfolioSnapshotsTable.date],
        set: { payload: { ...snapshot, prices } },
      });
    }
    await tx.update(modelPortfoliosTable).set({ state: result.state, updatedAt: new Date() })
      .where(eq(modelPortfoliosTable.slug, slug));
  });
}

export function refreshModelPortfolio(): Promise<void> {
  if (running) return running;
  running = refreshModel().finally(() => { running = null; });
  return running;
}

export function startModelPortfolioScheduler() {
  const run = () => void refreshModelPortfolio().catch((error) =>
    logger.error({ err: error }, "Blind Trust automatic update failed; preserving existing portfolio"));
  run();
  // Durable nextRebalanceDate and startup catch-up are authoritative, not the
  // lifetime of this process/timer. Public requests are not required to run it.
  const timer = setInterval(run, REFRESH_MS);
  timer.unref();
}

export async function getModelPortfolio(): Promise<BlindTrustPortfolio> {
  await ensureModel();
  return db.transaction(async (tx) => {
  const [row] = await tx.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, SLUG));
  const state = row.state as ModelState;
  const [snapshotRows, eventRows] = await Promise.all([
    tx.select().from(modelPortfolioSnapshotsTable).where(eq(modelPortfolioSnapshotsTable.slug, SLUG)).orderBy(asc(modelPortfolioSnapshotsTable.date)),
    tx.select().from(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, SLUG)).orderBy(asc(modelPortfolioEventsTable.date), asc(modelPortfolioEventsTable.id)),
  ]);
  const snapshots = snapshotRows.map((item) => item.payload as BlindTrustPerformance & { prices: Record<string, number | null> });
  const last = snapshots.at(-1);
  const refreshStale = !state.refreshedAt || Date.now() - Date.parse(state.refreshedAt) > REFRESH_MS * 3;
  // Weekend/holiday closes remain valid, while a lost session is explicit.
  const dateStale = last ? Date.parse(completedThrough()) - Date.parse(last.date) > 4 * 86_400_000 : false;
  const stale = refreshStale || dateStale || Boolean(state.message);
  const value = last?.value ?? null;
  const latestMessage = state.message ?? (refreshStale ? "Market data refresh is delayed. Showing the last verified closing valuation." : dateStale ? "Closing prices are stale. Showing the last verified valuation." : null);
  const gapMessage = state.valuationGaps?.length
    ? `Performance omits ${state.valuationGaps.length} incomplete session(s): ${state.valuationGaps.join(", ")}. No missing prices were estimated; intervening corporate actions are included in the next complete valuation.`
    : null;
  return {
    slug: SLUG, title: "Blind Trust", currency: "USD",
    status: !state.inceptionDate ? "pending" : stale ? "stale" : "active",
    message: [latestMessage, gapMessage].filter(Boolean).join(" ") || null,
    inceptionDate: state.inceptionDate, initialCapital: INITIAL_CAPITAL, currentValue: value, cash: state.cash,
    gain: value == null ? null : value - INITIAL_CAPITAL,
    returnPercent: value == null ? null : (value / INITIAL_CAPITAL - 1) * 100,
    lastRebalanceDate: state.lastRebalanceDate, nextRebalanceDate: state.nextRebalanceDate,
    valuedAt: last?.date ?? null, refreshedAt: state.refreshedAt,
    candidates: state.candidates,
    holdings: state.positions.map((position) => {
      const price = last?.prices[position.ticker] ?? null;
      const currentValue = price == null ? null : position.shares * price;
      return {
        ...position, currentPrice: price, priceDate: price == null ? null : last?.date ?? null,
        currentValue, weight: currentValue == null || value == null || value <= 0 ? null : currentValue / value * 100,
        gain: currentValue == null ? null : currentValue - position.costBasis,
        gainPercent: currentValue == null ? null : (currentValue / position.costBasis - 1) * 100, stale,
      };
    }),
    performance: snapshots.map(({ date, value, cash, returnPercent }) => ({ date, value, cash, returnPercent })),
    allocations: eventRows.filter((event) => ["inception", "rebalance"].includes(event.type)).map((event) => event.payload as BlindTrustAllocation),
    ledger: eventRows.filter((event) => !["inception", "rebalance"].includes(event.type)).map((event) => event.payload as BlindTrustLedgerEvent),
  };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
