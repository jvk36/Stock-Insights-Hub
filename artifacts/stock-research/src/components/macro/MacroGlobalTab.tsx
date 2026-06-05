import { useState } from "react";
import { LineChart } from "lucide-react";
import type { MacroIndicator } from "@workspace/api-client-react";
import IndicatorChartModal from "./IndicatorChartModal";

interface Props {
  indicators: MacroIndicator[];
}

const GLOBAL_IDS = [
  "ecb_rate", "boe_rate", "ez_cpi_yoy", "jp_cpi_yoy", "uk_cpi_yoy",
  "cn_cpi_yoy", "ez_unemp", "brent_crude", "eurusd", "usdjpy", "usdcny",
];

const IMPACT: Record<string, string> = {
  ecb_rate:    "Sets credit conditions for the Eurozone; divergence from Fed drives EUR/USD",
  boe_rate:    "UK monetary policy anchor; signals BoE's inflation-vs-growth tradeoff",
  ez_cpi_yoy:  "ECB's primary mandate; drives EUR rate expectations",
  jp_cpi_yoy:  "Japan exiting deflation matters for BoJ policy pivot and JPY",
  uk_cpi_yoy:  "BoE inflation target is 2%; persistent deviation = more hikes",
  cn_cpi_yoy:  "China deflation risk weighs on global demand and EM commodity prices",
  ez_unemp:    "Labor market slack determines ECB's ability to ease",
  brent_crude: "Global oil benchmark; higher prices pressure inflation worldwide",
  eurusd:      "Most-traded pair; reflects relative Fed vs ECB policy divergence",
  usdjpy:      "Yen weakness signals BoJ ultra-easy policy; sharp moves = intervention risk",
  usdcny:      "Managed float; PBOC tolerance of weakness signals stimulus vs control",
};

const SIGNAL_LABELS: Record<string, (v: number) => { label: string; cls: string }> = {
  ecb_rate:   (v) => ({ label: v >= 3 ? "Restrictive" : v >= 1 ? "Neutral" : "Accommodative", cls: v >= 3 ? "text-amber-400" : "text-emerald-400" }),
  boe_rate:   (v) => ({ label: v >= 4 ? "Restrictive" : "Neutral", cls: v >= 4 ? "text-amber-400" : "text-muted-foreground" }),
  ez_cpi_yoy: (v) => ({ label: v > 3 ? "Above Target" : v > 2 ? "Near Target" : "Below Target", cls: v > 3 ? "text-red-400" : v > 2 ? "text-amber-400" : "text-emerald-400" }),
  jp_cpi_yoy: (v) => ({ label: v > 2 ? "Above 2%" : v > 0 ? "Positive" : "Negative", cls: v > 2 ? "text-amber-400" : "text-emerald-400" }),
  uk_cpi_yoy: (v) => ({ label: v > 3 ? "Elevated" : "Near Target", cls: v > 3 ? "text-amber-400" : "text-emerald-400" }),
  cn_cpi_yoy: (v) => ({ label: v < 0 ? "Deflation" : v < 1 ? "Low" : "Normal", cls: v < 0 ? "text-red-400" : "text-muted-foreground" }),
};

function signalClass(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "text-emerald-400";
    case "negative": return "text-red-400";
    case "warning": return "text-amber-400";
    default: return "text-foreground";
  }
}

function fmtVal(ind: MacroIndicator): string {
  if (ind.value == null) return "—";
  const v = ind.value;
  if (ind.unitsLabel === "%" || ind.unitsLabel === "% YoY") return `${v.toFixed(2)}%`;
  if (ind.unitsLabel === "$/bbl") return `$${v.toFixed(1)}`;
  if (ind.unitsLabel === "Rate") return v.toFixed(4);
  return `${v.toFixed(2)} ${ind.unitsLabel}`;
}

function getSignalInfo(ind: MacroIndicator): { label: string; cls: string } {
  if (ind.value == null) return { label: "N/A", cls: "text-muted-foreground" };
  const fn = SIGNAL_LABELS[ind.id];
  if (fn) return fn(ind.value);
  return { label: ind.signalLabel ?? "Normal", cls: signalClass(ind.signal) };
}

interface SelectedIndicator {
  seriesId: string;
  title: string;
  chartUnits: string;
  unitsLabel: string;
}

export default function MacroGlobalTab({ indicators }: Props) {
  const [selected, setSelected] = useState<SelectedIndicator | null>(null);

  const byId = new Map(indicators.map((i) => [i.id, i]));
  const rows = GLOBAL_IDS.map((id) => byId.get(id)).filter((ind): ind is MacroIndicator => !!ind && ind.value !== null);

  function open(ind: MacroIndicator) {
    setSelected({ seriesId: ind.seriesId, title: ind.title, chartUnits: ind.chartUnits, unitsLabel: ind.unitsLabel });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Central bank rates, inflation, and FX indicators. Click any row to view the historical chart.
        Data sources: ECB, BoE, Eurostat, MIC Japan, ONS, NBS, EIA, Federal Reserve, PBoC.
      </p>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Indicator</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Latest Value</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Source</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Signal</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Impact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ind, i) => {
              const { label, cls } = getSignalInfo(ind);
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
                    {fmtVal(ind)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{ind.source}</td>
                  <td className={`px-4 py-3 text-xs font-medium hidden sm:table-cell ${cls}`}>{label}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell max-w-xs">
                    {IMPACT[ind.id] ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-muted-foreground bg-muted/20 border-t border-border">
          <span className="font-medium text-foreground/60">Legend:</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />Accommodative / At Target</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />Neutral / Near Target</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-red-400" />Restrictive / Well Above</span>
          <span className="flex items-center gap-1.5 ml-auto"><LineChart className="w-3 h-3 text-primary/40" />Click row to view chart</span>
        </div>
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
