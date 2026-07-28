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
  "093671105": "HRB",  // "BLOCK H & R INC" — Yahoo returns HRB.F (Frankfurt) first
  "225310101": "CACC", // "CREDIT ACCEP CORP MICH" — Yahoo returns 2D5.F (Frankfurt) first
  "44332N106": "HTHT", // "H WORLD GROUP LTD" — Yahoo returns CL4.F (Frankfurt) first
  "M98068105": "WIX",  // "WIX COM LTD" — Israeli company, trades on NASDAQ as WIX
  "G4412G101": "HLF",  // "HERBALIFE NUTRITION LTD" — Yahoo returns HOO.DU (Frankfurt) first; NYSE-listed as HLF until taken private Nov 2023
  "N20146101": "CMPR", // "CIMPRESS N V" — Yahoo misses it; trades on NASDAQ as CMPR
  // ── Yacktman-sourced fixes (also benefit other funds) ────────────────────────
  "30231G102": "XOM",   // "Exxon Mobil Corp." — Yahoo returns XONA.SG (Stuttgart) first
  "65249B208": "NWS",   // "News Corp CL B" — Yahoo returns NC0.SG (Stuttgart) first
  "904767704": "UL",    // "Unilever PLC ADR" — Yahoo returns UNV.SG (Stuttgart) first
  "904784709": "UL",    // "Unilever N.V." — merged with Unilever PLC 2020; same NYSE ADR ticker UL
  "456788108": "INFY",  // "Infosys Ltd ADR" — Yahoo returns I1FO34.SA (Brazil) first
  "464286772": "EWY",   // "iShares MSCI South Korea ETF" — Yahoo returns EPU.SN (Santiago) first
  "12541W209": "CHRW",  // "CH Robinson WW" — Yahoo misses it; NASDAQ CHRW
  "02319V103": "ABEV",  // "Ambev SSA ADR" — Yahoo misses it; NYSE ABEV
  "33767D105": "FCFS",  // "Firstcash Inc." — Yahoo misses it; NASDAQ FCFS
  "78468R663": "BIL",   // "SPDR Bloomberg 1-3 Month T-Bill ETF" — Yahoo misses it; NYSE BIL
  "90130A101": "FOXA",  // "TwentyFirst Cen Fox A" — acquired by Disney Mar 2019; was NASDAQ FOXA
  "90130A200": "FOX",   // "TwentyFirst Cen Fox B" — acquired by Disney Mar 2019; was NASDAQ FOX
  "723787107": "PXD",   // "Pioneer Natural Resources" — acquired by ExxonMobil May 2024; was NYSE PXD
  "487836108": "K",     // "Kellanova" (fka Kellogg) — acquired by Mars Aug 2024; was NYSE K
  "855030102": "SPLS",  // "Staples Inc." — taken private 2017; was NASDAQ SPLS
  "30219G108": "ESRX",  // "Express Scripts" — acquired by Cigna Dec 2018; was NASDAQ ESRX
  "037604105": "APOL",  // "Apollo Education Grp" — taken private Feb 2016; was NASDAQ APOL
  "930059100": "WDR",   // "Waddell & Reed Financial" — acquired by Macquarie Apr 2021; was NYSE WDR
  "594837304": "MFGP",  // "Micro Focus Intl ADR" — acquired by OpenText Jan 2023; was NYSE MFGP
  "754212108": "RAVN",  // "Raven Industries Inc." — acquired by CNH Industrial Feb 2022; was NASDAQ RAVN
  "91336L107": "UNVR",  // "Univar Solutions Inc." — acquired by Apollo Global Jun 2023; was NYSE UNVR
  "74915M100": "QRTEA", // "Qurate Retail Inc." — was NASDAQ QRTEA
  "87236Y108": "AMTD",  // "TD Ameritrade Hldg Corp" — acquired by Charles Schwab Oct 2020; was NASDAQ AMTD
  // ── End Yacktman-sourced fixes ────────────────────────────────────────────────
  // ── Tweedy Browne-sourced fixes (also benefit other funds) ───────────────────
  "66987v109": "NVS",   // "NOVARTIS AG ADR" — Yahoo misses it; NYSE NVS
  "638517102": "NWLI",  // "NATIONAL WESTERN LIFE GROUP" — Yahoo misses it; NASDAQ NWLI
  "N20944109": "CNHI",  // "CNH INDUSTRIAL NV" — Yahoo returns CNHI.VI (Vienna); NYSE CNHI
  "37733W105": "GSK",   // "GLAXO SMITHKLINE PLC ADR" — Yahoo misses it; NYSE GSK (pre-rename)
  "37733W204": "GSK",   // "GSK PLC ADR" — Yahoo misses it; NYSE GSK (post-rename)
  "25243q205": "DEO",   // "DIAGEO PLC ADR" — Yahoo misses it; NYSE DEO
  "01609W102": "BABA",  // "ALIBABA GROUP HOLDING SP-ADR" — Yahoo returns AHLA.DE; NYSE BABA
  "028591105": "ANAT",  // "AMERICAN NATIONAL INSURANCE CO" — acquired by Brookfield May 2022; was NASDAQ ANAT
  "404280406": "HSBC",  // "HSBC HOLDINGS PLC ADR" — Yahoo misses it; NYSE HSBC
  "405552100": "HLN",   // "HALEON PLC ADR" — Yahoo returns H6D.SG (Stuttgart); NYSE HLN (GSK spin-off Jul 2022)
  "207797101": "CTWS",  // "CONNECTICUT WATER SERVICE INC" — acquired by SJW Group Oct 2019; was NASDAQ CTWS
  "780259206": "SHEL",  // "ROYAL DUTCH SHELL PLC-A ADR" — unified to single class Jan 2022; NYSE SHEL
  "89151E109": "TTE",   // "TOTALENERGIES/TOTAL SA ADR" — NYSE TTE (renamed from TOT 2021)
  "89151E959": "TTE",   // "TOTALENERGIES SE ADR" (alt CUSIP) — NYSE TTE
  "89151e909": "TTE",   // "TOTAL SA ADR" (alt CUSIP lowercase) — NYSE TTE
  "F92124100": "TTE",   // "TOTAL SA ADR" (French CUSIP) — NYSE TTE
  "89151E113": "TTE",   // "TOTALENERGIES SE ADR" (another CUSIP variant) — NYSE TTE
  "81211K100": "SEE",   // "SEALED AIR CORPORATION" — Yahoo misses it; NYSE SEE
  "55345k103": "MRC",   // "MRC GLOBAL INC" — Yahoo misses it; NYSE MRC
  "358029106": "FMS",   // "FRESENIUS MEDICAL CARE ADR" — Yahoo misses it; NYSE FMS
  "92937A102": "WPP",   // "WPP PLC ADR" — Yahoo misses it; NASDAQ WPP
  "527288104": "LUK",   // "LEUCADIA NATIONAL CORP" — renamed to Jefferies (JEF) 2018; was NYSE LUK
  "H01301128": "ALC",   // "ALCON INC ADR" — Yahoo misses it; NYSE ALC (Novartis spin-off Apr 2019)
  "Y2990R101": "HAFN",  // "HAFNIA LTD" — Yahoo returns RE0.F (Frankfurt); NYSE HAFN (listed Sep 2023)
  "48268K101": "KT",    // "KT CORP ADR" — Yahoo returns KTC.SG (Stuttgart); NYSE KT
  "82481R106": "SHPG",  // "SHIRE PLC ADR" — acquired by Takeda Jan 2019; was NASDAQ SHPG
  "042735100": "ARW",   // "ARROW ELECTRONICS" — Yahoo misses it; NYSE ARW
  "126650100": "CVS",   // "CVS CORP" — Yahoo misses it; NYSE CVS
  "G89479102": "TRMD",  // "TORM PLC CLASS A" — Yahoo returns TRMD-A.CO (Copenhagen); NASDAQ TRMD
  "Y2106R110": "LPG",   // "DORIAN LPG LIMITED" — Yahoo misses it; NYSE LPG
  "L72967109": "OEC",   // "ORION SA (Orion Engineered Carbons)" — went private Oct 2023; was NYSE OEC
  "828730200": "SFNC",  // "SIMMONS FIRST NATIONAL CORP" — Yahoo misses it; NASDAQ SFNC
  "01973R101": "ALSN",  // "ALLISON TRANSMISSION HLD" — Yahoo returns 1A7.MU (Munich); NYSE ALSN
  "74319N100": "ACDC",  // "PROFRAC HOLDINGS A" — Yahoo misses it; NASDAQ ACDC
  "731105201": "PSNY",  // "POLESTAR AUTOMOTIVE CL A" — Yahoo misses it; NASDAQ PSNY
  "07177M103": "BXLT",  // "BAXALTA INC" — acquired by Shire Jun 2016; was NYSE BXLT
  "125523100": "CI",    // "CIGNA CORP" — Yahoo returns CGN.MU (Munich); NYSE CI
  "57636q104": "MA",    // "MASTERCARD INC CLASS A" — Yahoo misses it; NYSE MA
  "811065101": "SNI",   // "SCRIPPS NETWORKS INTERACTIVE" — acquired by Discovery Mar 2018; was NASDAQ SNI
  // ── End Tweedy Browne-sourced fixes ──────────────────────────────────────────
  "N00985106": "AER",  // "AERCAP HOLDINGS NV" — Yahoo returns R1D.SG (Frankfurt) first; trades NYSE as AER
  "254687106": "DIS",  // "DISNEY WALT CO" — SEC abbreviation confuses Yahoo; NYSE as DIS
  "81686C104": "SEMR", // "SEMRUSH HLDGS INC" — Yahoo misses it; trades NYSE as SEMR
  "G27358103": "DESP", // "DESPEGAR COM CORP" — Cayman CUSIP; trades NYSE as DESP
  "83200N103": "SMAR", // "SMARTSHEET INC" — taken private Jan 2024; was NASDAQ SMAR
  "03662Q105": "ANSS", // "ANSYS INC" — acquired by Synopsys Jun 2024; was NASDAQ ANSS
  "02156B103": "AYX",  // "ALTERYX INC" — taken private Mar 2024; was NYSE AYX
  "05338G106": "AVLR", // "AVALARA INC" — acquired Oct 2022; was NYSE AVLR
  "73739W104": "POSH", // "POSHMARK INC" — acquired by Naver Jan 2023; was NASDAQ POSH
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
  // Strip namespace prefixes so cheerio selectors work uniformly
  // e.g. <ns1:infoTable> → <infoTable>, </ns1:nameOfIssuer> → </nameOfIssuer>
  const cleanXml = xml.replace(/<(\/?)\s*\w+:/g, "<$1");
  const $ = cheerio.load(cleanXml, { xmlMode: true });
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
  let computedTotalThousands = holdings.reduce((s, h) => s + h.marketValueThousands, 0);

  // Auto-detect dollar vs thousands units.
  // The 13F spec mandates thousands, but some filers (e.g. Himalaya) report raw dollars.
  // Heuristic: if the average per-holding value exceeds $10B (10,000,000 in thousands)
  // the filing used dollar units — divide every value by 1,000 to normalise.
  if (holdings.length > 0 && computedTotalThousands / holdings.length > 10_000_000) {
    for (const h of holdings) h.marketValueThousands = Math.round(h.marketValueThousands / 1000);
    computedTotalThousands = Math.round(computedTotalThousands / 1000);
  }

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
      || content.includes("<informationTable")
      || content.includes(":informationTable"); // namespace-prefixed variant (e.g. ns1:informationTable)
    const isPrimary   = type === "13F-HR"
      && (content.includes("<edgarSubmission") || content.includes("<tableValueTotal"));

    // A single document can be both primary header and embedded info table
    // (newer filers like Himalaya put <ns1:informationTable> inside <edgarSubmission>)
    if (isInfoTable && !infotableXml) {
      infotableXml = content;
    }
    if (isPrimary && !primaryXml) {
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

/** Earliest report date to process — filings before this quarter are ignored. */
const MIN_REPORT_DATE = "2016-01-01"; // Q1 2016 and later only

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
    .filter((s) => s.reportDate >= MIN_REPORT_DATE && !existingSet.has(s.accessionNumber));

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

  // 4. Build the gap list — stubs within the date window that are missing OR have empty holdings
  const gaps = stubs.filter((s) => {
    if (s.reportDate < MIN_REPORT_DATE) return false; // outside the historical cutoff
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
    if (headerTotal && headerTotal > 0) {
      // Guard against dollar-unit filings where the header total is ~1000x our
      // already-normalised computedTotalThousands (same auto-detection as parseInfoTable).
      const ratio = computedTotalThousands > 0 ? headerTotal / computedTotalThousands : 0;
      totalValueThousands = (ratio > 500 && ratio < 2000)
        ? Math.round(headerTotal / 1000)
        : headerTotal;
    }
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
 *   Q1 (Mar 31) → Apr 25 – May 19
 *   Q2 (Jun 30) → Jul 25 – Aug 18
 *   Q3 (Sep 30) → Oct 25 – Nov 18
 *   Q4 (Dec 31) → Jan 25 – Feb 18
 *
 * SEC deadline is 45 days; window extends to day 49 to catch late filers.
 * Polling every 3 days during this window gives ~9 checks per quarter.
 */
function isInFilingWindow(): boolean {
  const now   = new Date();
  const month = now.getUTCMonth() + 1; // 1-based
  const day   = now.getUTCDate();

  // (month, firstDay, lastDay) tuples for each quarter's filing window
  const windows: Array<[number, number, number]> = [
    [2,  1, 18],  // Q4 filing: Feb 1–18  (day 32–49 after Dec 31)
    [4, 25, 30],  // Q1 filing: Apr 25–30 (day 25–30 after Mar 31)
    [5,  1, 19],  // Q1 filing cont: May 1–19 (day 31–49 after Mar 31)
    [7, 25, 31],  // Q2 filing: Jul 25–31 (day 25–31 after Jun 30)
    [8,  1, 18],  // Q2 filing cont: Aug 1–18 (day 32–49 after Jun 30)
    [10, 25, 31], // Q3 filing: Oct 25–31 (day 25–31 after Sep 30)
    [11,  1, 18], // Q3 filing cont: Nov 1–18 (day 32–49 after Sep 30)
    [1,  25, 31], // Q4 filing: Jan 25–31 (day 25–31 after Dec 31)
  ];
  return windows.some(([m, from, to]) => month === m && day >= from && day <= to);
}

// Master list of tracked funds — add new entries here to register a fund.
// The startup sequence and the 12-hour scheduler iterate this list automatically.
const TRACKED_FUNDS = [
  { cik: "1067983", name: "Berkshire Hathaway",           slug: "berkshire-hathaway",      proprietor: "Warren Buffett"  },
  { cik: "1336528", name: "Pershing Square Capital Mgmt", slug: "pershing-square",         proprietor: "Bill Ackman"     },
  { cik: "1709323", name: "Himalaya Capital Management",  slug: "himalaya-capital",        proprietor: "Li Lu"           },
  { cik: "1766596", name: "RV Capital AG",                slug: "rv-capital",              proprietor: "Robert Vinall"   },
  { cik: "1697591", name: "CAS Investment Partners",      slug: "cas-investment-partners", proprietor: "Clifford Sosin"  },
  { cik: "1671657", name: "Dorsey Asset Management",      slug: "dorsey-asset-management", proprietor: "Pat Dorsey"      },
  { cik: "905567",  name: "Yacktman Asset Management",   slug: "yacktman-asset-management", proprietor: "Donald Yacktman" },
  { cik: "732905",  name: "Tweedy Browne Co LLC",        slug: "tweedy-browne",             proprietor: "William Browne"  },
] as const;

export async function initEdgarFetcher(): Promise<void> {
  // Upsert all tracked funds into the DB (name/slug may change but CIK is stable)
  for (const fund of TRACKED_FUNDS) {
    await db
      .insert(hedgeFundsTable)
      .values(fund)
      .onConflictDoUpdate({
        target: hedgeFundsTable.cik,
        set: { name: fund.name, slug: fund.slug, proprietor: fund.proprietor },
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
