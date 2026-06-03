import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MacroIndicator } from "@workspace/api-client-react";
import IndicatorChartModal from "./IndicatorChartModal";

interface Props {
  indicators: MacroIndicator[];
}

const HEALTH_CARD_IDS = ["nfp_mom", "unemployment", "avg_hrly_earn", "jolts"];

const FULL_SUITE_IDS = [
  "nfp_mom", "unemployment", "u6_unemp", "lfpr", "prime_age_lfpr",
  "jolts", "quits_rate", "jobless_claims", "cont_claims", "avg_wkly_hrs", "avg_hrly_earn",
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
  if (ind.unitsLabel === "K") return `${v >= 1000 ? `${(v / 1000).toFixed(0)}M` : `${v.toFixed(0)}K`}`;
  if (ind.unitsLabel === "% YoY") return `${v.toFixed(2)}% YoY`;
  if (ind.unitsLabel === "%") return `${v.toFixed(1)}%`;
  if (ind.unitsLabel === "Hrs") return `${v.toFixed(1)} hrs`;
  return `${v.toFixed(2)} ${ind.unitsLabel}`;
}

function cardExplanation(id: string, label: string): string {
  switch (id) {
    case "nfp_mom":
      return ">200K: Strong · 100–200K: Moderate · <100K: Weak · <0: Job losses";
    case "unemployment":
      return "<4.0%: Full employment · 4–5%: Normal · >5%: Slack · >6%: Recessionary";
    case "avg_hrly_earn":
      return ">4%: Inflationary pressure · 3–4%: Balanced · <3%: Weak wage growth";
    case "jolts":
      return ">8M: Very tight · 6–8M: Tight · 5–6M: Normal · <5M: Cooling";
    default:
      return label ?? "";
  }
}

interface SelectedIndicator {
  seriesId: string;
  title: string;
  chartUnits: string;
  unitsLabel: string;
}

export default function MacroLaborTab({ indicators }: Props) {
  const [selected, setSelected] = useState<SelectedIndicator | null>(null);

  const byId = new Map(indicators.map((i) => [i.id, i]));

  const healthCards = HEALTH_CARD_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];
  const fullSuite = FULL_SUITE_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];

  function open(ind: MacroIndicator) {
    setSelected({ seriesId: ind.seriesId, title: ind.title, chartUnits: ind.chartUnits, unitsLabel: ind.unitsLabel });
  }

  return (
    <div className="space-y-8">
      {/* a) Labor Market Health Cards */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Labor Market Health
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {healthCards.map((ind) => (
            <Card
              key={ind.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => open(ind)}
            >
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground leading-snug">
                  {ind.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className={`text-2xl font-bold font-mono mb-1.5 ${signalClass(ind.signal)}`}>
                  {fmtVal(ind)}
                </div>
                <div className="mb-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${signalBadgeClass(ind.signal)}`}>
                    {ind.signalLabel ?? "Normal"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">
                  {cardExplanation(ind.id, ind.explanation ?? "")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* b) Full Labor Data Suite */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Full Labor Data Suite
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Indicator</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Latest Value</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Source</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Signal</th>
              </tr>
            </thead>
            <tbody>
              {fullSuite.map((ind, i) => (
                <tr
                  key={ind.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  onClick={() => open(ind)}
                >
                  <td className="px-4 py-3 font-medium">{ind.title}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${signalClass(ind.signal)}`}>
                    {fmtVal(ind)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{ind.source}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${signalBadgeClass(ind.signal)}`}>
                      {ind.signalLabel ?? "Normal"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
