/** These newly added managers use the requested top-100 retention policy. */
export const TOP_100_FUND_CIKS = new Set([
  "850529", "1088875", "1081407", "1037389", "1352662", "936753",
  "1697748", "1029160", "1350694", "898382", "1017918", "813917",
  "1517137", "1039565", "1418814", "1138995", "860643", "883965",
  "859804", "1096343", "1641864", "1050442", "948669", "1389403",
  "937394", "1063296", "807985", "1791786", "1135778", "1631014",
  "1697868", "1759760", "1317588", "934639", "1798849", "1631664",
  "1559771", "1314620", "1142062", "1070134", "1766504", "1773994",
  "1454502", "1657335",
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
