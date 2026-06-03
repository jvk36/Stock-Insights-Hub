import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MacroIndicator } from "@workspace/api-client-react";
import IndicatorChartModal from "./IndicatorChartModal";

interface Props {
  indicators: MacroIndicator[];
}

const RATE_CARD_IDS = ["fed_funds", "t2y", "t10y", "yield_curve"];

const FCI_SUITE_IDS = [
  "fed_funds", "yield_curve", "mortgage30", "hy_oas", "ig_oas",
  "nfci", "vix", "usd_index", "wti_crude", "m2_yoy",
];

const WHAT_TO_WATCH: Record<string, string> = {
  fed_funds: "Key benchmark for all credit pricing; pivot signals market regime change",
  yield_curve: "Inversion < 0 historically predicts recession in 12–18 months",
  mortgage30: "High rates cool housing & reduce consumer spending power",
  hy_oas: "Widening spreads signal rising default risk; watch for >500bps",
  ig_oas: "Bellwether for investment-grade corporate credit stress",
  nfci: "Composite of money, debt, equity, real markets. Tightening weighs on growth",
  vix: "VIX >30 signals elevated fear; >40 indicates near-crisis conditions",
  usd_index: "Strong USD tightens global financial conditions and hurts EM",
  wti_crude: "Oil shocks drive inflation; sharp moves affect corporate costs",
  m2_yoy: "Money supply growth drives long-run inflation; contraction is deflationary",
};

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
  if (ind.unitsLabel === "bps") return `${v.toFixed(0)} bps`;
  if (ind.unitsLabel === "%") return `${v.toFixed(2)}%`;
  if (ind.unitsLabel === "% YoY") return `${v.toFixed(2)}%`;
  if (ind.unitsLabel === "$/bbl") return `$${v.toFixed(1)}`;
  if (ind.unitsLabel === "Index") return v.toFixed(1);
  return `${v.toFixed(2)} ${ind.unitsLabel}`;
}

function rateCardLabel(id: string): string {
  switch (id) {
    case "fed_funds": return "Federal Funds Rate";
    case "t2y": return "2-Year Treasury";
    case "t10y": return "10-Year Treasury";
    case "yield_curve": return "2s10s Spread";
    default: return "";
  }
}

interface SelectedIndicator {
  seriesId: string;
  title: string;
  chartUnits: string;
  unitsLabel: string;
}

export default function MacroFinancialConditionsTab({ indicators }: Props) {
  const [selected, setSelected] = useState<SelectedIndicator | null>(null);

  const byId = new Map(indicators.map((i) => [i.id, i]));

  const rateCards = RATE_CARD_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];
  const fciSuite = FCI_SUITE_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];

  function open(ind: MacroIndicator) {
    setSelected({ seriesId: ind.seriesId, title: ind.title, chartUnits: ind.chartUnits, unitsLabel: ind.unitsLabel });
  }

  return (
    <div className="space-y-8">
      {/* a) Fed & Interest Rates Cards */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Fed &amp; Interest Rates
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {rateCards.map((ind) => (
            <Card
              key={ind.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => open(ind)}
            >
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">{rateCardLabel(ind.id)}</CardTitle>
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
                <p className="text-xs text-muted-foreground leading-snug">{ind.explanation}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* b) Financial Conditions Indicators */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Financial Conditions Indicators
        </h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Indicator</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Latest Value</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Source</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Signal</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">What to Watch</th>
              </tr>
            </thead>
            <tbody>
              {fciSuite.map((ind, i) => (
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
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${signalBadgeClass(ind.signal)}`}>
                      {ind.signalLabel ?? "Normal"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell max-w-xs">
                    {WHAT_TO_WATCH[ind.id] ?? ""}
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
