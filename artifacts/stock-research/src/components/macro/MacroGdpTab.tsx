import { useState } from "react";
import { LineChart } from "lucide-react";
import type { MacroIndicator, MarketCycle } from "@workspace/api-client-react";
import IndicatorChartModal from "./IndicatorChartModal";

interface Props {
  indicators: MacroIndicator[];
  marketCycle: MarketCycle;
}

const GDP_IDS = [
  "real_gdp", "gdpnow",
  "ism_mfg", "ism_svcs", "cfnai",
  "lei", "indpro", "retail_ex_auto", "durable_goods", "building_permits",
];

const CYCLE_PHASES = ["Early Expansion", "Mid Expansion", "Late Expansion", "Recession"];

const PHASE_STYLES = [
  { active: "bg-emerald-500 text-white font-semibold",  past: "bg-emerald-500/20 text-emerald-300", idle: "bg-muted/30 text-muted-foreground", text: "text-emerald-400" },
  { active: "bg-green-400 text-white font-semibold",    past: "bg-green-400/20 text-green-300",    idle: "bg-muted/30 text-muted-foreground", text: "text-green-400"   },
  { active: "bg-amber-400 text-white font-semibold",    past: "bg-amber-400/20 text-amber-300",    idle: "bg-muted/30 text-muted-foreground", text: "text-amber-400"   },
  { active: "bg-red-500 text-white font-semibold",      past: "bg-red-500/20 text-red-300",        idle: "bg-muted/30 text-muted-foreground", text: "text-red-400"     },
];

function normalizeCyclePhase(phase: string): string {
  if (["Recovery", "Early Expansion"].includes(phase)) return "Early Expansion";
  if (phase === "Mid Expansion") return "Mid Expansion";
  if (["Late Expansion", "Early Contraction"].includes(phase)) return "Late Expansion";
  return "Recession";
}

function signalCls(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "text-emerald-400";
    case "negative": return "text-red-400";
    case "warning":  return "text-amber-400";
    default:         return "text-foreground";
  }
}

function signalBadgeCls(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "negative": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "warning":  return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default:         return "bg-muted text-muted-foreground border-border";
  }
}

function typeBadgeCls(type: string | null | undefined): string {
  switch (type) {
    case "Leading":    return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    case "Coincident": return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    case "Lagging":    return "bg-slate-500/10 text-slate-400 border-slate-500/30";
    case "Real-Time":  return "bg-teal-500/10 text-teal-400 border-teal-500/30";
    default:           return "bg-muted text-muted-foreground border-border";
  }
}

function fmtVal(ind: MacroIndicator): string {
  if (ind.value == null) return "—";
  const v = ind.value;
  if (ind.unitsLabel === "K") {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(2)}M`;
    return `${v.toFixed(0)}K`;
  }
  if (ind.unitsLabel === "$M") {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}T`;
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}B`;
    return `$${v.toFixed(0)}M`;
  }
  if (ind.unitsLabel === "% MoM") {
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}% MoM`;
  }
  if (ind.unitsLabel === "% YoY") return `${v.toFixed(2)}% YoY`;
  if (ind.unitsLabel === "% QoQ") return `${v.toFixed(2)}% ann.`;
  if (ind.unitsLabel.startsWith("% ann")) return `${v.toFixed(2)}% ann.`;
  if (ind.unitsLabel === "Index") return v.toFixed(1);
  if (ind.unitsLabel.startsWith("%")) {
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
  }
  return `${v.toFixed(2)} ${ind.unitsLabel}`;
}

interface SelectedIndicator {
  seriesId: string;
  title: string;
  chartUnits: string;
  unitsLabel: string;
}

export default function MacroGdpTab({ indicators, marketCycle }: Props) {
  const [selected, setSelected] = useState<SelectedIndicator | null>(null);

  const byId = new Map(indicators.map((i) => [i.id, i]));
  const rows = GDP_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];

  const normalizedPhase = normalizeCyclePhase(marketCycle.phase);
  const phaseIndex = CYCLE_PHASES.indexOf(normalizedPhase);
  const phaseStyle = PHASE_STYLES[phaseIndex] ?? PHASE_STYLES[0];

  function open(ind: MacroIndicator) {
    setSelected({ seriesId: ind.seriesId, title: ind.title, chartUnits: ind.chartUnits, unitsLabel: ind.unitsLabel });
  }

  return (
    <div className="space-y-6">

      {/* a) Cycle Phase Indicator */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Cycle Phase Indicator
        </h3>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex rounded-md overflow-hidden border border-border mb-3">
            {CYCLE_PHASES.map((phase, i) => {
              const styles = PHASE_STYLES[i];
              const isActive = i === phaseIndex;
              const isPast = i < phaseIndex;
              return (
                <div
                  key={phase}
                  className={`flex-1 py-3 px-1 flex flex-col items-center justify-center text-center border-r border-border/50 last:border-r-0 transition-all
                    ${isActive ? styles.active + " shadow-inner" : isPast ? styles.past : styles.idle}`}
                >
                  <span className="text-xs leading-tight">{phase}</span>
                  {isActive && <span className="text-xs mt-0.5 opacity-75">▲ Now</span>}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${phaseStyle.text}`}>{marketCycle.phase}</span>
              <span className="text-xs text-muted-foreground">· Model confidence: {marketCycle.confidence.toFixed(0)}%</span>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:block">GDP · ISM · LEI · Credit · Labor</span>
          </div>
        </div>
      </section>

      {/* b) GDP Activity & Indicators */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          GDP Activity &amp; Indicators
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Indicator</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Latest Value</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Source</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Frequency</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden xl:table-cell">Signal</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden 2xl:table-cell">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ind, i) => (
                <tr
                  key={ind.id}
                  onClick={() => open(ind)}
                  className={`border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <LineChart className="w-3 h-3 text-primary/40 flex-shrink-0" />
                      <span className="font-medium">{ind.title}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${signalCls(ind.signal)}`}>
                    {fmtVal(ind)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell text-xs">{ind.source}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">{ind.frequency}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {ind.type && (
                      <span className={`px-2 py-0.5 rounded text-xs border ${typeBadgeCls(ind.type)}`}>
                        {ind.type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    {ind.signalLabel && (
                      <span className={`px-2 py-0.5 rounded text-xs border ${signalBadgeCls(ind.signal)}`}>
                        {ind.signalLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden 2xl:table-cell max-w-xs">
                    {ind.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-muted-foreground bg-muted/20 border-t border-border">
            <span className="font-medium text-foreground/60">Type Legend:</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-blue-500/50" />Leading (forward-looking)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-purple-500/50" />Coincident (current)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-slate-500/50" />Lagging</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-teal-500/50" />Real-Time</span>
            <span className="flex items-center gap-1.5 ml-auto"><LineChart className="w-3 h-3 text-primary/40" />Click row to view chart</span>
          </div>
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
