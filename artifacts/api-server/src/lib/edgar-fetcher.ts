/**
 * SEC EDGAR 13F fetcher + CUSIP resolver + quarterly refresh scheduler.
 *
 * Strategy: fetch the full EDGAR submission text file
 * (https://www.sec.gov/Archives/edgar/data/{cik}/{accession}.txt)
 * which packages ALL filing documents in one SGML envelope. This avoids
 * the individual per-file CDN paths that are rate-limited on cloud IPs.
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

// ─── CUSIP → Ticker via OpenFIGI ─────────────────────────────────────────────

interface FigiMapping {
  data?: Array<{ ticker?: string; exchCode?: string }>;
  error?: string;
}

async function resolveWithOpenFigi(
  cusips: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (cusips.length === 0) return result;

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
        logger.warn({ status: res.status }, "OpenFIGI batch failed");
        batch.forEach((c) => result.set(c, null));
        continue;
      }
      const mappings: FigiMapping[] = await res.json() as FigiMapping[];
      mappings.forEach((m, idx) => {
        const cusip = batch[idx]!;
        if (m.error || !m.data || m.data.length === 0) {
          result.set(cusip, null);
        } else {
          const usEntry = m.data.find(
            (d) => d.exchCode && ["US", "UN", "UA", "UW", "UM"].includes(d.exchCode),
          );
          result.set(cusip, (usEntry ?? m.data[0])?.ticker ?? null);
        }
      });
    } catch (err) {
      logger.warn({ err }, "OpenFIGI batch threw");
      batch.forEach((c) => result.set(c, null));
    }
    if (i + BATCH < cusips.length) {
      await sleep(2500); // 25 req/min → ~2.4s between batches
    }
  }
  return result;
}

async function resolveCusips(cusips: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(cusips)];
  const result = new Map<string, string | null>();

  const cached = await db
    .select()
    .from(cusipTickerMapTable)
    .where(inArray(cusipTickerMapTable.cusip, unique));

  const uncached: string[] = [];
  for (const row of cached) result.set(row.cusip, row.ticker ?? null);
  for (const c of unique) if (!result.has(c)) uncached.push(c);

  if (uncached.length > 0) {
    const resolved = await resolveWithOpenFigi(uncached);
    const rows = [...resolved.entries()].map(([cusip, ticker]) => ({
      cusip,
      ticker: ticker ?? null,
      source: ticker ? "openfigi" : "not_found",
    }));
    if (rows.length > 0) {
      for (const row of rows) {
        try {
          await db
            .insert(cusipTickerMapTable)
            .values({ cusip: row.cusip, ticker: row.ticker, source: row.source })
            .onConflictDoNothing();
        } catch { /* ignore */ }
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

  // Resolve CUSIPs → tickers
  const tickerMap = await resolveCusips(holdings.map((h) => h.cusip));

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

function isInRefreshWindow(): boolean {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const day   = now.getUTCDate();
  return [2, 5, 8, 11].includes(month) && day >= 15 && day <= 20;
}

export async function initEdgarFetcher(): Promise<void> {
  await db
    .insert(hedgeFundsTable)
    .values({ cik: "1067983", name: "Berkshire Hathaway", slug: "berkshire-hathaway" })
    .onConflictDoNothing();

  // Seed on startup after a brief delay to let the server finish initialising
  setTimeout(() => {
    seedFundFilings("1067983").catch((err) =>
      logger.error({ err }, "Initial 13F seed failed"),
    );
  }, 3_000);

  // Schedule periodic refresh checks every 12 hours
  setInterval(async () => {
    if (!isInRefreshWindow()) {
      logger.info("13F refresh check: not in publication window, skipping");
      return;
    }
    logger.info("13F refresh check: in publication window");
    const funds = await db.select().from(hedgeFundsTable);
    for (const fund of funds) {
      await seedFundFilings(fund.cik).catch((err) =>
        logger.error({ err, cik: fund.cik }, "Scheduled 13F refresh failed"),
      );
    }
  }, 12 * 60 * 60 * 1000);

  logger.info("EDGAR fetcher initialized");
}
