import { MISCELLANEOUS_CUSIP } from "./thirteen-f-retention";

// CUSIP-scoped corrections apply to every fund and every stored filing.
export const STOCK_TICKER_CORRECTIONS: Record<string, string> = {
  "74624M102": "P",
  "12510Q100": "CCC",
  "V7780T103": "RCL",
  "T19377109": "BSP",
  "780087102": "RY",
  "817565104": "SCI",
  "07725L102": "ONC",
  "76243J105": "RYTM",
  "98401F105": "XNCR",
  "918385204": "VTVT",
};

export const VERIFIED_SEARCH_SOURCE = "yahoo_name_verified_v2";
export const US_STOCK_EXCHANGES = new Set(["NYQ", "NMS", "PCX", "NGM", "NCM", "BTS", "NYSEArca", "ASE", "AMEX"]);
export type SecurityQuote = {
  symbol?: string; quoteType?: string; exchange?: string;
  shortName?: string; longName?: string; shortname?: string; longname?: string;
};
export type SecurityMapping = { ticker: string | null; source: string };
export type SecurityIdentity = { name: string; cusip: string; ticker?: string | null };

export function isNonStockPosition(position: Pick<SecurityIdentity, "name" | "cusip">): boolean {
  const name = position.name.toUpperCase();
  // Issuer-family names in 13F filings often omit the individual ETF's name.
  return /\b(NON-STOCK|ETF|ETFS|ETN|ISHARES|SPDR|VANGUARD|WISDOMTREE|PROSHARES|DIREXION|POWERSHARES|VANECK|INVESCO|XTRACKERS|DBX|GLOBAL X|FIRST TRUST|FIRST TR|SCHWAB STRATEGIC|SELECT SECTOR|EXCHANGE TRADED|EXCHANGE-TRADED|INDEX FDS|INDEX FUND|INDEX TR|MUTUAL FUND|UNIT TR|UNIT INVESTMENT|WARRANTS?|WTS?|RIGHTS?|OPTIONS?|PUT|CALL|AUTOCALLABLE|AUTO CALLABLE|CONVERTIBLE|DEBENTURES?|NOTES?|BONDS?|PREFERRED|PFD)\b/.test(name)
    || /\b(FDS|FUNDS)\s+(TR|TRUST|SER|SERIES)\b/.test(name)
    || /\b(ARK 21|ARK ACTIVE|ARK INNOVATION|ARK NEXT|ARK FINTECH|ARK GENOMIC|ARK AUTONOMOUS)\b/.test(name)
    // CUSIP issue numbers 11–19 identify rights/warrants, not common stock.
    || /^[A-Z0-9]{6}1[1-9][A-Z0-9]$/.test(position.cusip.toUpperCase());
}

function companyWords(name: string): string[] {
  const expanded = name.toUpperCase().replace(/&/g, " AND ")
    .replace(/\bINTL\b/g, " INTERNATIONAL ").replace(/\bCORPORATION\b/g, " CORP ")
    .replace(/\bPHARMACEUTICALS\b/g, " PHARMA ").replace(/\bTECHNOLOGIES\b/g, " TECH ")
    .replace(/\bHLDGS\b/g, " HOLDINGS ").replace(/\bS\s*\.?\s*P\s*\.?\s*A\b/g, " ");
  return expanded.replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(word => word.length > 1 &&
    !new Set(["INC", "CORP", "LTD", "LIMITED", "PLC", "LLC", "CO", "THE", "AND", "OF", "SA", "AG", "NV", "NEW", "DEL", "CL", "CLASS", "ADR", "ADS", "COM", "COMMON", "HOLDINGS", "HOLDING", "GROUP", "ORD", "SHS"]).has(word));
}

export function matchingCompanyName(issuer: string, candidate: string): boolean {
  const a = companyWords(issuer);
  const b = companyWords(candidate);
  if (!a.length || !b.length || a[0] !== b[0]) return false;
  const shared = a.filter(word => b.includes(word)).length;
  // A single shared generic word is not sufficient for a multi-word issuer.
  return shared / a.length >= 0.8 && shared / b.length >= 0.6;
}

export function selectVerifiedStock(issuer: string, quotes: SecurityQuote[]): string | null {
  const matches = quotes.filter(q =>
    q.symbol && /^[A-Z][A-Z0-9-]{0,14}$/.test(q.symbol) &&
    q.quoteType === "EQUITY" && q.exchange && US_STOCK_EXCHANGES.has(q.exchange) &&
    [q.longName, q.shortName, q.longname, q.shortname].some(name => name && matchingCompanyName(issuer, name)));
  const symbols = [...new Set(matches.map(q => q.symbol!))];
  // Ambiguous share classes must not be guessed from issuer name alone.
  return symbols.length === 1 ? symbols[0]! : null;
}

export function stockTicker(position: SecurityIdentity, mappings: ReadonlyMap<string, SecurityMapping>): string | null {
  const cusip = position.cusip.toUpperCase();
  if (cusip === MISCELLANEOUS_CUSIP || isNonStockPosition(position)) return null;
  const correction = STOCK_TICKER_CORRECTIONS[cusip];
  if (correction) return correction;
  const mapping = mappings.get(cusip);
  if (!mapping?.ticker || !["override", "manual", "openfigi", VERIFIED_SEARCH_SOURCE].includes(mapping.source)) return null;
  const ticker = mapping.ticker.trim().toUpperCase().replace(/^BRK[.-]([AB])$/, "BRK-$1");
  return /^[A-Z][A-Z0-9-]{0,14}$/.test(ticker) ? ticker : null;
}

type PolicyHolding = SecurityIdentity & { ticker: string | null; marketValueThousands: number; shares: number };

/** Read-time projection preserves original rows, amounts and full-filing totals. */
export function groupStockHoldings<T extends PolicyHolding>(holdings: T[], mappings: ReadonlyMap<string, SecurityMapping>): T[] {
  const stocks: T[] = [];
  let miscellaneous: T | null = null;
  for (const holding of holdings) {
    const ticker = stockTicker(holding, mappings);
    if (ticker) {
      stocks.push({ ...holding, ticker });
    } else if (miscellaneous) {
      miscellaneous.marketValueThousands += holding.marketValueThousands;
    } else {
      miscellaneous = { ...holding, name: "Miscellaneous", cusip: MISCELLANEOUS_CUSIP,
        ticker: null, shares: 0 };
    }
  }
  return miscellaneous ? [...stocks, miscellaneous] : stocks;
}
