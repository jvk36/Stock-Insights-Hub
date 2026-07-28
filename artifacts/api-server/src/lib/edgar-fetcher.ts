/**
 * SEC EDGAR 13F fetcher + CUSIP resolver + quarterly refresh scheduler.
 *
 * Strategy: fetch the full EDGAR submission text file
 * (https://www.sec.gov/Archives/edgar/data/{cik}/{accession}.txt)
 * which packages ALL filing documents in one SGML envelope. This avoids
 * the individual per-file CDN paths that are rate-limited on cloud IPs.
 */

import * as cheerio from "cheerio";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  hedgeFundsTable,
  sec13fFilingsTable,
  sec13fHoldingsTable,
  cusipTickerMapTable,
} from "@workspace/db";
import { logger } from "./logger";
import YahooFinance from "yahoo-finance2";

const _yf = new YahooFinance();

// US exchange codes used by Yahoo Finance search results
const US_EXCHANGES = new Set(["NYQ", "NMS", "PCX", "NGM", "NCM", "BTS", "NYSEArca"]);

// Hardcoded overrides for CUSIPs whose SEC names are too ambiguous to search reliably
const CUSIP_TICKER_OVERRIDES: Record<string, string> = {
  "060505104": "BAC",   // "BANK AMER/BANK AMERICA CORP" — missing "of" in SEC name
  "H1467J104": "CB",   // "CHUBB LTD SWITZ" — Yahoo returns foreign listings before NYSE
  "023135106": "AMZN", // "AMAZON COM INC" — Yahoo returns AMZN.SN (Chilean) first
  "548661107": "LOW",  // "LOWES COS INC" — Yahoo returns LOWE.VI (Vienna) first
  "G6564A105": "NOMD", // "NOMAD FOODS LTD" — Yahoo returns 0NH.F (Frankfurt) first
  "812215200": "SEG",  // "SEAPORT ENTMT GROUP INC" — 2024 HHH spinoff, not yet searchable
};

/**
 * Normalise an SEC 13F company name for better Yahoo Finance search matching.
 * Expands common abbreviations and strips geographic/class suffixes.
 */
function normalizeSecName(name: string): string {
  const abbrevs: Array<[RegExp, string]> = [
    [/\bFINL\b/gi,   "Financial"],
    [/\bPETE\b/gi,   "Petroleum"],
    [/\bHLDGS\b/gi,  "Holdings"],
    [/\bHLDG\b/gi,   "Holding"],
    [/\bAMER\b/gi,   "American"],
    [/\bINTL\b/gi,   "International"],
    [/\bCENTY\b/gi,  "Century"],
    [/\bCOMM\b/gi,   "Communications"],
    [/\bSVCS\b/gi,   "Services"],
    [/\bTECH\b/gi,   "Technologies"],
    [/\bGRP\b/gi,    "Group"],
    [/\bSYS\b/gi,    "Systems"],
    [/\bMGMT\b/gi,   "Management"],
    [/\bMFG\b/gi,    "Manufacturing"],
    [/\bENTMT\b/gi,  "Entertainment"],
    [/\bENT\b/gi,    "Entertainment"],
    [/\bINS\b/gi,    "Insurance"],
    [/\bBK\b/gi,     "Bank"],
  ];

  let result = name;
  for (const [pattern, replacement] of abbrevs) {
    result = result.replace(pattern, replacement);
  }

  // Strip trailing geographic indicators, bond descriptors, and share-class suffixes
  result = result
    .replace(/\s+(SWITZ|DEL|NJ|NY|DE|IRL|CAYMAN)\s*$/i, "")
    .replace(/\s+MTN\s+BE\s*$/i, "")
    .replace(/\s+\bBE\b\s*$/i, "")
    .replace(/\s+NEW\s*$/i, "")       // "HEICO CORP NEW" → "HEICO CORP" (new share class)
    .replace(/\s+\b[A-Z]\s*$/,  "")  // "CHARTER INC N" → "CHARTER INC" (single-letter class)
    .trim();

  return result;
}

// ─── SEC EDGAR headers (required by SEC fair-access policy) ──────────────────

const SEC_HEADERS = {
  "User-Agent": "StockResearchPlatform research@stockresearch.app",
  "Accept-Encoding": "gzip, deflate",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Quarter label helpers ────────────────────────────────────────────────────

/** Converts a YYYY-MM-DD report date to "Q1 2026" format. */
export function reportDateToQuarter(reportDate: string): string {
  const [year, month] = reportDate.split("-").map(Number);
  if (!year || !month) return reportDate;
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `Q${q} ${year}`;
}

// ─── CUSIP → Ticker via Yahoo Finance name search ────────────────────────────

async function resolveWithYahooSearch(
  cusipNames: Map<string, string>,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (cusipNames.size === 0) return result;

  for (const [cusip, rawName] of cusipNames) {
    const name = normalizeSecName(rawName);
    try {
      // validateResult: false bypasses the stale yahoo-finance2 v3 schema that
      // rejects 'Equity' typeDisp (expects lowercase 'equity') — data is correct
      const resp = await (_yf as any).search(
        name,
        { quotesCount: 10, newsCount: 0 },
        { validateResult: false },
      );
      const quotes = (resp?.quotes ?? []) as Array<{
        symbol?: string;
        quoteType?: string;
        exchange?: string;
      }>;
      // Prefer: (1) US exchange, (2) symbol without dot (US tickers rarely have dots),
      // (3) any equity — fallback for foreign listings
      const usEquity = quotes.find(
        (q) => q.quoteType === "EQUITY" && q.exchange && US_EXCHANGES.has(q.exchange),
      );
      const noSuffixEquity = quotes.find(
        (q) => q.quoteType === "EQUITY" && q.symbol && !q.symbol.includes("."),
      );
      const anyEquity = quotes.find((q) => q.quoteType === "EQUITY");
      result.set(cusip, (usEquity ?? noSuffixEquity ?? anyEquity)?.symbol ?? null);
    } catch {
      result.set(cusip, null);
    }
    await sleep(250); // ~4 req/sec — polite to Yahoo Finance
  }

  return result;
}

async function resolveCusips(
  cusipNames: Map<string, string>,
): Promise<Map<string, string | null>> {
  const allCusips = [...cusipNames.keys()];
  const result = new Map<string, string | null>();
  if (allCusips.length === 0) return result;

  // Apply hardcoded overrides first (for CUSIPs whose SEC names are unfixable)
  const overrideRows: Array<{ cusip: string; ticker: string; source: string }> = [];
  for (const cusip of allCusips) {
    const override = CUSIP_TICKER_OVERRIDES[cusip];
    if (override) {
      result.set(cusip, override);
      overrideRows.push({ cusip, ticker: override, source: "override" });
    }
  }
  for (const row of overrideRows) {
    try {
      await db.insert(cusipTickerMapTable)
        .values({ cusip: row.cusip, ticker: row.ticker, source: row.source })
        .onConflictDoUpdate({ target: cusipTickerMapTable.cusip, set: { ticker: row.ticker, source: row.source } });
    } catch { /* ignore */ }
  }

  const cached = await db
    .select()
    .from(cusipTickerMapTable)
    .where(inArray(cusipTickerMapTable.cusip, allCusips));

  // Only treat *positive* ticker hits as cached — null (not_found) entries are retried
  for (const row of cached) {
    if (row.ticker !== null) result.set(row.cusip, row.ticker);
  }
  const uncachedMap = new Map<string, string>();
  for (const c of allCusips) {
    if (!result.has(c)) uncachedMap.set(c, cusipNames.get(c)!);
  }

  if (uncachedMap.size > 0) {
    const resolved = await resolveWithYahooSearch(uncachedMap);
    const rows = [...resolved.entries()].map(([cusip, ticker]) => ({
      cusip,
      ticker: ticker ?? null,
      source: ticker ? "yahoo_search" : "not_found",
    }));
    if (rows.length > 0) {
      for (const row of rows) {
        try {
          if (row.ticker) {
            // Positive result: upsert, overwriting any previous not_found entry
            await db
              .insert(cusipTickerMapTable)
              .values({ cusip: row.cusip, ticker: row.ticker, source: row.source })
              .onConflictDoUpdate({
                target: cusipTickerMapTable.cusip,
                set: { ticker: row.ticker, source: row.source },
              });
          } else {
            // Null result: only insert if not already there (never overwrite a good ticker)
            await db
              .insert(cusipTickerMapTable)
              .values({ cusip: row.cusip, ticker: null, source: "not_found" })
              .onConflictDoNothing();
          }
        } catch { /* ignore */ }
      }
    }
    resolved.forEach((ticker, cusip) => result.set(cusip, ticker));
  }

  return result;
}

// ─── Retry unresolved tickers for existing holdings ──────────────────────────

export async function retryUnresolvedTickers(cik: string): Promise<void> {
  // Collect distinct CUSIP + name pairs from this fund's holdings
  const rows = await db
    .select({ cusip: sec13fHoldingsTable.cusip, name: sec13fHoldingsTable.name })
    .from(sec13fHoldingsTable)
    .innerJoin(sec13fFilingsTable, eq(sec13fHoldingsTable.filingId, sec13fFilingsTable.id))
    .where(eq(sec13fFilingsTable.fundCik, cik));

  const cusipNames = new Map<string, string>();
  for (const row of rows) {
    if (!cusipNames.has(row.cusip)) cusipNames.set(row.cusip, row.name);
  }
  if (cusipNames.size === 0) return;

  logger.info({ cik, total: cusipNames.size }, "Retrying ticker resolution for existing holdings");

  // resolveCusips: uses positive-ticker cache hits, calls Yahoo Finance search for the rest
  await resolveCusips(cusipNames);

  // Push resolved tickers from cusip_ticker_map back into sec_13f_holdings.
  // Also fixes previously stored foreign tickers (containing '.') that were later overridden.
  const result = await db.execute(sql`
    UPDATE sec_13f_holdings
    SET ticker = m.ticker
    FROM cusip_ticker_map m
    WHERE sec_13f_holdings.cusip = m.cusip
      AND m.ticker IS NOT NULL
      AND (sec_13f_holdings.ticker IS NULL OR sec_13f_holdings.ticker LIKE '%.%')
  `);
  logger.info({ cik, updated: (result as { rowCount?: number }).rowCount ?? 0 }, "Ticker re-resolution complete");
}

// ─── EDGAR XML parsing ────────────────────────────────────────────────────────

interface RawHolding {
  name: string;
  cusip: string;
  marketValueThousands: number;
  shares: number;
}

function parseInfoTable(xml: string): { holdings: RawHolding[]; computedTotalThousands: number } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const byName = new Map<string, RawHolding>();

  $("infoTable").each((_, el) => {
    const shPrn  = $(el).find("sshPrnamtType").text().trim().toUpperCase();
    const putCall = $(el).find("putCall").text().trim();
    if (shPrn !== "SH" || putCall !== "") return;

    const name   = $(el).find("nameOfIssuer").text().trim();
    const cusip  = $(el).find("cusip").text().trim();
    const value  = parseInt($(el).find("value").text().trim() || "0", 10);
    const shares = parseInt($(el).find("sshPrnamt").text().trim() || "0", 10);
    if (!name || !cusip) return;

    const existing = byName.get(name);
    if (existing) {
      existing.marketValueThousands += value;
      existing.shares += shares;
    } else {
      byName.set(name, { name, cusip, marketValueThousands: value, shares });
    }
  });

  const holdings = [...byName.values()];
  const computedTotalThousands = holdings.reduce((s, h) => s + h.marketValueThousands, 0);
  return { holdings, computedTotalThousands };
}

function parsePrimaryDocTotal(xml: string): number | null {
  const $ = cheerio.load(xml, { xmlMode: true });
  const t = parseInt($("tableValueTotal").first().text().trim(), 10);
  return isNaN(t) ? null : t;
}

// ─── EDGAR full submission text parser ───────────────────────────────────────

interface SubmissionDocs {
  primaryXml: string | null;
  infotableXml: string | null;
}

/**
 * Parses the EDGAR full submission text file (the single .txt envelope
 * that packages all filing documents).  Each document lives in a
 * <DOCUMENT>…</DOCUMENT> block; the actual content is between <TEXT> and
 * </TEXT> and may be further wrapped in <XML>…</XML>.
 */
function parseSubmissionText(raw: string): SubmissionDocs {
  let primaryXml: string | null = null;
  let infotableXml: string | null = null;

  // Split on <DOCUMENT> markers (case-insensitive for safety)
  const blocks = raw.split(/<DOCUMENT>/i).slice(1); // first chunk is the header

  for (const block of blocks) {
    const type        = /^<TYPE>(.*)/im.exec(block)?.[1]?.trim() ?? "";
    const description = /^<DESCRIPTION>(.*)/im.exec(block)?.[1]?.trim().toUpperCase() ?? "";

    // Extract content between <TEXT>…</TEXT>
    const textMatch = /<TEXT>([\s\S]*?)<\/TEXT>/i.exec(block);
    if (!textMatch) continue;
    let content = textMatch[1].trim();

    // Strip <XML>…</XML> wrapper when present
    const xmlWrap = /^<XML>([\s\S]*?)<\/XML>\s*$/i.exec(content);
    if (xmlWrap) content = xmlWrap[1].trim();

    if (!content) continue;

    const isInfoTable = description.includes("INFORMATION TABLE")
      || content.includes("<informationTable");
    const isPrimary   = type === "13F-HR"
      && (content.includes("<edgarSubmission") || content.includes("<tableValueTotal"));

    if (isInfoTable && !infotableXml) {
      infotableXml = content;
    } else if (isPrimary && !primaryXml) {
      primaryXml = content;
    }
  }

  return { primaryXml, infotableXml };
}

// ─── EDGAR API helpers ────────────────────────────────────────────────────────

/** Fetches a URL from SEC EDGAR with exponential-backoff retry on 503. */
async function secFetch(url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (res.status === 503 && attempt < 4) {
    const wait = [10_000, 20_000, 40_000, 60_000][attempt] ?? 60_000;
    logger.warn({ url, attempt, waitMs: wait }, "SEC EDGAR 503 — backing off");
    await sleep(wait);
    return secFetch(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`SEC EDGAR fetch failed ${res.status}: ${url}`);
  return res;
}

interface SubmissionsData {
  cik: string;
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      reportDate: string[];
      filingDate: string[];
      primaryDocument: string[];
    };
  };
}

function padCik(cik: string): string {
  return cik.replace(/^0+/, "").padStart(10, "0");
}

async function fetch13fFilingStubs(
  cik: string,
): Promise<Array<{ accessionNumber: string; reportDate: string; filingDate: string }>> {
  const url = `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;
  const res = await secFetch(url);
  const data = (await res.json()) as SubmissionsData;
  const { accessionNumber, form, reportDate, filingDate } = data.filings.recent;

  const stubs: Array<{ accessionNumber: string; reportDate: string; filingDate: string }> = [];
  for (let i = 0; i < form.length; i++) {
    if (form[i] === "13F-HR" && reportDate[i]) {
      stubs.push({
        accessionNumber: accessionNumber[i]!,
        reportDate: reportDate[i]!,
        filingDate: filingDate[i]!,
      });
    }
  }
  return stubs;
}

// ─── Core fetcher ─────────────────────────────────────────────────────────────

const MAX_QUARTERS = 40;

/** Delay between consecutive filing fetches (SEC fair-access policy). */
const FETCH_DELAY_MS = 3_000;

/**
 * Longer delay used during gap-fill retries to be gentler on the CDN
 * after it has already rate-limited us once.
 */
const GAP_RETRY_DELAY_MS = 8_000;

export async function seedFundFilings(cik: string): Promise<void> {
  logger.info({ cik }, "Starting 13F filing seed");

  const fund = await db.select().from(hedgeFundsTable).where(eq(hedgeFundsTable.cik, cik)).limit(1);
  if (fund.length === 0) {
    logger.warn({ cik }, "Fund not found in hedge_funds table — aborting");
    return;
  }

  const existing = await db
    .select({ accessionNumber: sec13fFilingsTable.accessionNumber })
    .from(sec13fFilingsTable)
    .where(eq(sec13fFilingsTable.fundCik, cik));
  const existingSet = new Set(existing.map((r) => r.accessionNumber));

  let stubs;
  try {
    stubs = await fetch13fFilingStubs(cik);
  } catch (err) {
    logger.error({ err, cik }, "Failed to fetch EDGAR submissions");
    return;
  }

  const toProcess = stubs
    .filter((s) => !existingSet.has(s.accessionNumber))
    .slice(0, MAX_QUARTERS);

  logger.info({ cik, total: stubs.length, toProcess: toProcess.length }, "13F stubs found");

  for (const stub of toProcess) {
    try {
      await processFiling(cik, stub);
      await sleep(FETCH_DELAY_MS);
    } catch (err) {
      logger.warn({ err, cik, accession: stub.accessionNumber }, "Failed to process filing — skipping");
      await sleep(FETCH_DELAY_MS);
    }
  }

  logger.info({ cik, processed: toProcess.length }, "13F seed complete");
}

/**
 * Gap-fill pass: after the initial seed, some filings may have been skipped
 * due to transient SEC 503 errors.  This function identifies two categories
 * of gaps and retries them with a longer inter-request delay:
 *
 *   1. Stubs present on EDGAR but entirely absent from our DB.
 *   2. Filing rows already in our DB but with zero associated holdings
 *      (the filing insert succeeded but the holdings fetch failed).
 *
 * We use a longer delay (GAP_RETRY_DELAY_MS) between requests to be gentler
 * on the CDN after it has already rate-limited us during seeding.
 */
export async function retryGapFilings(cik: string): Promise<void> {
  logger.info({ cik }, "Starting gap-fill retry pass for missing/empty filings");

  // 1. Fetch the canonical list of stubs from EDGAR
  let stubs: Array<{ accessionNumber: string; reportDate: string; filingDate: string }>;
  try {
    stubs = await fetch13fFilingStubs(cik);
  } catch (err) {
    logger.error({ err, cik }, "Gap-fill: failed to fetch EDGAR submission stubs");
    return;
  }

  // 2. Load all filing rows we have for this CIK
  const existingFilings = await db
    .select({ id: sec13fFilingsTable.id, accessionNumber: sec13fFilingsTable.accessionNumber })
    .from(sec13fFilingsTable)
    .where(eq(sec13fFilingsTable.fundCik, cik));

  const existingByAccession = new Map(existingFilings.map((f) => [f.accessionNumber, f.id]));

  // 3. Determine which filing IDs have at least one holding row
  const filingIds = existingFilings.map((f) => f.id);
  const filingIdsWithHoldings = new Set<number>();
  if (filingIds.length > 0) {
    const rows = await db
      .selectDistinct({ filingId: sec13fHoldingsTable.filingId })
      .from(sec13fHoldingsTable)
      .where(inArray(sec13fHoldingsTable.filingId, filingIds));
    for (const r of rows) filingIdsWithHoldings.add(r.filingId);
  }

  // 4. Build the gap list — stubs that are missing OR have empty holdings
  const gaps = stubs.filter((s) => {
    const filingId = existingByAccession.get(s.accessionNumber);
    if (filingId === undefined) return true;          // category 1: not in DB at all
    return !filingIdsWithHoldings.has(filingId);      // category 2: in DB but no holdings
  });

  if (gaps.length === 0) {
    logger.info({ cik }, "Gap-fill: no missing or empty filings found — nothing to retry");
    return;
  }

  logger.info({ cik, gaps: gaps.length }, "Gap-fill: retrying filings with missing/empty holdings");

  let recovered = 0;
  for (const stub of gaps) {
    try {
      await processFiling(cik, stub);
      recovered++;
      logger.info(
        { cik, accession: stub.accessionNumber, period: reportDateToQuarter(stub.reportDate) },
        "Gap-fill: filing recovered",
      );
    } catch (err) {
      logger.warn(
        { err, cik, accession: stub.accessionNumber },
        "Gap-fill: filing still failed after retry — will try again on next refresh",
      );
    }
    // Always wait between requests, even after failures, to stay within SEC rate limits
    await sleep(GAP_RETRY_DELAY_MS);
  }

  logger.info({ cik, recovered, totalGaps: gaps.length }, "Gap-fill retry pass complete");
}

async function processFiling(
  cik: string,
  stub: { accessionNumber: string; reportDate: string; filingDate: string },
): Promise<void> {
  const periodLabel = reportDateToQuarter(stub.reportDate);
  logger.info({ cik, period: periodLabel }, "Processing 13F filing");

  // Fetch the full submission text file — one request gets ALL documents
  const txtUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${stub.accessionNumber}.txt`;
  const res = await secFetch(txtUrl);
  const raw = await res.text();

  const { primaryXml, infotableXml } = parseSubmissionText(raw);

  if (!infotableXml) {
    logger.warn({ cik, period: periodLabel }, "Could not locate infotable in submission — skipping");
    return;
  }

  const { holdings, computedTotalThousands } = parseInfoTable(infotableXml);

  let totalValueThousands = computedTotalThousands;
  if (primaryXml) {
    const headerTotal = parsePrimaryDocTotal(primaryXml);
    if (headerTotal && headerTotal > 0) totalValueThousands = headerTotal;
  }

  if (holdings.length === 0) {
    logger.warn({ cik, period: periodLabel }, "No SH holdings found — skipping");
    return;
  }

  // Resolve CUSIPs → tickers (pass names so Yahoo Finance search can be used)
  const tickerMap = await resolveCusips(new Map(holdings.map((h) => [h.cusip, h.name])));

  // Upsert filing record
  const [filing] = await db
    .insert(sec13fFilingsTable)
    .values({
      fundCik: cik,
      periodLabel,
      reportDate: stub.reportDate,
      filingDate: stub.filingDate,
      accessionNumber: stub.accessionNumber,
      totalValueThousands,
    })
    .onConflictDoUpdate({
      target: sec13fFilingsTable.accessionNumber,
      set: { totalValueThousands },
    })
    .returning();

  if (!filing) {
    logger.error({ cik, period: periodLabel }, "Failed to upsert filing record");
    return;
  }

  // Upsert holdings in chunks
  const holdingRows = holdings.map((h) => ({
    filingId: filing.id,
    name: h.name,
    ticker: tickerMap.get(h.cusip) ?? null,
    cusip: h.cusip,
    marketValueThousands: h.marketValueThousands,
    shares: h.shares,
  }));

  const CHUNK = 50;
  for (let i = 0; i < holdingRows.length; i += CHUNK) {
    const chunk = holdingRows.slice(i, i + CHUNK);
    for (const row of chunk) {
      try {
        await db.insert(sec13fHoldingsTable).values(row).onConflictDoNothing();
      } catch { /* ignore */ }
    }
  }

  logger.info({ cik, period: periodLabel, holdings: holdings.length }, "13F filing processed");
}

// ─── Quarterly refresh scheduler ──────────────────────────────────────────────

/**
 * Returns true during the 13F filing window: days 25–46 after each quarter end.
 *
 * Quarter ends → approximate filing window:
 *   Q1 (Mar 31) → Apr 25 – May 16
 *   Q2 (Jun 30) → Jul 25 – Aug 15
 *   Q3 (Sep 30) → Oct 25 – Nov 15
 *   Q4 (Dec 31) → Jan 25 – Feb 15
 *
 * Funds must file within 45 days of quarter end; most file between day 30–45.
 * Polling every 3 days during this window gives ~7 checks per quarter.
 */
function isInFilingWindow(): boolean {
  const now   = new Date();
  const month = now.getUTCMonth() + 1; // 1-based
  const day   = now.getUTCDate();

  // (month, firstDay, lastDay) tuples for each quarter's filing window
  const windows: Array<[number, number, number]> = [
    [2,  1, 15],  // Q4 filing: Feb 1–15
    [4, 25, 30],  // Q1 filing: Apr 25–30
    [5,  1, 16],  // Q1 filing cont: May 1–16
    [7, 25, 31],  // Q2 filing: Jul 25–31
    [8,  1, 15],  // Q2 filing cont: Aug 1–15
    [10, 25, 31], // Q3 filing: Oct 25–31
    [11,  1, 15], // Q3 filing cont: Nov 1–15
    [1,  25, 31], // Q4 filing: Jan 25–31
  ];
  return windows.some(([m, from, to]) => month === m && day >= from && day <= to);
}

// Master list of tracked funds — add new entries here to register a fund.
// The startup sequence and the 12-hour scheduler iterate this list automatically.
const TRACKED_FUNDS = [
  { cik: "1067983", name: "Berkshire Hathaway",              slug: "berkshire-hathaway"   },
  { cik: "1336528", name: "Pershing Square Capital Mgmt",    slug: "pershing-square"       },
] as const;

export async function initEdgarFetcher(): Promise<void> {
  // Upsert all tracked funds into the DB (name/slug may change but CIK is stable)
  for (const fund of TRACKED_FUNDS) {
    await db
      .insert(hedgeFundsTable)
      .values(fund)
      .onConflictDoUpdate({
        target: hedgeFundsTable.cik,
        set: { name: fund.name, slug: fund.slug },
      });
  }

  // Seed every fund on startup after a brief delay, then gap-fill and re-resolve
  // tickers for any holdings that had null tickers from prior runs.
  setTimeout(async () => {
    const funds = await db.select().from(hedgeFundsTable);
    for (const fund of funds) {
      try {
        await seedFundFilings(fund.cik);
      } catch (err) {
        logger.error({ err, cik: fund.cik }, "Initial 13F seed failed");
      }
      retryGapFilings(fund.cik).catch((err) =>
        logger.error({ err, cik: fund.cik }, "Initial gap-fill retry pass failed"),
      );
      retryUnresolvedTickers(fund.cik).catch((err) =>
        logger.error({ err, cik: fund.cik }, "Initial ticker re-resolution failed"),
      );
    }
  }, 3_000);

  // Check every 3 days; only do real work during the ~6-week filing window
  // that follows each quarter end (~7 actual SEC queries per quarter per fund).
  setInterval(async () => {
    if (!isInFilingWindow()) {
      logger.info("13F refresh check: outside filing window, skipping");
      return;
    }
    logger.info("13F refresh check: inside filing window — refreshing all funds");
    const funds = await db.select().from(hedgeFundsTable);
    for (const fund of funds) {
      try {
        await seedFundFilings(fund.cik);
      } catch (err) {
        logger.error({ err, cik: fund.cik }, "Scheduled 13F refresh failed");
      }
      await retryGapFilings(fund.cik).catch((err) =>
        logger.error({ err, cik: fund.cik }, "Scheduled gap-fill retry pass failed"),
      );
    }
  }, 3 * 24 * 60 * 60 * 1000);

  logger.info("EDGAR fetcher initialized");
}
