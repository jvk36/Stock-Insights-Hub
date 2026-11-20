import { db, cusipTickerMapTable, sec13fHoldingsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";
import { logger } from "./logger";
import {
  VERIFIED_SEARCH_SOURCE, isNonStockPosition, selectVerifiedStock,
  type SecurityMapping, type SecurityQuote,
} from "./thirteen-f-security-policy";

let cached: { at: number; mappings: Map<string, SecurityMapping> } | null = null;
let pending: Promise<Map<string, SecurityMapping>> | null = null;
let audit: Promise<void> | null = null;

export async function get13fSecurityMappings(): Promise<Map<string, SecurityMapping>> {
  if (cached && Date.now() - cached.at < 60_000) return cached.mappings;
  if (!pending) pending = db.select().from(cusipTickerMapTable).then(rows => {
    const mappings = new Map(rows.map(row => [row.cusip.toUpperCase(), { ticker: row.ticker, source: row.source }]));
    cached = { at: Date.now(), mappings };
    return mappings;
  }).finally(() => { pending = null; });
  return pending;
}

/** Upgrade old first-result search matches once; original filing rows remain intact. */
export function auditLegacy13fMappings(): Promise<void> {
  if (audit) return audit;
  audit = runAudit().finally(() => { audit = null; });
  return audit;
}

async function runAudit(): Promise<void> {
  const legacy = await db.select().from(cusipTickerMapTable)
    .where(inArray(cusipTickerMapTable.source, ["yahoo_search", "override", "manual", "openfigi"]));
  if (!legacy.length) return;
  const names = await db.selectDistinct({ cusip: sec13fHoldingsTable.cusip, name: sec13fHoldingsTable.name })
    .from(sec13fHoldingsTable);
  const byCusip = new Map<string, string[]>();
  for (const row of names) {
    const list = byCusip.get(row.cusip) ?? [];
    list.push(row.name); byCusip.set(row.cusip, list);
  }
  const symbols = [...new Set(legacy.map(row => row.ticker).filter((ticker): ticker is string => !!ticker))];
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  let verified = 0, rejected = 0;
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50);
    let quotes: SecurityQuote[];
    try {
      quotes = await yf.quote(batch, {}, { validateResult: false }) as SecurityQuote[];
    } catch (err) {
      // Provider failure is not evidence that a previously stored security is wrong.
      logger.warn({ err, batch: i / 50 }, "13F mapping audit batch unavailable; will retry later");
      continue;
    }
    const bySymbol = new Map(quotes.map(quote => [quote.symbol, quote]));
    for (const row of legacy.filter(row => row.ticker && batch.includes(row.ticker))) {
      const issuerNames = byCusip.get(row.cusip) ?? [];
      const quote = bySymbol.get(row.ticker!);
      const isStock = issuerNames.length > 0 && !issuerNames.some(name => isNonStockPosition({ name, cusip: row.cusip }));
      // Curated historical mappings may refer to a renamed/delisted issuer.
      // Retain those identities, but never allow a confirmed ETF/fund quote.
      if (row.source !== "yahoo_search") {
        if ((issuerNames.length > 0 && !isStock) || (quote?.quoteType && quote.quoteType !== "EQUITY")) {
          await db.update(cusipTickerMapTable).set({ source: "non_stock_v2" })
            .where(and(eq(cusipTickerMapTable.cusip, row.cusip), eq(cusipTickerMapTable.source, row.source)));
          rejected++;
        }
        continue;
      }
      const valid = isStock && !!quote && issuerNames.some(name => selectVerifiedStock(name, [quote]) === row.ticker);
      await db.update(cusipTickerMapTable).set({
        source: valid ? VERIFIED_SEARCH_SOURCE : "unverified_v2",
      }).where(and(eq(cusipTickerMapTable.cusip, row.cusip), eq(cusipTickerMapTable.source, "yahoo_search")));
      if (valid) verified++; else rejected++;
    }
    cached = null;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  logger.info({ verified, rejected }, "Completed legacy 13F ticker name validation");
}
