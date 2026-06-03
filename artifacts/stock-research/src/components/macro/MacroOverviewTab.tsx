import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MacroIndicator, MarketCycle } from "@workspace/api-client-react";
import IndicatorChartModal from "./IndicatorChartModal";

interface Props {
  indicators: MacroIndicator[];
  marketCycle: MarketCycle;
}

const KEY_READING_IDS = ["gdp_growth", "cpi_yoy", "unemployment", "fed_funds", "t10y", "indpro_yoy"];
const SIGNAL_CARD_IDS = ["yield_curve", "hy_oas", "nfp_mom", "recession_prob"];

const CYCLE_PHASES = [
  "Recovery",
  "Early Expansion",
  "Mid Expansion",
  "Late Expansion",
  "Early Contraction",
  "Recession",
];

type Signal = "positive" | "negative" | "warning" | "neutral";

function signalBadgeClass(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "negative": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "warning": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function valueClass(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "text-emerald-400";
    case "negative": return "text-red-400";
    case "warning": return "text-amber-400";
    default: return "text-foreground";
  }
}

function fmtVal(ind: MacroIndicator): string {
  if (ind.value == null) return "—";
  if (ind.unitsLabel === "K") return `${ind.value.toFixed(0)}K`;
  return `${ind.value.toFixed(2)}${ind.unitsLabel.startsWith("%") ? "%" : ""}`;
}

interface SelectedIndicator {
  seriesId: string;
  title: string;
  chartUnits: string;
  unitsLabel: string;
}

export default function MacroOverviewTab({ indicators, marketCycle }: Props) {
  const [selected, setSelected] = useState<SelectedIndicator | null>(null);

  const byId = new Map(indicators.map((i) => [i.id, i]));

  const keyReadings = KEY_READING_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];
  const signalCards = SIGNAL_CARD_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];

  const cycleIndex = CYCLE_PHASES.indexOf(marketCycle.phase);
  const yieldCurveInd = byId.get("yield_curve");

  function open(ind: MacroIndicator) {
    setSelected({ seriesId: ind.seriesId, title: ind.title, chartUnits: ind.chartUnits, unitsLabel: ind.unitsLabel });
  }

  return (
    <div className="space-y-8">
      {/* a) Latest Key Readings */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Latest Key Readings At A Glance
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Indicator</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Value</th>
                <th className="text-center px-4 py-2 font-medium text-muted-foreground">Signal</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {keyReadings.map((ind, i) => (
                <tr
                  key={ind.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  onClick={() => open(ind)}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">{ind.title}</span>
                    <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{ind.source}</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${valueClass(ind.signal)}`}>
                    {fmtVal(ind)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${signalBadgeClass(ind.signal)}`}>
                      {ind.signalLabel ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-xs">
                    {ind.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* b) Signal Dashboard */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Signal Dashboard
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {signalCards.map((ind) => (
            <Card
              key={ind.id}
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => open(ind)}
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground leading-snug group-hover:text-foreground transition-colors">
                  {ind.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className={`text-2xl font-bold font-mono mb-2 ${valueClass(ind.signal)}`}>
                  {fmtVal(ind)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{ind.unitsLabel}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${signalBadgeClass(ind.signal)}`}>
                    {ind.signalLabel ?? "—"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{ind.explanation}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* c) Market Cycle & Yield Curve */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Market Cycle & Yield Curve
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Market Cycle */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Market Cycle Phase</CardTitle>
              <p className="text-xs text-muted-foreground">
                Confidence: <span className="font-semibold text-foreground">{marketCycle.confidence.toFixed(0)}%</span>
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {CYCLE_PHASES.map((phase, idx) => {
                  const isActive = phase === marketCycle.phase;
                  const isPast = cycleIndex >= 0 && idx < cycleIndex;
                  return (
                    <span
                      key={phase}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                        ${isActive
                          ? "bg-primary text-primary-foreground border-primary scale-105 shadow-sm"
                          : isPast
                          ? "bg-primary/20 text-primary border-primary/30"
                          : "bg-muted/30 text-muted-foreground border-border"
                        }`}
                    >
                      {phase}
                    </span>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Based on GDP growth, unemployment, yield curve, ISM PMI, and recession probability signals.
                Current phase: <span className="font-semibold text-foreground">{marketCycle.phase}</span>.
              </p>
            </CardContent>
          </Card>

          {/* Yield Curve Card */}
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => yieldCurveInd && open(yieldCurveInd)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">US Treasury Yield Curve (2s10s)</CardTitle>
              <p className="text-xs text-muted-foreground">Click to view long-term chart · Source: Federal Reserve</p>
            </CardHeader>
            <CardContent>
              {yieldCurveInd && (
                <>
                  <div className={`text-3xl font-bold font-mono mb-2 ${valueClass(yieldCurveInd.signal)}`}>
                    {fmtVal(yieldCurveInd)}%
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${signalBadgeClass(yieldCurveInd.signal)}`}>
                      {yieldCurveInd.signalLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">{yieldCurveInd.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {yieldCurveInd.explanation}. A negative spread (inversion) has historically preceded recessions by 12–18 months.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
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
