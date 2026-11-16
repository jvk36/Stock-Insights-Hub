/** Pure return calculations for the Performance lab. All inputs are adjusted closes sorted by date. */
export interface PricePoint { date: string; adjustedClose: number }

export const DAYS_PER_YEAR = 365.2425;
export const COVERAGE_TOLERANCE_DAYS = 7;
const DAY_MS = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(s: string): number | null {
  const m = ISO.exec(s ?? "");
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

export function isValidIsoDate(s: string): boolean { return parseIsoDate(s) !== null; }

export function daysBetween(a: string, b: string): number {
  const x = parseIsoDate(a), y = parseIsoDate(b);
  if (x === null || y === null) return NaN;
  return Math.round((y - x) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  const t = parseIsoDate(date);
  if (t === null) throw new Error(`Invalid date ${date}`);
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar subtraction; Feb 29 maps to Feb 28 in non-leap target years. */
export function subtractYears(date: string, years: number): string {
  const m = ISO.exec(date);
  if (!m || parseIsoDate(date) === null) throw new Error(`Invalid date ${date}`);
  const y = +m[1] - years, mo = +m[2];
  let d = +m[3];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (mo === 2 && d === 29 && !leap) d = 28;
  return `${String(y).padStart(4, "0")}-${m[2]}-${String(d).padStart(2, "0")}`;
}

export function firstOnOrAfter(prices: PricePoint[], date: string): number {
  let lo = 0, hi = prices.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (prices[mid].date < date) lo = mid + 1; else hi = mid; }
  return lo < prices.length ? lo : -1;
}

export function lastOnOrBefore(prices: PricePoint[], date: string): number {
  let lo = 0, hi = prices.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (prices[mid].date <= date) lo = mid + 1; else hi = mid; }
  return lo - 1;
}

/** Annualized return over actual calendar days / 365.2425. Null for under 1 day or bad values. */
export function annualizedReturn(startDate: string, startValue: number, endDate: string, endValue: number): number | null {
  const days = daysBetween(startDate, endDate);
  if (!Number.isFinite(days) || days < 1 || !(startValue > 0) || !(endValue > 0)) return null;
  const r = Math.pow(endValue / startValue, DAYS_PER_YEAR / days) - 1;
  return Number.isFinite(r) ? r : null;
}

export interface PeriodResult {
  ok: true; start: PricePoint; end: PricePoint; days: number; years: number;
  totalReturn: number; cagr: number | null;
}
export interface PeriodError { ok: false; reason: string }
export type PeriodOutcome = PeriodResult | PeriodError;

/** Requested range resolved to first session on/after start and last on/before end. */
export function resolvePeriod(prices: PricePoint[], startDate: string, endDate: string): PeriodOutcome {
  if (!isValidIsoDate(startDate)) return { ok: false, reason: "Start date is not a valid date." };
  if (!isValidIsoDate(endDate)) return { ok: false, reason: "End date is not a valid date." };
  if (startDate >= endDate) return { ok: false, reason: "Start date must be before end date." };
  if (!prices.length) return { ok: false, reason: "No price history available." };
  if (daysBetween(startDate, prices[0].date) > COVERAGE_TOLERANCE_DAYS) {
    return { ok: false, reason: `Requested start ${startDate} predates available history (first session ${prices[0].date}).` };
  }
  const si = firstOnOrAfter(prices, startDate), ei = lastOnOrBefore(prices, endDate);
  if (si < 0 || ei < 0 || ei <= si) return { ok: false, reason: "No two trading sessions fall inside the requested range." };
  const start = prices[si], end = prices[ei];
  if (daysBetween(startDate, start.date) > COVERAGE_TOLERANCE_DAYS) {
    return { ok: false, reason: `No session within ${COVERAGE_TOLERANCE_DAYS} days after ${startDate} (next session ${start.date}).` };
  }
  if (daysBetween(end.date, endDate) > COVERAGE_TOLERANCE_DAYS) {
    return { ok: false, reason: `No session within ${COVERAGE_TOLERANCE_DAYS} days before ${endDate} (prior session ${end.date}).` };
  }
  const days = daysBetween(start.date, end.date);
  return {
    ok: true, start, end, days, years: days / DAYS_PER_YEAR,
    totalReturn: end.adjustedClose / start.adjustedClose - 1,
    cagr: annualizedReturn(start.date, start.adjustedClose, end.date, end.adjustedClose),
  };
}

/** Trailing N calendar years ending at last session on/before endDate. */
export function trailingPeriod(prices: PricePoint[], endDate: string, years: number): PeriodOutcome {
  const ei = lastOnOrBefore(prices, endDate);
  if (ei < 0) return { ok: false, reason: "No sessions on or before the end date." };
  const endSession = prices[ei].date;
  return resolvePeriod(prices, subtractYears(endSession, years), endSession);
}

/** Last session of each calendar month. */
export function monthEnds(prices: PricePoint[]): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = 0; i < prices.length; i++) {
    const next = prices[i + 1];
    if (!next || next.date.slice(0, 7) !== prices[i].date.slice(0, 7)) out.push(prices[i]);
  }
  return out;
}

export interface CagrPathPoint { date: string; cagr: number | null; cumulative: number }

/** Annualized return since the resolved start at each month end inside range, plus the resolved end.
 * Every positive duration is annualized on actual days; short windows can exaggerate moves (disclosed in UI). */
export function cagrPath(prices: PricePoint[], period: PeriodResult): CagrPathPoint[] {
  const s = period.start;
  const inRange = prices.filter((p) => p.date > s.date && p.date <= period.end.date);
  const pts = monthEnds(inRange).filter((p) => p.date < period.end.date);
  pts.push(period.end);
  return [{ date: s.date, cagr: null, cumulative: 0 }, ...pts.map((p) => ({
    date: p.date,
    cumulative: p.adjustedClose / s.adjustedClose - 1,
    cagr: annualizedReturn(s.date, s.adjustedClose, p.date, p.adjustedClose),
  }))];
}

export interface GrowthPoint { date: string; stock: number; benchmark: number | null }
export type GrowthOutcome =
  | { ok: true; points: GrowthPoint[]; start: string; end: string; benchmarkIncluded: boolean }
  | { ok: false; reason: string };

/** $10,000 growth. With a benchmark, uses only dates both series share so both normalize on identical dates. */
export function growthOfInvestment(stock: PricePoint[], benchmark: PricePoint[] | null, years: number, initial = 10_000): GrowthOutcome {
  if (!stock.length) return { ok: false, reason: "No price history available." };
  let s = stock, b: PricePoint[] | null = null;
  if (benchmark && benchmark.length) {
    const bm = new Map(benchmark.map((p) => [p.date, p.adjustedClose]));
    s = stock.filter((p) => bm.has(p.date));
    b = s.map((p) => ({ date: p.date, adjustedClose: bm.get(p.date)! }));
    if (s.length < 2) return { ok: false, reason: "Stock and benchmark share too few common trading dates." };
    if (daysBetween(benchmark[0].date, subtractYears(s[s.length - 1].date, years)) < -COVERAGE_TOLERANCE_DAYS) {
      return { ok: false, reason: `Benchmark history is shorter than ${years} years.` };
    }
  }
  const end = s[s.length - 1].date;
  const target = subtractYears(end, years);
  if (daysBetween(stock[0].date, target) < -COVERAGE_TOLERANCE_DAYS) {
    return { ok: false, reason: `Not enough history for ${years} years (first session ${stock[0].date}).` };
  }
  const si = firstOnOrAfter(s, target);
  if (si < 0 || si >= s.length - 1) return { ok: false, reason: "Not enough sessions in the requested window." };
  if (daysBetween(target, s[si].date) > COVERAGE_TOLERANCE_DAYS) {
    return { ok: false, reason: `No common session within ${COVERAGE_TOLERANCE_DAYS} days of ${target} (next ${s[si].date}).` };
  }
  const s0 = s[si].adjustedClose, b0 = b ? b[si].adjustedClose : null;
  const points: GrowthPoint[] = [];
  for (let i = si; i < s.length; i++) {
    points.push({ date: s[i].date, stock: (initial * s[i].adjustedClose) / s0, benchmark: b && b0 ? (initial * b[i].adjustedClose) / b0 : null });
  }
  return { ok: true, points, start: s[si].date, end, benchmarkIncluded: !!b };
}

export interface MonthCell { value: number | null; partial: boolean; unavailableReason?: string }
export interface HeatRow { year: number; months: MonthCell[]; annual: MonthCell }

function lastDayOfMonth(key: string): string {
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Monthly/annual returns. asOf (YYYY-MM-DD) marks the current month/year as MTD/YTD. Missing data is null, never 0.
 * A completed month's close must fall within 7 days of calendar month end; annual base is the prior December close. */
export function returnsHeatmap(prices: PricePoint[], asOf: string, yearsBack: number): HeatRow[] {
  if (!prices.length) return [];
  const asOfKey = asOf.slice(0, 7), asOfYear = +asOf.slice(0, 4);
  const raw = new Map(monthEnds(prices).map((p) => [p.date.slice(0, 7), p]));
  const close = (key: string): number | undefined => {
    const p = raw.get(key);
    if (!p) return undefined;
    if (key !== asOfKey && daysBetween(p.date, lastDayOfMonth(key)) > COVERAGE_TOLERANCE_DAYS) return undefined;
    return p.adjustedClose;
  };
  const lastYear = +prices[prices.length - 1].date.slice(0, 4);
  const rows: HeatRow[] = [];
  for (let y = lastYear; y > lastYear - yearsBack; y--) {
    const months: MonthCell[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const prevKey = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
      const cur = close(key), prev = close(prevKey);
      if (cur === undefined) months.push({ value: null, partial: false, unavailableReason: raw.has(key) ? "Month incomplete" : "No sessions" });
      else if (prev === undefined) months.push({ value: null, partial: false, unavailableReason: "No prior month-end base" });
      else months.push({ value: cur / prev - 1, partial: key === asOfKey });
    }
    const isCurrent = y === asOfYear;
    const decBase = close(`${y - 1}-12`);
    let curKey: string | undefined = `${y}-12`;
    if (isCurrent) curKey = [...raw.keys()].filter((k) => k.startsWith(`${y}-`)).sort().pop();
    const cur = curKey ? close(curKey) : undefined;
    const annual: MonthCell = cur === undefined
      ? { value: null, partial: false, unavailableReason: "No year-end close" }
      : decBase === undefined
        ? { value: null, partial: false, unavailableReason: "No prior December base" }
        : { value: cur / decBase - 1, partial: isCurrent };
    rows.push({ year: y, months, annual });
  }
  return rows;
}

export interface RollingPoint { date: string; value: number | null }

/** Rolling annualized return at each month end; start = first session on/after exact N years earlier. */
export function rollingReturns(prices: PricePoint[], years: number): RollingPoint[] {
  if (!prices.length) return [];
  return monthEnds(prices).map((p) => {
    const target = subtractYears(p.date, years);
    if (daysBetween(prices[0].date, target) < -COVERAGE_TOLERANCE_DAYS) return { date: p.date, value: null };
    const si = firstOnOrAfter(prices, target);
    if (si < 0 || prices[si].date >= p.date) return { date: p.date, value: null };
    if (daysBetween(target, prices[si].date) > COVERAGE_TOLERANCE_DAYS) return { date: p.date, value: null };
    return { date: p.date, value: annualizedReturn(prices[si].date, prices[si].adjustedClose, p.date, p.adjustedClose) };
  });
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "\u2014";
  const n = v * 100;
  return `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n).toFixed(digits)}%`;
}
