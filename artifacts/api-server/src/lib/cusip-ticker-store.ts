import { db, cusipTickerMapTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { mapCusipsWithOpenFigi } from "./openfigi-resolver";
import {
  FIGI_AMBIGUOUS, FIGI_MATCHED, FIGI_UNMATCHED, VERIFIED_CUSIP_TICKERS,
  isTerminalUnmatched, isTrustedMapping, usTicker, type TickerMapping,
} from "./cusip-resolution-policy";

export async function loadTickerMappings(cusips: string[], executor: Pick<typeof db, "select"> = db): Promise<Map<string, TickerMapping>> {
  const keys = [...new Set(cusips.map(c => c.trim().toUpperCase()).filter(c => /^[A-Z0-9]{9}$/.test(c)))];
  if (!keys.length) return new Map();
  const rows = await executor.select().from(cusipTickerMapTable)
    .where(inArray(sql`upper(${cusipTickerMapTable.cusip})`, keys));
  // Prefer curated mappings over duplicate legacy mixed-case cache keys.
  const rank = (r: TickerMapping) => ["manual", "override"].includes(r.source) ? 2 : isTrustedMapping(r) ? 1 : 0;
  rows.sort((a, b) => rank(a) - rank(b) || a.updatedAt.getTime() - b.updatedAt.getTime());
  return new Map(rows.map(r => [r.cusip.trim().toUpperCase(), r]));
}

export async function resolveStoredCusips(cusipNames: Map<string, string>, overrides: Record<string, string>): Promise<Map<string, string | null>> {
  const keys = [...new Set([...cusipNames.keys()].map(c => c.trim().toUpperCase()).filter(c => /^[A-Z0-9]{9}$/.test(c)))];
  if (!keys.length) return new Map();
  const result = new Map<string, string | null>();
  const curated = new Map(Object.entries({ ...overrides, ...VERIFIED_CUSIP_TICKERS }).map(([c, t]) => [c.toUpperCase(), t]));
  const known = keys.filter(c => curated.has(c)).map(c => ({ cusip: c, ticker: curated.get(c)!, source: "override" }));
  if (known.length) {
    await db.insert(cusipTickerMapTable).values(known).onConflictDoUpdate({
      target: cusipTickerMapTable.cusip,
      set: { ticker: sql`excluded.ticker`, source: sql`excluded.source`, updatedAt: new Date() },
    });
    known.forEach(r => result.set(r.cusip, r.ticker));
  }
  const cached = await loadTickerMappings(keys);
  const jobs: string[] = [];
  for (const c of keys) {
    if (result.has(c)) continue;
    const mapping = cached.get(c);
    if (mapping && isTrustedMapping(mapping)) { result.set(c, mapping.ticker); continue; }
    if (isTerminalUnmatched(mapping) && mapping?.updatedAt && Date.now() - mapping.updatedAt.getTime() < 7 * 86400000) {
      result.set(c, null); continue;
    }
    // Existing un-suffixed historical symbols remain visible while verification
    // is pending. Never treat a temporary request failure as proof of no match.
    result.set(c, usTicker(mapping?.ticker));
    jobs.push(c);
  }
  const resolutions = await mapCusipsWithOpenFigi(jobs);
  const updates: { cusip: string; ticker: string | null; source: string }[] = [];
  let temporary = 0;
  for (const [cusip, resolution] of resolutions) {
    if (resolution.status === "temporary") { temporary++; continue; }
    const source = resolution.status === "matched" ? FIGI_MATCHED : resolution.status === "unmatched" ? FIGI_UNMATCHED : FIGI_AMBIGUOUS;
    result.set(cusip, resolution.ticker);
    updates.push({ cusip, ticker: resolution.ticker, source });
  }
  for (let i = 0; i < updates.length; i += 100) {
    await db.insert(cusipTickerMapTable).values(updates.slice(i, i + 100)).onConflictDoUpdate({
      target: cusipTickerMapTable.cusip,
      set: { ticker: sql`excluded.ticker`, source: sql`excluded.source`, updatedAt: new Date() },
      setWhere: sql`${cusipTickerMapTable.source} NOT IN ('manual', 'override')`,
    });
  }
  if (temporary) logger.warn({ count: temporary }, "OpenFIGI lookups pending after temporary errors; no positions consolidated");
  if (updates.length) logger.info({
    matched: updates.filter(r => r.ticker !== null).length,
    unmatched: updates.filter(r => r.ticker === null).length,
  }, "Completed exact CUSIP ticker matching");
  return new Map([...cusipNames.keys()].map(raw => [raw, result.get(raw.trim().toUpperCase()) ?? null]));
}

/** Copy only authoritative, exact-CUSIP corrections; never change values/shares
 * or delete raw constituents. A scope is mandatory to avoid a broad rewrite.
 */
export async function syncTickerMappings(scope: { cik: string } | { cusips: string[] }): Promise<number> {
  if ("cusips" in scope && !scope.cusips.length) return 0;
  const filter = "cik" in scope ? sql`f.fund_cik = ${scope.cik}` : inArray(sql`upper(h.cusip)`, scope.cusips);
  const result = await db.execute(sql`
    UPDATE sec_13f_holdings h SET ticker = m.ticker
    FROM cusip_ticker_map m, sec_13f_filings f
    WHERE h.filing_id = f.id AND upper(h.cusip) = m.cusip
      AND ${filter}
      AND m.source IN ('manual', 'override', 'openfigi', ${FIGI_MATCHED}, ${FIGI_UNMATCHED}, ${FIGI_AMBIGUOUS})
      AND (m.ticker IS NOT NULL OR m.source IN (${FIGI_UNMATCHED}, ${FIGI_AMBIGUOUS}))
      AND h.ticker IS DISTINCT FROM m.ticker
  `);
  return (result as { rowCount?: number }).rowCount ?? 0;
}
