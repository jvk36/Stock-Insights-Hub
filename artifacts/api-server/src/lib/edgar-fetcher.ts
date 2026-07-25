/**
 * SEC EDGAR 13F fetcher + CUSIP resolver + quarterly refresh scheduler.
 *
 * Fetches 13F-HR filings from SEC EDGAR for tracked hedge funds,
 * parses the XML infotable, resolves CUSIP codes to ticker symbols via
 * OpenFIGI, and persists everything to PostgreSQL via Drizzle.
 *
 * Refresh schedule: runs at server startup and then checks every 12 hours.
 * Real fetching only happens in the 5-day windows after each quarter's
 * 13F publication deadline: May 15-20, Aug 15-20, Nov 15-20, Feb 15-20.
 */

import * as cheerio from "cheerio";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  hedgeFundsTable,
  sec13fFilingsTable,
  sec13fHoldingsTable,
  cusipTickerMapTable,
} from "@workspace/db";
import { logger } from "./logger";

// ─── SEC EDGAR User-Agent (required by SEC policy) ───────────────────────────

const SEC_HEADERS = {
  "User-Agent": "StockResearchPlatform research@stockresearch.app",
  "Accept-Encoding": "gzip, deflate",
};

// ─── Quarter label helpers ────────────────────────────────────────────────────

/** Converts a YYYY-MM-DD report date to "Q1 2026" format. */
export function reportDateToQuarter(reportDate: string): string {
  const [year, month] = reportDate.split("-").map(Number);
  if (!year || !month) return reportDate;
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `Q${q} ${year}`;
}

// ─── CUSIP → Ticker via OpenFIGI ─────────────────────────────────────────────

interface FigiMapping {
  data?: Array<{ ticker?: string; exchCode?: string }>;
  error?: string;
}

/** Resolves a batch of CUSIPs to tickers using the OpenFIGI API.
 *  OpenFIGI is free with no API key needed (25 req/min limit). */
async function resolveWithOpenFigi(
  cusips: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (cusips.length === 0) return result;

  // Chunk into batches of 100 (OpenFIGI limit)
  const BATCH = 100;
  for (let i = 0; i < cusips.length; i += BATCH) {
    const batch = cusips.slice(i, i + BATCH);
    const body = batch.map((cusip) => ({ idType: "ID_CUSIP", idValue: cusip }));
    try {
      const res = await fetch("https://api.openfigi.com/v3/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, "OpenFIGI batch request failed");
        batch.forEach((c) => result.set(c, null));
        continue;
      }
      const mappings: FigiMapping[] = await res.json() as FigiMapping[];
      mappings.forEach((m, idx) => {
        const cusip = batch[idx]!;
        if (m.error || !m.data || m.data.length === 0) {
          result.set(cusip, null);
        } else {
          // Prefer US-listed equities
          const usEntry = m.data.find(
            (d) => d.exchCode && ["US", "UN", "UA", "UW", "UM"].includes(d.exchCode),
          );
          const entry = usEntry ?? m.data[0];
          result.set(cusip, entry?.ticker ?? null);
        }
      });
    } catch (err) {
      logger.warn({ err }, "OpenFIGI batch request threw");
      batch.forEach((c) => result.set(c, null));
    }
    // Be polite to OpenFIGI: 25 req/min → ~2.4s between batches
    if (i + BATCH < cusips.length) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  return result;
}

/** Looks up (and caches) tickers for the given CUSIPs. */
async function resolveCusips(cusips: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(cusips)];
  const result = new Map<string, string | null>();

  // 1. Check DB cache
  const cached = await db
    .select()
    .from(cusipTickerMapTable)
    .where(inArray(cusipTickerMapTable.cusip, unique));

  const uncached: string[] = [];
  for (const row of cached) {
    result.set(row.cusip, row.ticker ?? null);
  }
  for (const c of unique) {
    if (!result.has(c)) uncached.push(c);
  }

  // 2. Resolve uncached via OpenFIGI
  if (uncached.length > 0) {
    const resolved = await resolveWithOpenFigi(uncached);
    // 3. Store in DB cache
    const rows = [...resolved.entries()].map(([cusip, ticker]) => ({
      cusip,
      ticker: ticker ?? null,
      source: ticker ? "openfigi" : "not_found",
    }));
    if (rows.length > 0) {
      await db
        .insert(cusipTickerMapTable)
        .values(rows)
        .onConflictDoUpdate({
          target: cusipTickerMapTable.cusip,
          set: { ticker: undefined, source: undefined, updatedAt: new Date() },
        })
        // Drizzle doesn't do computed set values easily – use raw
        .catch(() => {/* ignore cache write failures */});

      // Re-insert properly using a loop to avoid complex set expressions
      for (const row of rows) {
        try {
          await db
            .insert(cusipTickerMapTable)
            .values({ cusip: row.cusip, ticker: row.ticker, source: row.source })
            .onConflictDoNothing();
        } catch {
          // ignore
        }
      }
    }
    resolved.forEach((ticker, cusip) => result.set(cusip, ticker));
  }

  return result;
}

// ─── EDGAR XML parsing ────────────────────────────────────────────────────────

interface RawHolding {
  name: string;
  cusip: string;
  marketValueThousands: number;
  shares: number;
}

/** Parses a 13F Information Table XML string and returns filtered, deduplicated holdings. */
function parseInfoTable(xml: string): { holdings: RawHolding[]; computedTotalThousands: number } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const byName = new Map<string, RawHolding>();

  $("infoTable").each((_, el) => {
    const shPrn   = $(el).find("sshPrnamtType").text().trim().toUpperCase();
    const putCall  = $(el).find("putCall").text().trim();

    // Only keep SH (common stock) rows with no put/call designation
    if (shPrn !== "SH" || putCall !== "") return;

    const name  = $(el).find("nameOfIssuer").text().trim();
    const cusip = $(el).find("cusip").text().trim();
    const value = parseInt($(el).find("value").text().trim() || "0", 10);
    const shares = parseInt($(el).find("sshPrnamt").text().trim() || "0", 10);

    if (!name || !cusip) return;

    // Deduplicate by name (sum market value and shares)
    const existing = byName.get(name);
    if (existing) {
      existing.marketValueThousands += value;
      existing.shares += shares;
      // Keep the last seen CUSIP (consistent with SEC guidance)
    } else {
      byName.set(name, { name, cusip, marketValueThousands: value, shares });
    }
  });

  const holdings = [...byName.values()];
  const computedTotalThousands = holdings.reduce((sum, h) => sum + h.marketValueThousands, 0);
  return { holdings, computedTotalThousands };
}

/** Tries to extract tableValueTotal from the primary 13F-HR XML document. */
function parsePrimaryDocTotal(xml: string): number | null {
  const $ = cheerio.load(xml, { xmlMode: true });
  const totalText = $("tableValueTotal").first().text().trim();
  const total = parseInt(totalText, 10);
  return isNaN(total) ? null : total;
}

// ─── EDGAR API helpers ────────────────────────────────────────────────────────

async function secFetch(url: string): Promise<Response> {
  const res = await fetch(url, { headers: SEC_HEADERS });
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
    files?: Array<{ name: string; date: string; latestAt: string }>;
  };
}

/** Pads CIK to 10 digits as required by the EDGAR submissions API. */
function padCik(cik: string): string {
  return cik.replace(/^0+/, "").padStart(10, "0");
}

/** Fetches the list of 13F-HR filing stubs for a given CIK. */
async function fetch13fFilingStubs(
  cik: string,
): Promise<Array<{ accessionNumber: string; reportDate: string; filingDate: string; primaryDocument: string }>> {
  const url = `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;
  const res = await secFetch(url);
  const data = (await res.json()) as SubmissionsData;

  const { accessionNumber, form, reportDate, filingDate, primaryDocument } = data.filings.recent;

  const stubs: Array<{ accessionNumber: string; reportDate: string; filingDate: string; primaryDocument: string }> = [];
  for (let i = 0; i < form.length; i++) {
    if (form[i] === "13F-HR" && reportDate[i]) {
      stubs.push({
        accessionNumber: accessionNumber[i]!,
        reportDate: reportDate[i]!,
        filingDate: filingDate[i]!,
        primaryDocument: primaryDocument[i] ?? "",
      });
    }
  }

  // If there are older filings in separate files (for very old data), skip for now.
  // 10 years = 40 quarters is typically within the recent 1000 filing window.

  return stubs;
}

interface FilingDoc {
  description: string;
  filename: string;
  type: string;
}

/** Parses the filing index HTML page to find document links. */
async function getFilingDocs(cik: string, accessionNodash: string): Promise<FilingDoc[]> {
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNodash}/${accessionNodash}-index.htm`;
  const res = await secFetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const docs: FilingDoc[] = [];
  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;
    const description = $(cells[1]).text().trim();
    const link = $(cells[2]).find("a");
    const href = link.attr("href") ?? "";
    const filename = href.split("/").pop() ?? $(cells[2]).text().trim();
    const type = cells.length >= 4 ? $(cells[3]).text().trim() : "";
    if (filename) docs.push({ description, filename, type });
  });

  return docs;
}

/** Finds the infotable XML filename and (optionally) the primary doc filename from the filing index. */
function findXmlDocs(docs: FilingDoc[]): { infotable: string | null; primary: string | null } {
  let infotable: string | null = null;
  let primary: string | null = null;

  for (const doc of docs) {
    const desc = doc.description.toLowerCase();
    const name = doc.filename.toLowerCase();
    if (desc.includes("information table") || name.includes("infotable")) {
      infotable = doc.filename;
    } else if (
      !primary &&
      (doc.type === "13F-HR" || desc === "13f-hr" || name.includes("primary_doc"))
    ) {
      primary = doc.filename;
    }
  }

  // Fallback: try common filenames if not found
  if (!infotable) {
    const candidate = docs.find((d) =>
      d.filename.toLowerCase().endsWith(".xml") && d.filename !== primary,
    );
    infotable = candidate?.filename ?? null;
  }

  return { infotable, primary };
}

// ─── Core fetcher ─────────────────────────────────────────────────────────────

/** Maximum quarters to fetch per fund (10 years). */
const MAX_QUARTERS = 40;

/** Delay between consecutive filing fetches to avoid hammering SEC servers. */
const FETCH_DELAY_MS = 1500;

/**
 * Seeds (or refreshes) all 13F-HR filings for a given fund CIK.
 * Skips filings that already exist in the DB (idempotent).
 */
export async function seedFundFilings(cik: string): Promise<void> {
  logger.info({ cik }, "Starting 13F filing seed");

  // Ensure fund exists in DB
  const fund = await db
    .select()
    .from(hedgeFundsTable)
    .where(eq(hedgeFundsTable.cik, cik))
    .limit(1);
  if (fund.length === 0) {
    logger.warn({ cik }, "Fund not found in hedge_funds table, aborting seed");
    return;
  }

  // Get existing accession numbers to skip
  const existing = await db
    .select({ accessionNumber: sec13fFilingsTable.accessionNumber })
    .from(sec13fFilingsTable)
    .where(eq(sec13fFilingsTable.fundCik, cik));
  const existingSet = new Set(existing.map((r) => r.accessionNumber));

  // Fetch stub list from EDGAR
  let stubs;
  try {
    stubs = await fetch13fFilingStubs(cik);
  } catch (err) {
    logger.error({ err, cik }, "Failed to fetch EDGAR submissions");
    return;
  }

  // Limit to most recent MAX_QUARTERS
  const toProcess = stubs
    .filter((s) => !existingSet.has(s.accessionNumber))
    .slice(0, MAX_QUARTERS);

  logger.info({ cik, total: stubs.length, toProcess: toProcess.length }, "13F stubs found");

  for (const stub of toProcess) {
    try {
      await processFiling(cik, stub);
      // Polite delay between requests
      await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
    } catch (err) {
      logger.warn({ err, cik, accession: stub.accessionNumber }, "Failed to process filing — skipping");
    }
  }

  logger.info({ cik, processed: toProcess.length }, "13F seed complete");
}

async function processFiling(
  cik: string,
  stub: { accessionNumber: string; reportDate: string; filingDate: string; primaryDocument: string },
): Promise<void> {
  const accessionNodash = stub.accessionNumber.replace(/-/g, "");
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNodash}`;
  const periodLabel = reportDateToQuarter(stub.reportDate);

  logger.info({ cik, period: periodLabel }, "Processing 13F filing");

  // 1. Get document list
  const docs = await getFilingDocs(cik, accessionNodash);
  const { infotable: infotableFile, primary: primaryFile } = findXmlDocs(docs);

  if (!infotableFile) {
    logger.warn({ cik, period: periodLabel, docs: docs.map(d => d.filename) }, "Could not locate infotable XML — skipping");
    return;
  }

  // 2. Fetch infotable XML
  const infotableRes = await secFetch(`${baseUrl}/${infotableFile}`);
  const infotableXml = await infotableRes.text();
  await new Promise((r) => setTimeout(r, 500));

  const { holdings, computedTotalThousands } = parseInfoTable(infotableXml);

  // 3. Optionally fetch primary doc for total value
  let totalValueThousands = computedTotalThousands;
  if (primaryFile && primaryFile !== infotableFile) {
    try {
      const primaryRes = await secFetch(`${baseUrl}/${primaryFile}`);
      const primaryXml = await primaryRes.text();
      const headerTotal = parsePrimaryDocTotal(primaryXml);
      if (headerTotal && headerTotal > 0) totalValueThousands = headerTotal;
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Non-fatal; use computed total
    }
  }

  if (holdings.length === 0) {
    logger.warn({ cik, period: periodLabel }, "No SH holdings found in infotable — skipping");
    return;
  }

  // 4. Resolve CUSIPs to tickers
  const allCusips = holdings.map((h) => h.cusip);
  const tickerMap = await resolveCusips(allCusips);

  // 5. Upsert filing record
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

  // 6. Upsert holdings
  const holdingRows = holdings.map((h) => ({
    filingId: filing.id,
    name: h.name,
    ticker: tickerMap.get(h.cusip) ?? null,
    cusip: h.cusip,
    marketValueThousands: h.marketValueThousands,
    shares: h.shares,
  }));

  // Batch upsert in chunks of 50
  const CHUNK = 50;
  for (let i = 0; i < holdingRows.length; i += CHUNK) {
    const chunk = holdingRows.slice(i, i + CHUNK);
    await db
      .insert(sec13fHoldingsTable)
      .values(chunk)
      .onConflictDoUpdate({
        target: [sec13fHoldingsTable.filingId, sec13fHoldingsTable.name],
        set: {
          ticker: undefined,
          cusip: undefined,
          marketValueThousands: undefined,
          shares: undefined,
        },
      })
      .catch(() => {
        // Fallback: insert one by one ignoring conflicts
      });

    // Simpler approach for conflict handling
    for (const row of chunk) {
      try {
        await db.insert(sec13fHoldingsTable).values(row).onConflictDoNothing();
      } catch {
        // ignore
      }
    }
  }

  logger.info({ cik, period: periodLabel, holdings: holdings.length }, "13F filing processed");
}

// ─── Quarterly refresh scheduler ──────────────────────────────────────────────

/** Returns true if today (UTC) is within a 13F publication window.
 *  Windows: May 15-20, Aug 15-20, Nov 15-20, Feb 15-20 */
function isInRefreshWindow(): boolean {
  const now = new Date();
  const month = now.getUTCMonth() + 1; // 1-12
  const day   = now.getUTCDate();
  const publicationMonths = [2, 5, 8, 11];
  return publicationMonths.includes(month) && day >= 15 && day <= 20;
}

/** Seeds Berkshire and any other tracked funds at startup, then schedules
 *  periodic refresh checks every 12 hours. */
export async function initEdgarFetcher(): Promise<void> {
  // Ensure Berkshire Hathaway is in the hedge_funds table
  await db
    .insert(hedgeFundsTable)
    .values({ cik: "1067983", name: "Berkshire Hathaway", slug: "berkshire-hathaway" })
    .onConflictDoNothing();

  // Seed on startup (async, non-blocking)
  seedFundFilings("1067983").catch((err) =>
    logger.error({ err }, "Initial 13F seed failed"),
  );

  // Schedule periodic refresh checks
  const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
  setInterval(async () => {
    if (!isInRefreshWindow()) {
      logger.info("13F refresh check: not in publication window, skipping");
      return;
    }
    logger.info("13F refresh check: in publication window, checking for new filings");
    // Get all tracked funds
    const funds = await db.select().from(hedgeFundsTable);
    for (const fund of funds) {
      await seedFundFilings(fund.cik).catch((err) =>
        logger.error({ err, cik: fund.cik }, "Scheduled 13F refresh failed"),
      );
    }
  }, CHECK_INTERVAL_MS);

  logger.info("EDGAR fetcher initialized");
}
