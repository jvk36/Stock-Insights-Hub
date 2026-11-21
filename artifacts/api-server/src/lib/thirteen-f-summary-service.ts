import { db, hedgeFundsTable, sec13fFilingsTable, sec13fHoldingsTable } from "@workspace/db";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import type { ThirteenFSummary, ThirteenFTickerOwnership } from "@workspace/api-zod";
import { build13fSummary, canonicalTicker, precedingQuarter, type SummaryFiling } from "./thirteen-f-summary-engine";
import { loadTickerMappings } from "./cusip-ticker-store";
import { project13fHoldings } from "./cusip-resolution-policy";

type SnapshotCache = {
  cached: { at: number; data: ThirteenFSummary } | null;
  pending: Promise<ThirteenFSummary> | null;
};
const summaryCache: SnapshotCache = { cached: null, pending: null };
const ownershipCache: SnapshotCache = { cached: null, pending: null };

async function calculate(positionLimit: number): Promise<ThirteenFSummary> {
  // One consistent read snapshot while the background importer commits filings.
  return db.transaction(async tx => {
    const funds = await tx.select({
      cik: hedgeFundsTable.cik, name: hedgeFundsTable.name, slug: hedgeFundsTable.slug,
    }).from(hedgeFundsTable).orderBy(hedgeFundsTable.name);
    const [latest] = await tx.select({ date: sql<string | null>`max(${sec13fFilingsTable.reportDate})` })
      .from(sec13fFilingsTable).innerJoin(hedgeFundsTable, eq(hedgeFundsTable.cik, sec13fFilingsTable.fundCik));
    const latestDate = latest?.date ?? null;
    if (!latestDate) return build13fSummary(funds, [], null);
    const filings = await tx.select().from(sec13fFilingsTable).where(and(
      inArray(sec13fFilingsTable.reportDate, [latestDate, precedingQuarter(latestDate)]),
      exists(tx.select({ id: sec13fHoldingsTable.id }).from(sec13fHoldingsTable)
        .where(eq(sec13fHoldingsTable.filingId, sec13fFilingsTable.id))),
    ));
    if (!filings.length) return build13fSummary(funds, [], latestDate);
    const holdings = await tx.select().from(sec13fHoldingsTable)
      .where(inArray(sec13fHoldingsTable.filingId, filings.map(f => f.id)));
    const byFiling = new Map<number, SummaryFiling>();
    for (const f of filings) byFiling.set(f.id, {
      id: f.id, fundCik: f.fundCik, reportDate: f.reportDate,
      filingDate: f.filingDate, totalValue: f.totalValueThousands * 1000, holdings: [],
    });
    const mappings = await loadTickerMappings(holdings.map(h => h.cusip), tx);
    const grouped = new Map<number, typeof holdings>();
    for (const h of holdings) {
      const rows = grouped.get(h.filingId) ?? [];
      rows.push(h); grouped.set(h.filingId, rows);
    }
    for (const [id, rows] of grouped) {
      for (const h of project13fHoldings(rows, mappings)) byFiling.get(id)?.holdings.push({
        name: h.name, ticker: h.ticker, cusip: h.cusip, shares: h.shares,
        marketValue: h.marketValueThousands * 1000,
      });
    }
    return build13fSummary(funds, [...byFiling.values()], latestDate, undefined, positionLimit);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

async function getSnapshot(cache: SnapshotCache, positionLimit: number): Promise<ThirteenFSummary> {
  if (cache.cached && Date.now() - cache.cached.at < 60_000) return cache.cached.data;
  if (!cache.pending) cache.pending = calculate(positionLimit).then(data => {
    cache.cached = { at: Date.now(), data };
    return data;
  }).finally(() => { cache.pending = null; });
  return cache.pending;
}

export function get13fSummary(): Promise<ThirteenFSummary> {
  return getSnapshot(summaryCache, 100);
}

export async function get13fTickerOwnership(ticker: string): Promise<ThirteenFTickerOwnership> {
  // Unlike the summary rankings, a ticker drill-down must include positions
  // below rank 100 when the original manager's full filing is stored.
  // Import-time Miscellaneous limits still apply; those positions stay unknown.
  const data = await getSnapshot(ownershipCache, Number.POSITIVE_INFINITY);
  return {
    ticker, quarter: data.quarter, previousQuarter: data.previousQuarter,
    trackedFundCount: data.trackedFundCount, reportingFundCount: data.reportingFundCount,
    comparisonFundCount: data.comparisonFundCount, pendingFunds: data.pendingFunds,
    positions: data.positions.filter(p => canonicalTicker(p.ticker) === ticker),
    generatedAt: data.generatedAt,
  };
}
