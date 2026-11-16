import { db, hedgeFundsTable, sec13fFilingsTable, sec13fHoldingsTable } from "@workspace/db";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import type { ThirteenFSummary } from "@workspace/api-zod";
import { build13fSummary, precedingQuarter, type SummaryFiling } from "./thirteen-f-summary-engine";

let cached: { at: number; data: ThirteenFSummary } | null = null;
let pending: Promise<ThirteenFSummary> | null = null;

async function calculate(): Promise<ThirteenFSummary> {
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
    for (const h of holdings) byFiling.get(h.filingId)?.holdings.push({
      name: h.name, ticker: h.ticker, cusip: h.cusip, shares: h.shares,
      marketValue: h.marketValueThousands * 1000,
    });
    return build13fSummary(funds, [...byFiling.values()], latestDate);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function get13fSummary(): Promise<ThirteenFSummary> {
  if (cached && Date.now() - cached.at < 60_000) return cached.data;
  if (!pending) pending = calculate().then(data => {
    cached = { at: Date.now(), data };
    return data;
  }).finally(() => { pending = null; });
  return pending;
}
