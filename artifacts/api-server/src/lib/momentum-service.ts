import { db, modelPortfoliosTable, modelPortfolioEventsTable, modelPortfolioSnapshotsTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import type { MomentumPortfolio, BlindTrustAllocation, BlindTrustLedgerEvent } from "@workspace/api-zod";
import { advanceMomentum, capturedMomentumInception, MOMENTUM_CAPITAL, type MomentumState, type MomentumMarket, type MomentumSnapshot } from "./momentum-engine";
import { MOMENTUM_CAPTURED_AT, MOMENTUM_INCEPTION_SIGNALS } from "./momentum-inception";
import { fetchMomentumMarket } from "./momentum-market";
import { completedThrough } from "./model-portfolio-market";
import { logger } from "./logger";

const SLUG = "momentum";
const REFRESH_MS = 15 * 60_000;
let running: Promise<void> | null = null;

async function ensureMomentum() {
  // Seed the actual captured launch observation atomically in every environment.
  // A successful conflict means an existing portfolio; never alter its history.
  await db.transaction(async (tx) => {
    const captured = capturedMomentumInception(MOMENTUM_INCEPTION_SIGNALS, MOMENTUM_CAPTURED_AT);
    const inserted = await tx.insert(modelPortfoliosTable)
      .values({ slug: SLUG, state: { ...captured.state, refreshedAt: null } }).onConflictDoNothing().returning({ slug: modelPortfoliosTable.slug });
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

export async function commitMomentumMarket(market: MomentumMarket, slug = SLUG) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`model-portfolio:${slug}`}))`);
    const [row] = await tx.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    if (!row) throw new Error("Momentum state missing");
    const current = row.state as MomentumState;
    if (current.refreshedAt && current.refreshedAt >= market.observedAt) return;
    const result = advanceMomentum(current, market);
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

export function refreshMomentumPortfolio(): Promise<void> {
  if (running) return running;
  running = (async () => {
    await ensureMomentum();
    const [row] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, SLUG));
    const state = row.state as MomentumState;
    if (state.liveValuationVersion === 1 && !state.message && state.refreshedAt && Date.now() - Date.parse(state.refreshedAt) < REFRESH_MS) return;
    await commitMomentumMarket(await fetchMomentumMarket(state.launchDate));
  })().finally(() => { running = null; });
  return running;
}

export function startMomentumScheduler() {
  const run = () => void refreshMomentumPortfolio().catch((error) =>
    logger.error({ err: error }, "Momentum automatic update failed; preserving existing portfolio"));
  run();
  const timer = setInterval(run, REFRESH_MS);
  timer.unref();
}

export async function getMomentumPortfolio(): Promise<MomentumPortfolio> {
  await ensureMomentum();
  // Requests also wake an idle/scaled-down server; timers alone are insufficient.
  await refreshMomentumPortfolio().catch((error) =>
    logger.error({ err: error }, "Momentum request refresh failed; returning stored values"));
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, SLUG));
    const state = row.state as MomentumState;
    const [snapshotRows, eventRows] = await Promise.all([
      tx.select().from(modelPortfolioSnapshotsTable).where(eq(modelPortfolioSnapshotsTable.slug, SLUG)).orderBy(asc(modelPortfolioSnapshotsTable.date)),
      tx.select().from(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, SLUG)).orderBy(asc(modelPortfolioEventsTable.date), asc(modelPortfolioEventsTable.id)),
    ]);
    const snapshots = snapshotRows.map((r) => r.payload as MomentumSnapshot);
    const last = snapshots.at(-1);
    const refreshStale = !state.refreshedAt || Date.now() - Date.parse(state.refreshedAt) > REFRESH_MS * 3;
    const priceStale = Boolean(last && Date.parse(completedThrough()) - Date.parse(last.date) > 4 * 864e5);
    const stale = refreshStale || priceStale || Boolean(state.message);
    const value = last?.value ?? null;
    const gapMessage = state.valuationGaps.length
      ? `Performance omits incomplete sessions (${state.valuationGaps.join(", ")}). No missing prices are estimated; corporate actions are carried into the next complete valuation.` : null;
    return {
      slug: SLUG, title: "Momentum", currency: "USD", status: !state.inceptionDate ? "pending" : stale ? "stale" : "active",
      message: [state.message, refreshStale ? "Automatic market-data refresh is delayed; last verified values are shown." : priceStale ? "The last verified prices are stale." : null, gapMessage].filter(Boolean).join(" ") || null,
      inceptionDate: state.inceptionDate, inceptionAt: state.inceptionAt, initialCapital: MOMENTUM_CAPITAL,
      currentValue: value, cash: state.cash, gain: value == null ? null : value - MOMENTUM_CAPITAL,
      returnPercent: value == null ? null : (value / MOMENTUM_CAPITAL - 1) * 100,
      lastRebalanceDate: state.lastRebalanceDate, nextRebalanceDate: state.nextRebalanceDate,
      valuedAt: last?.valuedAt ?? null, valuationBasis: last?.priceBasis ?? "close", refreshedAt: state.refreshedAt,
      candidates: state.candidates,
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
