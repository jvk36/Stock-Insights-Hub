import { db, modelPortfoliosTable, modelPortfolioEventsTable, modelPortfolioSnapshotsTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import type { LazyPortfolio, BlindTrustAllocation, BlindTrustLedgerEvent } from "@workspace/api-zod";
import { advanceLazy, capturedLazyInception, LAZY_CAPITAL, LAZY_UNIVERSE, type LazyState, type LazySnapshot } from "./lazy-engine";
import { LAZY_CAPTURED_AT, LAZY_INCEPTION_ASSETS } from "./lazy-inception";
import { fetchMomentumMarket } from "./momentum-market";
import type { MomentumMarket } from "./momentum-engine";
import { completedThrough } from "./model-portfolio-market";
import { logger } from "./logger";

const SLUG = "lazy";
const REFRESH_MS = 15 * 60_000;
let running: Promise<void> | null = null;

async function ensureLazy() {
  await db.transaction(async (tx) => {
    const captured = capturedLazyInception(LAZY_INCEPTION_ASSETS, LAZY_CAPTURED_AT);
    const inserted = await tx.insert(modelPortfoliosTable)
      .values({ slug: SLUG, state: { ...captured.state, refreshedAt: null } }).onConflictDoNothing().returning({ slug: modelPortfoliosTable.slug });
    // Existing history must never be reset, including on later publishing.
    if (!inserted.length) return;
    for (const event of captured.events) {
      await tx.insert(modelPortfolioEventsTable).values({
        id: `${SLUG}:${event.id}`, slug: SLUG, date: event.date, type: event.type, payload: event,
      });
    }
    for (const snapshot of captured.snapshots) {
      await tx.insert(modelPortfolioSnapshotsTable).values({ slug: SLUG, date: snapshot.date, payload: snapshot });
    }
  });
}

export async function commitLazyMarket(market: MomentumMarket, slug = SLUG) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`model-portfolio:${slug}`}))`);
    const [row] = await tx.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    if (!row) throw new Error("Lazy state missing");
    const state = row.state as LazyState;
    if (state.refreshedAt && state.refreshedAt >= market.observedAt) return;
    const result = advanceLazy(state, market);
    for (const event of result.events) {
      await tx.insert(modelPortfolioEventsTable).values({
        id: `${slug}:${event.id}`, slug, date: event.date, type: event.type, payload: event,
      });
    }
    for (const snapshot of result.snapshots) {
      await tx.insert(modelPortfolioSnapshotsTable).values({ slug, date: snapshot.date, payload: snapshot })
        .onConflictDoUpdate({
          target: [modelPortfolioSnapshotsTable.slug, modelPortfolioSnapshotsTable.date],
          set: { payload: snapshot },
        });
    }
    await tx.update(modelPortfoliosTable).set({ state: result.state, updatedAt: new Date() })
      .where(eq(modelPortfoliosTable.slug, slug));
  });
}

export function refreshLazyPortfolio(): Promise<void> {
  if (running) return running;
  running = (async () => {
    await ensureLazy();
    const [row] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, SLUG));
    const state = row.state as LazyState;
    if (state.refreshedAt && Date.now() - Date.parse(state.refreshedAt) < REFRESH_MS) return;
    await commitLazyMarket(await fetchMomentumMarket(state.launchDate, new Date(), LAZY_UNIVERSE));
  })().finally(() => { running = null; });
  return running;
}

export function startLazyScheduler() {
  const run = () => void refreshLazyPortfolio().catch((error) =>
    logger.error({ err: error }, "Lazy automatic update failed; preserving existing portfolio"));
  run();
  const timer = setInterval(run, REFRESH_MS);
  timer.unref();
}

export async function getLazyPortfolio(): Promise<LazyPortfolio> {
  await ensureLazy();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, SLUG));
    const state = row.state as LazyState;
    const [snapshotRows, eventRows] = await Promise.all([
      tx.select().from(modelPortfolioSnapshotsTable).where(eq(modelPortfolioSnapshotsTable.slug, SLUG)).orderBy(asc(modelPortfolioSnapshotsTable.date)),
      tx.select().from(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, SLUG)).orderBy(asc(modelPortfolioEventsTable.date), asc(modelPortfolioEventsTable.id)),
    ]);
    const snapshots = snapshotRows.map((r) => r.payload as LazySnapshot);
    const last = snapshots.at(-1);
    const refreshStale = !state.refreshedAt || Date.now() - Date.parse(state.refreshedAt) > REFRESH_MS * 3;
    const priceStale = Boolean(last && Date.parse(completedThrough()) - Date.parse(last.date) > 4 * 864e5);
    const stale = refreshStale || priceStale || Boolean(state.message);
    const value = last?.value ?? null;
    const gapMessage = state.valuationGaps.length
      ? `Performance omits incomplete sessions (${state.valuationGaps.join(", ")}). No missing prices are estimated; corporate actions carry forward.` : null;
    return {
      slug: SLUG, title: "Lazy", currency: "USD", status: stale ? "stale" : "active",
      message: [state.message, refreshStale ? "Automatic market-data refresh is delayed; last verified values are shown." : priceStale ? "The last verified prices are stale." : null, gapMessage].filter(Boolean).join(" ") || null,
      inceptionDate: state.inceptionDate, inceptionAt: state.inceptionAt, initialCapital: LAZY_CAPITAL,
      currentValue: value, cash: state.cash, gain: value == null ? null : value - LAZY_CAPITAL,
      returnPercent: value == null ? null : (value / LAZY_CAPITAL - 1) * 100,
      lastRebalanceDate: state.lastRebalanceDate, nextRebalanceDate: state.nextRebalanceDate,
      valuedAt: last?.valuedAt ?? null, valuationBasis: last?.priceBasis ?? "close", refreshedAt: state.refreshedAt,
      assets: state.assets,
      holdings: state.positions.map((p) => {
        const price = last?.prices[p.ticker] ?? null;
        const currentValue = price == null ? null : p.shares * price;
        return { ...p, currentPrice: price, priceDate: price == null ? null : last?.valuedAt ?? null, currentValue,
          weight: currentValue == null || value == null || value <= 0 ? null : currentValue / value * 100,
          gain: currentValue == null ? null : currentValue - p.costBasis,
          gainPercent: currentValue == null ? null : (currentValue / p.costBasis - 1) * 100, stale };
      }),
      performance: snapshots.map(({ date, value, cash, returnPercent }) => ({ date, value, cash, returnPercent })),
      allocations: eventRows.filter((e) => ["inception", "rebalance"].includes(e.type)).map((e) => e.payload as BlindTrustAllocation),
      ledger: eventRows.filter((e) => !["inception", "rebalance"].includes(e.type)).map((e) => e.payload as BlindTrustLedgerEvent),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
