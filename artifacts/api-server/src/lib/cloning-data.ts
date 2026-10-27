import { db, hedgeFundsTable, sec13fFilingsTable, sec13fHoldingsTable } from "@workspace/db";
import { eq, gte, inArray } from "drizzle-orm";
import { canonicalTicker, type CloneFiling } from "./cloning-selection";

export async function loadCloningFilings(periods?: string[]): Promise<CloneFiling[]> {
  const filings = await db.select({
    id: sec13fFilingsTable.id, fundCik: sec13fFilingsTable.fundCik,
    manager: hedgeFundsTable.name, reportDate: sec13fFilingsTable.reportDate,
    filingDate: sec13fFilingsTable.filingDate, accession: sec13fFilingsTable.accessionNumber,
    total: sec13fFilingsTable.totalValueThousands,
  }).from(sec13fFilingsTable).innerJoin(hedgeFundsTable, eq(hedgeFundsTable.cik, sec13fFilingsTable.fundCik))
    .where(periods ? inArray(sec13fFilingsTable.reportDate, periods) : gte(sec13fFilingsTable.reportDate, "2016-03-31"));
  const rows = await db.select({
    filingId: sec13fHoldingsTable.filingId, ticker: sec13fHoldingsTable.ticker,
    name: sec13fHoldingsTable.name, cusip: sec13fHoldingsTable.cusip,
    shares: sec13fHoldingsTable.shares, value: sec13fHoldingsTable.marketValueThousands,
  }).from(sec13fHoldingsTable).innerJoin(sec13fFilingsTable, eq(sec13fFilingsTable.id, sec13fHoldingsTable.filingId))
    .where(periods ? inArray(sec13fFilingsTable.reportDate, periods) : gte(sec13fFilingsTable.reportDate, "2016-03-31"));
  const byId = new Map<number, CloneFiling>(filings.map((f) => [f.id, { ...f, holdings: [] }]));
  for (const row of rows) {
    byId.get(row.filingId)?.holdings.push({ ...row, ticker: row.ticker ? canonicalTicker(row.ticker) : null });
  }
  return [...byId.values()];
}
