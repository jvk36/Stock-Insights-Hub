import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "lucide-react";
import type { MacroIndicator } from "@workspace/api-client-react";
import IndicatorChartModal from "./IndicatorChartModal";

interface Props {
  indicators: MacroIndicator[];
}

const HEADLINE_IDS = ["cpi_yoy", "core_cpi_yoy", "pce_yoy", "core_pce_yoy"];
const COMPONENT_IDS = ["shelter_oer", "supercore", "food_at_home", "energy_cpi", "new_vehicles"];
const FULL_SUITE_IDS = [
  "cpi_yoy", "core_cpi_yoy", "pce_yoy", "core_pce_yoy",
  "ppi", "breakeven_5y5y", "mich_infl_1y", "shelter_oer", "supercore",
];

const TARGET = 2.0;

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

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}

function componentStatus(v: number | null | undefined): { label: string; cls: string } {
  if (v == null) return { label: "N/A", cls: "text-muted-foreground" };
  if (v < 0) return { label: "Deflation", cls: "text-emerald-400" };
  if (v < TARGET) return { label: "Below Target", cls: "text-emerald-400" };
  if (v < 3) return { label: "Near Target", cls: "text-amber-400" };
  if (v < 5) return { label: "Above Target", cls: "text-amber-400" };
  return { label: "Well Above", cls: "text-red-400" };
}

interface SelectedIndicator {
  seriesId: string;
  title: string;
  chartUnits: string;
  unitsLabel: string;
}

const TABLE_LEGEND = (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-muted-foreground bg-muted/20 border-t border-border">
    <span className="font-medium text-foreground/60">Legend:</span>
    <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />At / Below Target (≤2%)</span>
    <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />Above Target (2–5%)</span>
    <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-red-400" />Well Above Target (&gt;5%)</span>
    <span className="flex items-center gap-1.5 ml-auto"><LineChart className="w-3 h-3 text-primary/40" />Click to view chart</span>
  </div>
);

export default function MacroInflationTab({ indicators }: Props) {
  const [selected, setSelected] = useState<SelectedIndicator | null>(null);

  const byId = new Map(indicators.map((i) => [i.id, i]));

  const headline = HEADLINE_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];
  const components = COMPONENT_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];
  const fullSuite = FULL_SUITE_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];

  function open(ind: MacroIndicator) {
    setSelected({ seriesId: ind.seriesId, title: ind.title, chartUnits: ind.chartUnits, unitsLabel: ind.unitsLabel });
  }

  return (
    <div className="space-y-8">
      {/* a) Headline Readings */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Headline Readings
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {headline.map((ind) => {
            const v = ind.value;
            const aboveTarget = v != null && v > TARGET;
            const barPct = v != null ? Math.min(100, (v / 8) * 100) : 0;
            return (
              <Card
                key={ind.id}
                className="cursor-pointer hover:border-primary/50 transition-colors group"
                onClick={() => open(ind)}
              >
                <CardHeader className="pb-1 pt-4 px-4">
                  <div className="flex items-center justify-between gap-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{ind.title}</CardTitle>
                    <LineChart className="w-3 h-3 text-primary/30 flex-shrink-0 group-hover:text-primary/60 transition-colors" />
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className={`text-3xl font-bold font-mono mb-1 ${signalClass(ind.signal)}`}>
                    {fmtPct(v)}
                  </div>
                  <div className="h-1.5 bg-muted rounded-full mb-2 relative overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${aboveTarget ? "bg-red-400" : "bg-emerald-400"}`}
                      style={{ width: `${barPct}%` }}
                    />
                    <div className="absolute top-0 h-full w-0.5 bg-primary/60" style={{ left: `${(2 / 8) * 100}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${signalClass(ind.signal)}`}>
                      {aboveTarget ? "Above Target" : "At or Below Target"}
                    </span>
                    <span className="text-xs text-muted-foreground">2% target</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 px-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/60">Legend:</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />At/Below 2% target</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-red-400" />Above 2% target</span>
          <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-primary/60 inline-block" />2% target marker</span>
          <span className="flex items-center gap-1.5 ml-2"><LineChart className="w-3 h-3 text-primary/40" />Click card to view chart</span>
        </div>
      </section>

      {/* b) CPI Component Breakdown */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          CPI Component Breakdown — YoY %
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Component</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">YoY %</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">vs. Target</th>
              </tr>
            </thead>
            <tbody>
              {components.map((ind, i) => {
                const { label, cls } = componentStatus(ind.value);
                return (
                  <tr
                    key={ind.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    onClick={() => open(ind)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <LineChart className="w-3 h-3 text-primary/40 flex-shrink-0" />
                        <span className="font-medium">{ind.title}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${signalClass(ind.signal)}`}>
                      {fmtPct(ind.value)}
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${cls}`}>{label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {TABLE_LEGEND}
        </div>
      </section>

      {/* c) Full Inflation Data Suite */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Full Inflation Data Suite
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Indicator</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Latest Value</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Range vs 2% Target</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Why It Matters</th>
              </tr>
            </thead>
            <tbody>
              {fullSuite.map((ind, i) => (
                <tr
                  key={ind.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  onClick={() => open(ind)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <LineChart className="w-3 h-3 text-primary/40 flex-shrink-0" />
                      <span className="font-medium">{ind.title}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${signalClass(ind.signal)}`}>
                    {ind.value != null ? `${ind.value.toFixed(2)} ${ind.unitsLabel}` : "—"}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {ind.value != null ? (
                      <div className="space-y-1">
                        <div className="relative h-1.5 bg-muted rounded-full overflow-hidden w-28">
                          <div
                            className={`h-full rounded-full ${ind.value <= 2 ? "bg-emerald-400" : ind.value <= 3.5 ? "bg-amber-400" : "bg-red-400"}`}
                            style={{ width: `${Math.min(100, Math.max(2, (Math.abs(ind.value) / 7) * 100))}%` }}
                          />
                          <div className="absolute top-0 h-full w-px bg-primary/70" style={{ left: `${(2 / 7) * 100}%` }} />
                        </div>
                        <p className={`text-xs ${ind.value <= 2 ? "text-emerald-400" : ind.value <= 3.5 ? "text-amber-400" : "text-red-400"}`}>
                          {ind.value <= 2 ? "✓ At/Below" : `+${(ind.value - 2).toFixed(1)}pp above`}
                        </p>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell max-w-xs">
                    {ind.whyItMatters ?? ind.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {TABLE_LEGEND}
        </div>
      </section>

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
