import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, modelPortfoliosTable, modelPortfolioEventsTable, modelPortfolioSnapshotsTable } from "@workspace/db";
import { commitMomentumMarket } from "./momentum-service";
import { capturedMomentumInception, type MomentumState, type MomentumMarket } from "./momentum-engine";
import { MOMENTUM_CAPTURED_AT, MOMENTUM_INCEPTION_SIGNALS } from "./momentum-inception";

test("Momentum PostgreSQL commits are atomic and concurrent quarterly refreshes are idempotent", async () => {
  if (process.env.REPLIT_DEPLOYMENT) throw new Error("Development-only synthetic storage test");
  const slug = `momentum-test-${randomUUID()}`;
  try {
    const captured = capturedMomentumInception(MOMENTUM_INCEPTION_SIGNALS, MOMENTUM_CAPTURED_AT);
    await db.insert(modelPortfoliosTable).values({ slug, state: captured.state });
    const adjusted: MomentumMarket["adjusted"] = {};
    for (const c of MOMENTUM_INCEPTION_SIGNALS) {
      adjusted[c.ticker] = {};
      for (let i = 0; i < 200; i++) {
        const date = new Date(Date.parse("2027-01-26T12:00:00Z") - i * 864e5).toISOString().slice(0, 10);
        adjusted[c.ticker][date] = c.ticker === "VTI" ? 400 : 100;
      }
    }
    const m: MomentumMarket = {
      observedAt: "2027-01-26T21:00:00.000Z", targetDate: "2027-01-26",
      adjusted, prices: { VTI: { "2027-01-26": 400 } }, actions: [], live: {},
    };
    // Provide current execution prices for all six ETFs; flat SMA means no
    // qualifying ETF at equality, so this quarter should liquidate into cash.
    for (const c of MOMENTUM_INCEPTION_SIGNALS) m.prices[c.ticker] = { "2027-01-26": c.ticker === "VTI" ? 400 : 100 };
    await Promise.all([commitMomentumMarket(m, slug), commitMomentumMarket(m, slug)]);
    const [row] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    const state = row.state as MomentumState;
    assert.equal(state.inceptionAt, MOMENTUM_CAPTURED_AT);
    assert.equal(state.positions.length, 0);
    assert.equal(state.nextRebalanceDate, "2027-04-26");
    assert.ok(Math.abs(state.cash - 30000 / 375.34 * 400) < 1e-7);
    const events = await db.select().from(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, slug));
    assert.equal(events.filter((e) => e.type === "rebalance").length, 1);
    assert.equal(events.filter((e) => e.type === "sell").length, 1);
    const snapshots = await db.select().from(modelPortfolioSnapshotsTable).where(eq(modelPortfolioSnapshotsTable.slug, slug));
    assert.equal(snapshots.length, 1);
    await commitMomentumMarket(m, slug);
    const retry = await db.select().from(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, slug));
    assert.equal(retry.length, events.length);
  } finally {
    await db.delete(modelPortfolioSnapshotsTable).where(eq(modelPortfolioSnapshotsTable.slug, slug));
    await db.delete(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, slug));
    await db.delete(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    await pool.end();
  }
});
