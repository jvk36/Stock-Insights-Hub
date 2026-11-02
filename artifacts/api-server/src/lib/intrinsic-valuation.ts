import YahooFinance from "yahoo-finance2";
import { execFile } from "node:child_process";
import type { IntrinsicValuationResponse } from "@workspace/api-zod";
import { getUsdRate, resolveFinancialCurrency } from "./currency";
import {
  intrinsicValuationHistory, reconciledListingEps, secQuarterlyEps,
  type EpsFact, type QuarterlyEps,
} from "./intrinsic-valuation-engine";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const DAY = 86_400_000;
const TTL = 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: IntrinsicValuationResponse }>();
const inFlight = new Map<string, Promise<IntrinsicValuationResponse>>();

function iso(value: unknown): string | null {
  const d = value instanceof Date ? value : typeof value === "number"
    ? new Date(value < 1e12 ? value * 1000 : value) : typeof value === "string" ? new Date(value) : null;
  return d && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function secFacts(cik: string): Promise<EpsFact[]> {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik.padStart(10, "0")}/us-gaap/EarningsPerShareDiluted.json`;
  return new Promise((resolve, reject) => {
    execFile("curl", ["-fsSL", "--max-time", "20", "-A", "Stock Research Platform research@example.com", url],
      { maxBuffer: 12 * 1024 * 1024 }, (error, stdout) => {
        if (error) { reject(error); return; }
        try {
          const data = JSON.parse(stdout) as { units?: { "USD/shares"?: EpsFact[] } };
          resolve(data.units?.["USD/shares"] ?? []);
        } catch (err) { reject(err); }
      });
  });
}

async function compile(symbol: string, cik: string | null): Promise<IntrinsicValuationResponse> {
  const warnings: string[] = [];
  const asOf = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 15 * 365.25 * DAY);
  const [quote, splits, facts] = await Promise.all([
    yf.quoteSummary(symbol, { modules: ["earningsHistory", "earningsTrend", "financialData", "price"] }),
    yf.chart(symbol, { period1: new Date("1970-01-01"), interval: "1mo", events: "splits" }),
    cik ? secFacts(cik).catch(() => { warnings.push("SEC historical EPS could not be retrieved; alternative history may be limited."); return []; }) : Promise.resolve([]),
  ]);
  if (quote.price?.currency !== "USD") {
    return {
      symbol, currency: "USD", generatedAt: new Date().toISOString(), source: "Yahoo Finance",
      methodology: "Only USD-listed securities are supported so price and earnings stay on the same currency basis.",
      warnings: ["This listing is not quoted in USD. Choose its USD listing or ADR; values are not relabeled as dollars."],
      nextQuarterEnd: null, nextQuarterEstimate: null, history: [],
    };
  }
  const listingEps: QuarterlyEps[] = (quote.earningsHistory?.history ?? []).flatMap(row => {
    const date = iso(row.quarter);
    return date && finite(row.epsActual) && (!row.currency || row.currency === "USD") ? [{ date, eps: row.epsActual }] : [];
  });
  let quarters = secQuarterlyEps(facts, splits.events?.splits ?? []);
  let source = "SEC EDGAR diluted EPS (USD per listed share); Yahoo Finance prices and consensus";
  const reportingCurrency = resolveFinancialCurrency(quote.financialData, null);
  if (quarters.length < 16) {
    // Yahoo statement EPS is reporting-currency per ordinary share. Reconcile
    // overlapping observations before using it for a USD ADR or listed share.
    try {
      const raw = await yf.fundamentalsTimeSeries(symbol, { type: "quarterly", module: "financials", period1: start });
      const statementRows: QuarterlyEps[] = raw.flatMap(row => {
        const r = row as unknown as Record<string, unknown>;
        const date = iso(r.date);
        const eps = r.dilutedEPS ?? r.basicEPS;
        return date && finite(eps) ? [{ date, eps }] : [];
      });
      const currency = reportingCurrency ?? (raw[0] as unknown as { currencyCode?: string } | undefined)?.currencyCode;
      const rate = await getUsdRate(currency ?? null);
      const reconciled = rate != null ? reconciledListingEps(statementRows, listingEps, rate) : null;
      if (reconciled && reconciled.length > quarters.length) {
        quarters = reconciled;
        source = "Yahoo Finance quarterly statement EPS reconciled to USD listing EPS; Yahoo prices and consensus";
        warnings.push("Statement EPS uses current exchange rates and a depositary-share ratio reconciled against multiple overlapping listing EPS reports. Historical FX effects are not reconstructed.");
      } else if (statementRows.length > quarters.length) {
        warnings.push("Historical EPS currency/share units could not be reconciled to this USD listing; an unreliable valuation curve has been omitted.");
      }
    } catch {
      warnings.push("Extended Yahoo quarterly statement history is unavailable.");
    }
  }
  // Use listing EPS only if extended reported history is absent. Four Yahoo
  // quarters alone cannot establish a three-year CAGR; gaps remain explicit.
  if (!quarters.length) {
    quarters = listingEps;
    source = "Yahoo Finance reported listing EPS and consensus";
  } else if (source.startsWith("SEC")) {
    // A newly announced quarter can precede its SEC filing. Keep SEC GAAP
    // history intact; do not overwrite fiscal dates with Yahoo calendar dates.
    const lastSec = quarters.at(-1)?.date;
    for (const row of listingEps) {
      if (lastSec && Date.parse(row.date) - Date.parse(lastSec) >= 65 * DAY) {
        quarters.push(row);
        warnings.push("Recent announced EPS is supplemented from Yahoo listing earnings until SEC filing data is available; analyst-adjusted and GAAP EPS can differ.");
      }
    }
  }
  quarters.sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = quarters.at(-1)?.date;
  const candidates = (quote.earningsTrend?.trend ?? []).flatMap(row => {
    const date = iso(row.endDate);
    const eps = row.earningsEstimate?.avg;
    const currency = row.earningsEstimate?.earningsCurrency;
    return ["0q", "+1q"].includes(row.period ?? "") && date && finite(eps) && latestDate
      && currency === "USD"
      && Date.parse(date) - Date.parse(latestDate) >= 65 * DAY
      && Date.parse(date) - Date.parse(latestDate) <= 115 * DAY
      ? [{ date, eps }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
  const estimate = candidates[0] ?? null;
  const history = intrinsicValuationHistory(quarters, estimate, asOf);
  if (!history.some(p => p.fairValue != null)) {
    warnings.push("There are not enough comparable positive EPS observations to calculate a three-year CAGR and a reliable intrinsic value curve.");
  }
  if (!estimate) warnings.push("The latest blended value requires consensus EPS for the immediately following fiscal quarter; no substitute estimate is used.");
  return {
    symbol, currency: "USD", generatedAt: new Date().toISOString(), source,
    methodology: "Historical points use four consecutive diluted EPS quarters and three-year reported TTM EPS CAGR. Latest projected TTM = reported TTM − oldest of those four quarters + next-quarter consensus EPS; blended TTM = (reported TTM + projected TTM) / 2. Growth remains based on reported TTM. Historical facts may be restated; missing Q4 EPS is derived from annual minus nine-month EPS and can differ due to weighted shares/rounding. This is a retrospective valuation illustration, not a point-in-time backtest. Formula-based estimates have no statistical confidence interval.",
    warnings, nextQuarterEnd: estimate?.date ?? null, nextQuarterEstimate: estimate?.eps ?? null,
    history: history.filter(p => p.date >= new Date(Date.now() - 10 * 365.25 * DAY).toISOString().slice(0, 10)),
  };
}

export function getIntrinsicValuation(symbol: string, cik: string | null): Promise<IntrinsicValuationResponse> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  const pending = inFlight.get(symbol);
  if (pending) return pending;
  const job = compile(symbol, cik).then(data => {
    // Keep memory bounded across arbitrary requested symbols.
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(symbol, { at: Date.now(), data });
    return data;
  }).finally(() => inFlight.delete(symbol));
  inFlight.set(symbol, job);
  return job;
}
