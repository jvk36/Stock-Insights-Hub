import type { IntrinsicValuationPoint } from "@workspace/api-zod";

export interface QuarterlyEps {
  date: string;
  eps: number;
}

const DAY = 86_400_000;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** g is in percentage points: 20 means 20%, not 0.20. */
export function intrinsicTargetPe(g: number | null): number | null {
  if (g == null || !finite(g)) return null;
  const pe = g < 5 ? Math.min(15, 8.5 + 2 * g) : g <= 15 ? 15 : g;
  return pe > 0 && finite(pe) ? pe : null;
}

function consecutive(rows: QuarterlyEps[]): boolean {
  return rows.length === 4 && rows.every((row, i) => {
    if (!i) return true;
    const days = (Date.parse(row.date) - Date.parse(rows[i - 1].date)) / DAY;
    return days >= 65 && days <= 115;
  }) && (Date.parse(rows[3].date) - Date.parse(rows[0].date)) / DAY <= 310;
}

export function intrinsicValuationHistory(
  quarters: QuarterlyEps[],
  estimate: { date: string; eps: number } | null,
  asOf: string,
): IntrinsicValuationPoint[] {
  const unique = new Map(quarters.filter(q => finite(q.eps) && Number.isFinite(Date.parse(q.date)) && q.date <= asOf).map(q => [q.date, q]));
  const sorted = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
  const ttms = sorted.map((row, i) => {
    const window = sorted.slice(Math.max(0, i - 3), i + 1);
    return { ...row, ttm: consecutive(window) ? window.reduce((sum, q) => sum + q.eps, 0) : null };
  });
  const history: IntrinsicValuationPoint[] = ttms.map(row => {
    const target = new Date(`${row.date}T00:00:00Z`);
    target.setUTCFullYear(target.getUTCFullYear() - 3);
    const prior = ttms.find(q => Math.abs(Date.parse(q.date) - target.getTime()) <= 35 * DAY);
    let growth: number | null = null;
    let reason: string | null = null;
    if (row.ttm == null) reason = "Four consecutive reported quarters are required for TTM EPS.";
    else if (row.ttm <= 0) reason = "Nonpositive TTM EPS: an earnings-multiple valuation is not meaningful.";
    else if (prior?.ttm == null) reason = "A comparable TTM EPS observation three years earlier is unavailable.";
    else if (prior.ttm <= 0) reason = "Three-year EPS CAGR is undefined with a nonpositive starting EPS.";
    else growth = ((row.ttm / prior.ttm) ** (1 / 3) - 1) * 100;
    const pe = intrinsicTargetPe(growth);
    if (growth != null && pe == null) reason = "The formula produces a nonpositive target P/E.";
    return {
      date: row.date, periodEnd: row.date, reportedTtmEps: row.ttm, projectedTtmEps: null,
      blendedEps: row.ttm, growthPercent: growth, targetPe: pe,
      fairValue: row.ttm != null && row.ttm > 0 && pe != null ? row.ttm * pe : null,
      isBlended: false, unavailableReason: reason,
    };
  });
  const latest = history.at(-1);
  if (!latest) return history;
  const lastFour = sorted.slice(-4);
  const stale = Date.parse(asOf) - Date.parse(latest.periodEnd) > 190 * DAY;
  const estimateIsNext = estimate && finite(estimate.eps)
    && Date.parse(estimate.date) - Date.parse(latest.periodEnd) >= 65 * DAY
    && Date.parse(estimate.date) - Date.parse(latest.periodEnd) <= 115 * DAY;
  const projected = latest.reportedTtmEps != null && consecutive(lastFour) && estimateIsNext && !stale
    ? latest.reportedTtmEps - lastFour[0].eps + estimate.eps
    : null;
  const blended = projected != null && latest.reportedTtmEps != null ? (latest.reportedTtmEps + projected) / 2 : null;
  let reason = latest.unavailableReason;
  if (stale) reason = "The most recent reported quarter is stale; no current valuation is shown.";
  else if (!estimateIsNext) reason = "Consensus EPS for the immediately following fiscal quarter is unavailable.";
  else if (blended != null && blended <= 0) reason = "Blended TTM EPS is nonpositive.";
  history.push({
    ...latest, date: asOf, projectedTtmEps: projected, blendedEps: blended, isBlended: true,
    fairValue: !stale && blended != null && blended > 0 && latest.targetPe != null ? blended * latest.targetPe : null,
    unavailableReason: reason,
  });
  return history;
}

export interface EpsFact {
  start?: string;
  end: string;
  val: number;
  filed?: string;
  form?: string;
}
export interface EpsSplit {
  date: Date;
  numerator?: number;
  denominator?: number;
}

/** Normalize each fact BEFORE rolling TTM; filed dates prevent double-adjusting restatements. */
export function secQuarterlyEps(facts: EpsFact[], splits: EpsSplit[]): QuarterlyEps[] {
  const normalized = facts.filter(f => ["10-Q", "10-K", "10-Q/A", "10-K/A"].includes(f.form ?? "")
    && finite(f.val) && f.start && Number.isFinite(Date.parse(f.end))).map(f => ({
      ...f,
      val: splits.reduce((v, s) => s.date.getTime() > Date.parse(f.filed ?? f.end) && (s.numerator ?? 0) > 0 && (s.denominator ?? 0) > 0
        ? v * s.denominator! / s.numerator! : v, f.val),
      days: (Date.parse(f.end) - Date.parse(f.start!)) / DAY,
    })).sort((a, b) => (a.filed ?? "").localeCompare(b.filed ?? ""));
  const quarters = new Map<string, QuarterlyEps>();
  for (const f of normalized) if (f.days >= 60 && f.days <= 115) quarters.set(f.end, { date: f.end, eps: f.val });
  // Q4 is often only disclosed through annual and nine-month EPS. Both must
  // describe the same fiscal year and already be on the current split basis.
  const annuals = new Map(normalized.filter(f => f.days >= 330 && f.days <= 380).map(f => [f.end, f]));
  for (const annual of annuals.values()) {
    if (quarters.has(annual.end)) continue;
    const nineMonth = normalized.filter(f => f.start === annual.start && f.days >= 240 && f.days <= 300
      && (Date.parse(annual.end) - Date.parse(f.end)) / DAY >= 65
      && (Date.parse(annual.end) - Date.parse(f.end)) / DAY <= 115).at(-1);
    if (nineMonth) quarters.set(annual.end, { date: annual.end, eps: annual.val - nineMonth.val });
  }
  return [...quarters.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Only reconcile historical reporting/share units when multiple overlaps agree. */
export function reconciledListingEps(
  statements: QuarterlyEps[], listing: QuarterlyEps[], financialToUsd: number,
): QuarterlyEps[] | null {
  if (!(financialToUsd > 0) || !finite(financialToUsd)) return null;
  const ratios: number[] = [];
  for (const row of statements) {
    const overlap = listing.find(q => Math.abs(Date.parse(q.date) - Date.parse(row.date)) <= 35 * DAY);
    if (overlap && Math.abs(row.eps * financialToUsd) > 0.005 && Math.abs(overlap.eps) > 0.005) {
      const ratio = overlap.eps / (row.eps * financialToUsd);
      if (ratio > 0 && finite(ratio)) ratios.push(ratio);
    }
  }
  if (ratios.length < 2) return null;
  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  // Require a recognizable depositary share ratio, not an arbitrary multiplier
  // that might be explained by GAAP-versus-adjusted EPS instead of units.
  const known = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 25, 50, 100];
  const ratio = known.find(r => Math.abs(median / r - 1) <= 0.08);
  if (ratio == null || ratios.some(r => Math.abs(r / ratio - 1) > 0.12)) return null;
  return statements.map(q => ({ date: q.date, eps: q.eps * financialToUsd * ratio }));
}
