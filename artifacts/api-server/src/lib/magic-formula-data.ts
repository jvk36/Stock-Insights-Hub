import YahooFinance from "yahoo-finance2";
import type { MagicFormulaCandidate } from "@workspace/api-zod";
import { getUsdRate, resolveFinancialCurrency, convertToUsd } from "./currency";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
type Row = Record<string, unknown>;
export const magicSource = (ticker: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/financials/`;
const number = (row: Row | undefined, key: string) => typeof row?.[key] === "number" && Number.isFinite(row[key]) ? row[key] as number : null;
export function magicFinancialDate(row: Row): string {
  const d = row.date ?? row.asOfDate;
  if (typeof d === "number" && Number.isFinite(d)) return new Date(d < 1e12 ? d * 1000 : d).toISOString().slice(0, 10);
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? "").slice(0, 10);
}
function latest(rows: Row[], today: string) {
  return rows.filter((r) => magicFinancialDate(r) && magicFinancialDate(r) <= today).sort((a, b) => magicFinancialDate(b).localeCompare(magicFinancialDate(a)))[0];
}
export function candidateFromInputs(
  stock: { symbol: string; name: string; sector: string },
  input?: { ebit: number | null; ev: number | null; netPpe: number | null; currentAssets: number | null; currentLiabilities: number | null; rate: number | null; financialDate: string | null; issue?: string },
): MagicFormulaCandidate {
  const c: MagicFormulaCandidate = {
    ticker: stock.symbol.replace(/\./g, "-"), name: stock.name, sector: stock.sector,
    ebit: null, enterpriseValue: null, netPpe: null, workingCapital: null, earningsYield: null, returnOnCapital: null,
    earningsRank: null, capitalRank: null, score: null, rank: null, reason: null,
    financialDate: input?.financialDate ?? null, source: magicSource(stock.symbol.replace(/\./g, "-")),
  };
  if (stock.sector === "Financials" || stock.sector === "Utilities") {
    c.reason = "Financials and utilities excluded: the standard operating-capital comparison is not meaningful for these sectors."; return c;
  }
  if (!input) { c.reason = "Verified financial inputs unavailable."; return c; }
  c.ebit = convertToUsd(input.ebit, input.rate);
  c.enterpriseValue = convertToUsd(input.ev, input.rate);
  c.netPpe = convertToUsd(input.netPpe, input.rate);
  c.workingCapital = input.currentAssets != null && input.currentLiabilities != null
    ? convertToUsd(input.currentAssets - input.currentLiabilities, input.rate) : null;
  if (input.issue) c.reason = input.issue;
  else if ([c.ebit, c.enterpriseValue, c.netPpe, c.workingCapital].some((n) => n == null)) c.reason = "Missing EBIT, EV, net PP&E, working capital or verified currency conversion.";
  else if (c.ebit! <= 0 || c.enterpriseValue! <= 0 || c.netPpe! < 0 || c.netPpe! + c.workingCapital! <= 0) c.reason = "Nonpositive EBIT, enterprise value or total tangible operating capital (or invalid negative net PP&E).";
  else {
    c.earningsYield = c.ebit! / c.enterpriseValue!;
    c.returnOnCapital = c.ebit! / (c.workingCapital! + c.netPpe!);
  }
  return c;
}

export async function fetchMagicCandidate(stock: { symbol: string; name: string; sector: string }, today: string): Promise<MagicFormulaCandidate> {
  if (["Financials", "Utilities"].includes(stock.sector)) return candidateFromInputs(stock);
  const ticker = stock.symbol.replace(/\./g, "-");
  try {
    const period1 = `${Number(today.slice(0, 4)) - 2}-01-01`;
    const [summary, income, balance] = await Promise.all([
      yahoo.quoteSummary(ticker, { modules: ["financialData", "defaultKeyStatistics", "price"] }),
      // v3's schema omits the valid TTM periodType. Validate each consumed field
      // locally; unvalidated records retain numeric Unix dates.
      yahoo.fundamentalsTimeSeries(ticker, { type: "trailing", module: "financials", period1 }, { validateResult: false }),
      yahoo.fundamentalsTimeSeries(ticker, { type: "quarterly", module: "balance-sheet", period1 }),
    ]);
    const i = latest(income as unknown as Row[], today), b = latest(balance as unknown as Row[], today);
    const currency = resolveFinancialCurrency(summary.financialData, summary.price?.currency ?? null);
    const rate = currency ? await getUsdRate(currency).catch(() => null) : null;
    const age = i && b ? Math.max(Date.parse(today) - Date.parse(magicFinancialDate(i)), Date.parse(today) - Date.parse(magicFinancialDate(b))) / 864e5 : Infinity;
    return candidateFromInputs(stock, {
      ebit: number(i, "EBIT"), ev: summary.defaultKeyStatistics?.enterpriseValue ?? null,
      netPpe: number(b, "netPPE"), currentAssets: number(b, "currentAssets"), currentLiabilities: number(b, "currentLiabilities"),
      rate, financialDate: b ? magicFinancialDate(b) : null,
      issue: summary.price?.currency !== "USD" ? "US-dollar listing price could not be verified."
        : age > 200 ? "Recent trailing EBIT and quarterly balance sheet unavailable (over 200 days old)." : undefined,
    });
  } catch {
    const c = candidateFromInputs(stock);
    c.reason = "Provider request failed; excluded rather than assigning estimated financial inputs.";
    return c;
  }
}
