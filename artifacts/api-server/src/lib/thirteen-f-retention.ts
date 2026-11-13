/** These newly added managers use the requested top-100 retention policy. */
export const TOP_100_FUND_CIKS = new Set([
  "850529", "1088875", "1081407", "1037389", "1352662", "936753",
  "1697748", "1029160", "1350694", "898382", "1017918", "813917",
]);
export const MISCELLANEOUS_CUSIP = "__MISC__";
export const MAX_RETAINED_POSITIONS = 100;

/** Storage/display use $000; the SEC switched its source values to dollars in 2023. */
export function reportedValueMultiplier(filingDate: string): number {
  return filingDate < "2023-01-03" ? 1 : 0.001;
}

type Position = { name: string; cusip: string; marketValueThousands: number; shares: number };

export function retainTopPositions<T extends Position>(holdings: T[]): {
  positions: T[];
  miscellaneous: Position | null;
} {
  const sorted = [...holdings].sort((a, b) =>
    b.marketValueThousands - a.marketValueThousands || a.name.localeCompare(b.name) || a.cusip.localeCompare(b.cusip));
  return {
    positions: sorted.slice(0, MAX_RETAINED_POSITIONS),
    miscellaneous: sorted.length > MAX_RETAINED_POSITIONS ? {
      name: "Miscellaneous",
      cusip: MISCELLANEOUS_CUSIP,
      marketValueThousands: sorted.slice(MAX_RETAINED_POSITIONS).reduce((sum, row) => sum + row.marketValueThousands, 0),
      // Not a security: shares and ticker must be suppressed by consumers.
      shares: 0,
    } : null,
  };
}

export function tenYearReportCutoff(now = new Date()): string {
  const date = new Date(now);
  date.setUTCFullYear(date.getUTCFullYear() - 10);
  return date.toISOString().slice(0, 10);
}
