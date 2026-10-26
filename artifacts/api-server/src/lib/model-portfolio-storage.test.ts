import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { db, pool, modelPortfoliosTable, modelPortfolioEventsTable, modelPortfolioSnapshotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { commitModelMarket } from "./model-portfolio-service";
import { initialModelState, UNIVERSE, type ModelState } from "./model-portfolio-engine";
import type { MarketInput } from "./model-portfolio-market";

// Uses only a unique synthetic strategy in the DEVELOPMENT database. Never
// modifies the actual shared Blind Trust strategy or any subscriber records.
test("PostgreSQL persistence, atomic snapshots and concurrent annual execution", async () => {
  if (process.env.REPLIT_DEPLOYMENT) throw new Error("Do not run fixture tests in a deployment");
  const slug = `blind-trust-test-${randomUUID()}`;
  function market(date: string, factor = 1): MarketInput {
    return {
      targetDate: date, observedAt: `${date}T21:00:00.000Z`, actions: [],
      candidates: UNIVERSE.map((business, i) => ({
        ...business, price: 100 * factor, bookValue: 100, priceToBook: 0.5 + i / 10,
        priceDate: date, bookDate: `${date.slice(0, 4)}-06-30`, observedAt: `${date}T21:00:00.000Z`,
        status: "eligible", reason: null, rank: null, selected: false,
      })),
      prices: Object.fromEntries(UNIVERSE.map((business) => [business.ticker, { [date]: 100 * factor }])),
    };
  }
  try {
    const stateAtOpen = { ...initialModelState("2026-10-26"), inceptionPriceBasis: "open" as const };
    await db.insert(modelPortfoliosTable).values({ slug, state: stateAtOpen });
    const inception = market("2026-10-26");
    inception.opening = { date: "2026-10-26", prices: Object.fromEntries(UNIVERSE.map((b) => [b.ticker, 100])), candidates: inception.candidates };
    await Promise.all([commitModelMarket(inception, slug), commitModelMarket(inception, slug)]);
    const [first] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    assert.equal((first.state as ModelState).positions.length, 3);
    assert.equal((first.state as ModelState).positions[0].costBasis, 10_000);
    let events = await db.select().from(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, slug));
    assert.equal(events.filter((event) => event.type === "inception").length, 1);
    assert.equal(events.filter((event) => event.type === "buy").length, 3);
    const gap = market("2026-10-27");
    delete gap.prices["BRK.A"]["2026-10-27"];
    gap.actions = [{ ticker: "BRK.A", date: "2026-10-27", type: "dividend", value: 1 }];
    await commitModelMarket(gap, slug);
    const recovery = market("2026-10-28");
    recovery.actions = gap.actions;
    for (const [ticker, series] of Object.entries(gap.prices)) Object.assign(recovery.prices[ticker], series);
    await commitModelMarket(recovery, slug);
    const [recovered] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    assert.equal((recovered.state as ModelState).processedDate, "2026-10-28");
    assert.equal((recovered.state as ModelState).cash, 100);
    assert.deepEqual((recovered.state as ModelState).valuationGaps, ["2026-10-27"]);
    await Promise.all([
      commitModelMarket(market("2027-10-26", 2), slug),
      commitModelMarket(market("2027-10-26", 2), slug),
    ]);
    const [after] = await db.select().from(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    const state = after.state as ModelState;
    assert.equal(state.inceptionDate, "2026-10-26");
    assert.equal(state.nextRebalanceDate, "2028-10-26");
    assert.ok(Math.abs(state.positions[0].costBasis - 60_100 / 3) < 1e-8);
    events = await db.select().from(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, slug));
    assert.equal(events.filter((event) => event.type === "rebalance").length, 1);
    assert.equal(events.filter((event) => event.type === "dividend").length, 1);
    const snapshots = await db.select().from(modelPortfolioSnapshotsTable).where(eq(modelPortfolioSnapshotsTable.slug, slug));
    assert.equal(snapshots.length, 3);
    // Retrying after a simulated restart cannot add holdings or ledger entries.
    await commitModelMarket(market("2027-10-26", 2), slug);
    const retryEvents = await db.select().from(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, slug));
    assert.equal(retryEvents.length, events.length);
  } finally {
    await db.delete(modelPortfolioSnapshotsTable).where(eq(modelPortfolioSnapshotsTable.slug, slug));
    await db.delete(modelPortfolioEventsTable).where(eq(modelPortfolioEventsTable.slug, slug));
    await db.delete(modelPortfoliosTable).where(eq(modelPortfoliosTable.slug, slug));
    await pool.end();
  }
});
