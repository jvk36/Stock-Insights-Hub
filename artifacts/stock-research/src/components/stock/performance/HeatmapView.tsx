import { useMemo, useState } from "react";
import type { PricePoint } from "@/lib/performance-calculations";
import { formatPct, returnsHeatmap } from "@/lib/performance-calculations";
import type { MonthCell } from "@/lib/performance-calculations";
import { Methodology, PanelCard, SegButtons, fmtDate } from "./perf-shared";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LEGEND = [-0.1, -0.05, -0.02, 0, 0.02, 0.05, 0.1];

function cellColor(v: number | null, scale: number): string {
  if (v === null) return "transparent";
  const a = Math.min(Math.abs(v) / scale, 1) * 0.75 + 0.08;
  return v >= 0 ? `hsl(152 55% 32% / ${a.toFixed(2)})` : `hsl(0 70% 45% / ${a.toFixed(2)})`;
}

function Cell({ c, scale, label, bold }: { c: MonthCell; scale: number; label: string; bold?: boolean }) {
  const strong = c.value !== null && Math.abs(c.value) / scale > 0.55;
  const text = c.value === null ? "\u2014" : formatPct(c.value);
  const title = c.value === null ? `${label}: unavailable (${c.unavailableReason ?? "no data"})` : `${label}: ${text}${c.partial ? " (partial period)" : ""}`;
  return (
    <td title={title} aria-label={title} className={`border border-background px-1 py-1.5 text-center font-mono text-[11px] ${bold ? "font-semibold" : ""} ${strong ? "text-white" : c.value === null ? "text-muted-foreground" : "text-foreground"}`} style={{ backgroundColor: cellColor(c.value, scale) }}>
      {text}{c.partial && <sup className="ml-0.5 text-[9px]">*</sup>}
    </td>
  );
}

export default function HeatmapView({ prices, asOf }: { prices: PricePoint[]; asOf: string }) {
  const [years, setYears] = useState<number>(10);
  const rows = useMemo(() => returnsHeatmap(prices, asOf, years), [prices, asOf, years]);
  const hasPartial = rows.some((r) => r.annual.partial || r.months.some((m) => m.partial));

  return (
    <PanelCard
      title="Monthly and annual returns"
      testId="panel-heatmap"
      subtitle={<>Latest session {fmtDate(prices[prices.length - 1].date)}</>}
      actions={<SegButtons label="Years shown" testPrefix="button-heatmap-years" value={years} onChange={(value) => setYears(Number(value))} options={[{ value: 10, label: "10Y" }, { value: 15, label: "15Y" }]} />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground" aria-label="Color legend">
        <span>Monthly legend</span>
        {LEGEND.map((v) => (
          <span key={v} className="rounded px-1.5 py-0.5 font-mono text-foreground" style={{ backgroundColor: cellColor(v, 0.1) }}>{formatPct(v, 0)}</span>
        ))}
        <span className="rounded border border-border px-1.5 py-0.5 font-mono">{"\u2014"} unavailable</span>
        <span>* partial (MTD / YTD)</span>
        <span>Annual column uses a ±40% intensity scale.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse" data-testid="table-heatmap">
          <caption className="sr-only">Monthly returns by year with annual total; dash means data unavailable</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-1 py-1 text-left font-medium">Year</th>
              {MONTHS.map((m) => <th key={m} scope="col" className="px-1 py-1 font-medium">{m}</th>)}
              <th scope="col" className="px-1 py-1 font-medium">Year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} data-testid={`row-heatmap-${r.year}`}>
                <th scope="row" className="pr-2 text-left font-mono text-xs">{r.year}</th>
                {r.months.map((c, i) => <Cell key={i} c={c} scale={0.1} label={`${MONTHS[i]} ${r.year}${c.partial ? " MTD" : ""}`} />)}
                <Cell c={r.annual} scale={0.4} bold label={`${r.year} ${r.annual.partial ? "YTD" : "annual"}`} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasPartial && <p className="mt-2 text-[11px] text-muted-foreground">* Current month is month-to-date and current year is year-to-date through the latest completed session.</p>}
      <Methodology>
        <p>Monthly return = last adjusted close of the month / last adjusted close of the prior month - 1. Annual return = last close of the year / last close of the prior year - 1.</p>
        <p>A month or year with no prior base (for example the listing month) or with missing sessions is shown as a dash, never as 0%.</p>
        <p>Adjusted closes estimate total return with reinvested dividends.</p>
      </Methodology>
    </PanelCard>
  );
}
