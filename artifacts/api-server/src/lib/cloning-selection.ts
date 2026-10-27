import type { CloningPick } from "@workspace/api-zod";
import type { Action } from "./model-portfolio-engine";

export const CLONING_INCEPTION = "2026-08-15";
export const CLONING_HISTORY = "2016-08-15";
export const CLONING_CAPITAL = 30_000;
export type CloneHolding = { ticker: string | null; name: string; cusip: string; shares: number; value: number };
export type CloneFiling = {
  fundCik: string; manager: string; reportDate: string; filingDate: string;
  accession: string; total: number; holdings: CloneHolding[];
};
export type CloneReview = {
  scheduledDate: string; date: string; reportDate: string; picks: CloningPick[]; issues: string[];
};
const day = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const canonicalTicker = (ticker: string) => ticker.trim().toUpperCase()
  .replace(/^BRK[.-]([AB])$/, "BRK-$1").replace(/^AJG\.MX$/, "AJG").replace(/^YNDX$/, "NBIS");
const nameKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(INCORPORATED|CORPORATION|CORP|INC|COM|LTD|PLC)$/g, "");

// Literal 45 calendar days, not a three-month anniversary of a delayed fill.
export function filingDeadline(reportDate: string): string {
  return iso(new Date(Date.parse(`${reportDate}T12:00:00Z`) + 45 * day));
}
export function quarterEnds(startYear: number, endYear: number): string[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
    .flatMap((year) => ["03-31", "06-30", "09-30", "12-31"].map((md) => `${year}-${md}`));
}
export function nextCloningDate(after: string): string {
  return quarterEnds(Number(after.slice(0, 4)) - 1, Number(after.slice(0, 4)) + 2)
    .map(filingDeadline).find((date) => date > after)!;
}
export function previousQuarter(reportDate: string): string {
  const all = quarterEnds(Number(reportDate.slice(0, 4)) - 1, Number(reportDate.slice(0, 4)));
  return all[all.indexOf(reportDate) - 1];
}
export function reviewDates(start: string, endExclusive: string, sessions: string[]) {
  return quarterEnds(Number(start.slice(0, 4)) - 1, Number(endExclusive.slice(0, 4)))
    .map((reportDate) => ({
      reportDate,
      scheduledDate: reportDate === `${start.slice(0, 4)}-06-30` ? start : filingDeadline(reportDate),
    }))
    .filter((r) => r.scheduledDate >= start && r.scheduledDate < endExclusive)
    .map((r) => ({ ...r, date: sessions.find((d) => d >= r.scheduledDate && d < endExclusive) ?? null }));
}

export function selectCloningPicks(
  filings: CloneFiling[], reportDate: string, tradeDate: string, actions: Action[] = [],
): { picks: CloningPick[]; issues: string[] } {
  const issues: string[] = [];
  const picks: CloningPick[] = [];
  const priorDate = previousQuarter(reportDate);
  const managers = [...new Map(filings.map((f) => [f.fundCik, f.manager])).entries()];
  for (const [cik, manager] of managers) {
    const available = (period: string) => filings.filter((f) => f.fundCik === cik && f.reportDate === period
      && f.filingDate < tradeDate && f.holdings.length)
      // Original available filing, never a later amendment/restatement.
      .sort((a, b) => a.filingDate.localeCompare(b.filingDate) || a.accession.localeCompare(b.accession))[0];
    const curr = available(reportDate), prior = available(priorDate);
    if (!curr || !prior) {
      // Do not mistake unavailable comparisons for a new purchase, or penalize
      // periods before a manager first appears in the tracked filing archive.
      const existed = filings.some((f) => f.fundCik === cik && f.reportDate <= reportDate);
      if (existed) issues.push(`${manager}: ${!curr ? "current" : "previous"} quarter filing unavailable before ${tradeDate}; not treated as no buys.`);
      continue;
    }
    const total = curr.total > 0 ? curr.total : curr.holdings.reduce((sum, h) => sum + h.value, 0);
    if (!(total > 0)) { issues.push(`${manager}: portfolio total is unavailable.`); continue; }
    const candidates: CloningPick[] = [];
    for (const holding of curr.holdings) {
      if (!(holding.shares > 0) || !(holding.value > 0)) continue;
      const old = prior.holdings.find((p) => p.cusip === holding.cusip)
        ?? prior.holdings.find((p) => p.ticker && holding.ticker && canonicalTicker(p.ticker) === canonicalTicker(holding.ticker))
        ?? (() => {
          const matches = prior.holdings.filter((p) => nameKey(p.name) === nameKey(holding.name));
          return matches.length === 1 ? matches[0] : undefined;
        })();
      const ticker = holding.ticker ? canonicalTicker(holding.ticker) : "";
      const factor = actions.filter((a) => a.ticker === ticker && a.type === "split"
        && a.date > priorDate && a.date <= reportDate).reduce((f, a) => f * a.value, 1);
      const addedShares = holding.shares - (old?.shares ?? 0) * factor;
      if (addedShares <= Math.max(1e-6, holding.shares * 1e-8)) continue;
      const addedWeight = (addedShares / holding.shares) * holding.value / total * 100;
      candidates.push({
        ticker, name: holding.name, manager, fundCik: cik,
        reportPeriod: `Q${Math.ceil(Number(reportDate.slice(5, 7)) / 3)} ${reportDate.slice(0, 4)}`,
        filedOn: curr.filingDate,
        filingSource: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${curr.accession.replaceAll("-", "")}/${curr.accession}-index.html`,
        addedWeight, activity: old ? "increase" : "new", selected: false,
      });
    }
    candidates.sort((a, b) => b.addedWeight - a.addedWeight || a.ticker.localeCompare(b.ticker));
    if (candidates[0]) {
      picks.push(candidates[0]);
      if (!candidates[0].ticker) issues.push(`${manager}: largest increase ${candidates[0].name} has no verified ticker; no runner-up substituted.`);
    }
  }
  picks.sort((a, b) => b.addedWeight - a.addedWeight || a.ticker.localeCompare(b.ticker) || a.fundCik.localeCompare(b.fundCik));
  const unique = new Set<string>();
  for (const pick of picks) {
    if (unique.size < 10 && !unique.has(pick.ticker)) {
      pick.selected = true;
      unique.add(pick.ticker);
    }
  }
  return { picks, issues };
}
