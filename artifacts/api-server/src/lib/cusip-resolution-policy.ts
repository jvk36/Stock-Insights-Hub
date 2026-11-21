import { MISCELLANEOUS_CUSIP } from "./thirteen-f-retention";

// Verified against OpenFIGI's exact ID_CUSIP + US equity mapping. These also
// correct existing records immediately while the background audit progresses.
export const VERIFIED_CUSIP_TICKERS: Record<string, string> = {
  "464287630": "IWN",
  "922042742": "VT",
  "921943858": "VEA",
  "19762B202": "XCEM",
};
export const FIGI_MATCHED = "openfigi_us_v1";
export const FIGI_UNMATCHED = "openfigi_no_match_v1";
export const FIGI_AMBIGUOUS = "openfigi_ambiguous_v1";
export interface TickerMapping { cusip: string; ticker: string | null; source: string; updatedAt?: Date }
export interface FigiResolution {
  status: "matched" | "unmatched" | "ambiguous" | "temporary";
  ticker: string | null;
  reason?: string;
}

/** Convert US share-class notation only. NEVER strip a foreign exchange suffix. */
export function usTicker(raw: unknown, confirmedUs = false): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (/^[A-Z][A-Z0-9]{0,11}$/.test(s)) return s;
  if (/^[A-Z]{1,5}-[A-Z]$/.test(s)) return s;
  if (/^[A-Z]{1,5}[./][A-Z]$/.test(s) && (confirmedUs || /^(BRK|BF)[./][AB]$/.test(s))) return s.replace(/[./]/, "-");
  return null;
}
export function isTerminalUnmatched(mapping: TickerMapping | undefined): boolean {
  return !!mapping && mapping.ticker === null
    && [FIGI_UNMATCHED, FIGI_AMBIGUOUS].includes(mapping.source);
}
export function isTrustedMapping(mapping: TickerMapping): boolean {
  return !!mapping.ticker && ["manual", "override", "openfigi", FIGI_MATCHED].includes(mapping.source);
}
export function parseFigiResolution(job: unknown): FigiResolution {
  if (!job || typeof job !== "object") return { status: "temporary", ticker: null, reason: "Invalid mapping response." };
  const j = job as { data?: Record<string, unknown>[]; error?: string; warning?: string };
  const message = String(j.warning ?? j.error ?? "");
  if (!j.data) {
    if (/no (identifier|figi|instrument).*found|no matching.*found/i.test(message)) {
      return { status: "unmatched", ticker: null, reason: message };
    }
    return { status: "temporary", ticker: null, reason: message || "Mapping result is incomplete." };
  }
  if (!Array.isArray(j.data) || j.data.length === 0) return { status: "temporary", ticker: null, reason: "Empty mapping response." };
  const equities = j.data.filter(d => d.exchCode === "US" && d.marketSector === "Equity"
    && !/option|future|warrant|right/i.test(String(d.securityType ?? "")));
  const tickers = new Set(equities.map(d => usTicker(d.ticker, true)).filter((t): t is string => t !== null));
  // A valid-looking candidate must not win over a second unsupported symbol.
  if (equities.length && tickers.size === 1 && equities.every(d => usTicker(d.ticker, true) !== null)) {
    return { status: "matched", ticker: [...tickers][0]! };
  }
  return { status: "ambiguous", ticker: null, reason: "No unique supported US equity ticker for this CUSIP." };
}

type Position = { name: string; ticker: string | null; cusip: string; marketValueThousands: number; shares: number };
/** Read-only, per-filing projection. Original constituent rows remain in storage.
 * Only definitive OpenFIGI no-match/ambiguity can enter Miscellaneous; missing
 * cache entries, old not_found, rate limits and outages can NEVER trigger it.
 */
export function project13fHoldings<T extends Position>(rows: T[], mappings: Map<string, TickerMapping>): T[] {
  const kept: T[] = [];
  let misc: T | null = null;
  for (const raw of rows) {
    const cusip = raw.cusip.trim().toUpperCase();
    const mapping = mappings.get(cusip);
    const verified = VERIFIED_CUSIP_TICKERS[cusip];
    if (cusip === MISCELLANEOUS_CUSIP || (!verified && isTerminalUnmatched(mapping))) {
      if (!misc) misc = { ...raw, name: "Miscellaneous", cusip: MISCELLANEOUS_CUSIP, ticker: null, shares: 0 };
      else misc.marketValueThousands += raw.marketValueThousands;
      continue;
    }
    const candidate = verified ?? (mapping?.ticker && isTrustedMapping(mapping) ? mapping.ticker : raw.ticker);
    // Curated historical mappings remain authoritative, including legitimate
    // non-US listings. Unverified Yahoo suffixes do not become tradable symbols.
    const ticker = verified ?? (mapping && isTrustedMapping(mapping) ? mapping.ticker : usTicker(candidate));
    kept.push({ ...raw, ticker });
  }
  if (misc) kept.push(misc);
  return kept;
}
