/** Normalization never substitutes unadjusted closes for total-return data. */
export function normalizePerformanceHistory(
  rows: Array<{ date: Date | string | number; adjclose?: number | null }>,
  before: string,
  timeZone = "UTC",
): { prices: Array<{ date: string; adjustedClose: number }>; skipped: number } {
  const unique = new Map<string, number>();
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  let skipped = 0;
  for (const row of rows) {
    const date = row.date instanceof Date ? row.date : new Date(typeof row.date === "number" ? row.date * 1000 : row.date);
    if (!Number.isFinite(date.getTime())) { skipped++; continue; }
    const parts = formatter.formatToParts(date);
    const value = (kind: string) => parts.find((part) => part.type === kind)!.value;
    const day = typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
      ? row.date
      : `${value("year")}-${value("month")}-${value("day")}`;
    if (day >= before) continue;
    if (typeof row.adjclose !== "number" || !Number.isFinite(row.adjclose) || row.adjclose <= 0) {
      skipped++;
      continue;
    }
    unique.set(day, row.adjclose);
  }
  return {
    prices: [...unique].sort(([a], [b]) => a.localeCompare(b)).map(([date, adjustedClose]) => ({ date, adjustedClose })),
    skipped,
  };
}

export function performanceSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase();
  if (!/^[A-Z0-9^][A-Z0-9.^=_-]{0,31}$/.test(symbol)) return null;
  return symbol.replace(/^(BRK|BF)\.([AB])$/, "$1-$2");
}
