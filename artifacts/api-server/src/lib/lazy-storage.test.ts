import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, modelPortfoliosTable, modelPortfolioEventsTable, modelPortfolioSnapshotsTable } from "@workspace/db";
import { commitLazyMarket } from "./lazy-service";
import { capturedLazyInception, type LazyState } from "./lazy-engine";
import { LAZY_CAPTURED_AT, LAZY_INCEPTION_ASSETS } from "./lazy-inception";
import type { MomentumMarket } from "./momentum-engine";

test("Lazy PostgreSQL atomic concurrent refresh creates exactly one weighted quarterly allocation", async () => {
  if (process.env.REPLIT_DEPLOYMENT) throw new Error("Development-only synthetic storage test");
  const slug = `lazy-test-${randomUUID()}`;
  try {
    const captured = capturedLazyInception(LAZY_INCEPTION_ASSETS, LAZY_CAPTURED_AT);
    await db.insert(modelPortfoliosTable).values({ slug, state: captured.state });
    const m: MomentumMarket = {
      observedAt: "2027-01-26T22:00:00.000Z", targetDate: "2027-01-26", adjusted: {}, live: {}, actions: [],
      prices: Object.fromEntries(LAZY_INCEPTION_ASSETS.map((a) => [a.ticker, { "2027-01-26": a.price! * 2 }])),
    };
    await Promise.all([commitLazyMarket(m, slug), commitLazyMarket(m, slug)]);
    const [row] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    const state = row.state as LazyState;
    assert.equal(state.inceptionAt, LAZY_CAPTURED_AT);
    assert.equal(state.nextRebalanceDate, "2027-04-26");
    assert.equal(state.positions[0].costBasis, 18000);
    const events = await db.select().from(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, slug));
    assert.equal(events.filter((e) => e.type === "rebalance").length, 1);
    assert.equal(events.filter((e) => e.type === "buy").length, 6);
    assert.equal(events.filter((e) => e.type === "sell").length, 6);
    const snapshots = await db.select().from(modelPortfolioSnapshotsTable).where(eq(modelPortfolioSnapshotsTable.slug, slug));
    assert.equal(snapshots.length, 1);
  } finally {
    await db.delete(modelPortfolioSnapshotsTable).where(eq(modelPortfolioSnapshotsTable.slug, slug));
    await db.delete(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, slug));
    await db.delete(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    await pool.end();
  }
});
