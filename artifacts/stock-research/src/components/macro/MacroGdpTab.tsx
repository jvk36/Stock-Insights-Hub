import { useState } from "react";
import type { MacroIndicator } from "@workspace/api-client-react";
import IndicatorChartModal from "./IndicatorChartModal";

interface Props {
  indicators: MacroIndicator[];
}

const GDP_IDS = [
  "real_gdp", "gdpnow", "cfnai",
  "indpro", "retail_ex_auto", "durable_goods", "building_permits",
];

function signalClass(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "text-emerald-400";
    case "negative": return "text-red-400";
    case "warning": return "text-amber-400";
    default: return "text-foreground";
  }
}

function signalBadgeClass(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "negative": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "warning": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function fmtVal(ind: MacroIndicator): string {
  if (ind.value == null) return "—";
  const v = ind.value;
  if (ind.unitsLabel === "K") return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(2)}M` : `${v.toFixed(0)}K`;
  if (ind.unitsLabel === "$M") {
    if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}T`;
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}B`;
    return `$${v.toFixed(0)}M`;
  }
  if (ind.unitsLabel.startsWith("% MoM")) return `${v.toFixed(2)}% MoM`;
  if (ind.unitsLabel.startsWith("% YoY")) return `${v.toFixed(2)}% YoY`;
  if (ind.unitsLabel.startsWith("% QoQ")) return `${v.toFixed(2)}% ann.`;
  if (ind.unitsLabel.startsWith("% ann")) return `${v.toFixed(2)}% ann.`;
  if (ind.unitsLabel === "Index") return v.toFixed(2);
  return `${v.toFixed(2)} ${ind.unitsLabel}`;
}

interface SelectedIndicator {
  seriesId: string;
  title: string;
  chartUnits: string;
  unitsLabel: string;
}

export default function MacroGdpTab({ indicators }: Props) {
  const [selected, setSelected] = useState<SelectedIndicator | null>(null);

  const byId = new Map(indicators.map((i) => [i.id, i]));
  const rows = GDP_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];

  function open(ind: MacroIndicator) {
    setSelected({ seriesId: ind.seriesId, title: ind.title, chartUnits: ind.chartUnits, unitsLabel: ind.unitsLabel });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        GDP activity indicators. Click any row to view the historical chart.
        Data sources: BEA, Atlanta Fed, ISM, Federal Reserve, Census Bureau.
      </p>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Indicator</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Latest Value</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Source</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Frequency</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ind, i) => (
              <tr
                key={ind.id}
                className={`border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                onClick={() => open(ind)}
              >
                <td className="px-4 py-3 font-medium">{ind.title}</td>
                <td className={`px-4 py-3 text-right font-mono font-semibold ${signalClass(ind.signal)}`}>
                  {fmtVal(ind)}
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell text-xs">{ind.source}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">{ind.frequency}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {ind.type && (
                    <span className="px-2 py-0.5 rounded text-xs border bg-muted/30 text-muted-foreground border-border">
                      {ind.type}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <IndicatorChartModal
        open={!!selected}
        onClose={() => setSelected(null)}
        seriesId={selected?.seriesId ?? ""}
        title={selected?.title ?? ""}
        chartUnits={selected?.chartUnits ?? "lin"}
        unitsLabel={selected?.unitsLabel ?? ""}
      />
    </div>
  );
}
