import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "lucide-react";
import type { MacroIndicator, MarketCycle } from "@workspace/api-client-react";
import IndicatorChartModal from "./IndicatorChartModal";

interface Props {
  indicators: MacroIndicator[];
  marketCycle: MarketCycle;
}

const KEY_READING_IDS = ["gdp_growth", "cpi_yoy", "unemployment", "fed_funds", "t10y", "ism_mfg"];
const SIGNAL_CARD_IDS = ["yield_curve", "hy_oas", "nfp_mom", "lei", "consumer_conf", "sp500_200ma"];

type Signal = "positive" | "negative" | "warning" | "neutral";

function dotCls(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "bg-emerald-400";
    case "negative": return "bg-red-400";
    case "warning":  return "bg-amber-400";
    default:         return "bg-slate-500";
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

function valueCls(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "text-emerald-400";
    case "negative": return "text-red-400";
    case "warning":  return "text-amber-400";
    default:         return "text-foreground";
  }
}

function rowAccentCls(signal: string | null | undefined): string {
  switch (signal) {
    case "positive": return "border-l-emerald-500";
    case "negative": return "border-l-red-500";
    case "warning":  return "border-l-amber-500";
    default:         return "border-l-transparent";
  }
}

function fmtVal(ind: MacroIndicator): string {
  if (ind.value == null) return "—";
  const v = ind.value;
  if (ind.unitsLabel === "bps") {
    const sign = v >= 0 ? "+" : "−";
    return `${sign}${Math.abs(v).toFixed(0)} bps`;
  }
  if (ind.unitsLabel === "% dev") {
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(1)}%`;
  }
  if (ind.unitsLabel === "K") {
    const sign = v >= 0 ? "+" : "";
    return `${sign}${Math.abs(v).toFixed(0)}K`;
  }
  if (ind.unitsLabel === "% MoM") {
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}% MoM`;
  }
  if (ind.unitsLabel === "Index") return v.toFixed(1);
  if (ind.unitsLabel.startsWith("%")) return `${v.toFixed(2)}%`;
  return `${v.toFixed(2)} ${ind.unitsLabel}`;
}

function computeRecessionProb(byId: Map<string, MacroIndicator>): {
  prob: number; label: string; signal: Signal; factors: string[];
} {
  let score = 0;
  let maxScore = 0;
  const factors: string[] = [];

  const yc = byId.get("yield_curve");
  if (yc?.value != null) {
    maxScore += 30;
    if (yc.value < -50) { score += 30; factors.push("Deep yield curve inversion"); }
    else if (yc.value < 0) { score += 18; factors.push("Mild yield curve inversion"); }
    else if (yc.value < 50) { score += 5; factors.push("Flat yield curve"); }
    else factors.push("Normal yield curve slope");
  }

  const lei = byId.get("lei");
  if (lei?.value != null) {
    maxScore += 25;
    if (lei.value < -1) { score += 25; factors.push("LEI in sharp decline"); }
    else if (lei.value < 0) { score += 14; factors.push("LEI declining"); }
    else if (lei.value < 0.3) { score += 4; factors.push("LEI flat"); }
    else factors.push("LEI advancing");
  }

  const hy = byId.get("hy_oas");
  if (hy?.value != null) {
    maxScore += 25;
    if (hy.value > 800) { score += 25; factors.push("HY spreads at crisis levels"); }
    else if (hy.value > 500) { score += 14; factors.push("HY spreads widening sharply"); }
    else if (hy.value > 400) { score += 7; factors.push("HY spreads above average"); }
    else factors.push("HY credit spreads contained");
  }

  const nfp = byId.get("nfp_mom");
  if (nfp?.value != null) {
    maxScore += 20;
    if (nfp.value < 0) { score += 20; factors.push("Job losses — recession signal"); }
    else if (nfp.value < 75) { score += 10; factors.push("Payrolls very weak"); }
    else if (nfp.value < 150) { score += 4; factors.push("Payrolls below trend"); }
    else factors.push("Payrolls healthy");
  }

  if (maxScore === 0) return { prob: 12, label: "Low", signal: "positive", factors };
  const prob = Math.min(95, Math.round((score / maxScore) * 100));
  let label: string;
  let signal: Signal;
  if (prob <= 15) { label = "Low"; signal = "positive"; }
  else if (prob <= 35) { label = "Moderate"; signal = "neutral"; }
  else if (prob <= 60) { label = "Elevated"; signal = "warning"; }
  else { label = "High"; signal = "negative"; }
  return { prob, label, signal, factors };
}

interface AssetSignal {
  signal: Signal;
  label: string;
  explanation: string;
  factors: string[];
}

function computeAssetCompass(
  type: "equities" | "fixed_income" | "commodities",
  byId: Map<string, MacroIndicator>,
): AssetSignal {
  const getSig = (id: string) => byId.get(id)?.signal;
  const getVal = (id: string) => byId.get(id)?.value ?? null;

  if (type === "equities") {
    let score = 0;
    const factors: string[] = [];
    if (getSig("gdp_growth") === "positive") { score += 2; factors.push("GDP expanding"); }
    else if (getSig("gdp_growth") === "warning") { score -= 1; factors.push("Growth slowing"); }
    else if (getSig("gdp_growth") === "negative") { score -= 2; factors.push("GDP contracting"); }
    if (getSig("cpi_yoy") === "positive") { score += 1; factors.push("Inflation near target"); }
    else if (getSig("cpi_yoy") === "warning") { score -= 1; factors.push("Inflation above target"); }
    else if (getSig("cpi_yoy") === "negative") { score -= 2; factors.push("High inflation pressures"); }
    if (getSig("nfp_mom") === "positive") { score += 2; factors.push("Labor market strong"); }
    else if (getSig("nfp_mom") === "warning") { score -= 1; factors.push("Payrolls below trend"); }
    else if (getSig("nfp_mom") === "negative") { score -= 2; factors.push("Job losses detected"); }
    if (getSig("hy_oas") === "positive") { score += 1; factors.push("Credit spreads tight"); }
    else if (getSig("hy_oas") === "negative") { score -= 2; factors.push("Credit stress elevated"); }
    if (getSig("sp500_200ma") === "positive") { score += 1; factors.push("Price above 200d MA"); }
    else if (getSig("sp500_200ma") === "negative") { score -= 1; factors.push("Price below 200d MA"); }
    if (score >= 4) return { signal: "positive", label: "Positive", explanation: "Growth, labor, and credit all supportive — earnings resiliency favored.", factors };
    if (score >= 1) return { signal: "neutral", label: "Neutral", explanation: "Mixed signals — selective approach, favor quality and dividend names.", factors };
    if (score >= -2) return { signal: "warning", label: "Cautious", explanation: "Macro headwinds building — defensive tilt, reduce cyclical exposure.", factors };
    return { signal: "negative", label: "Negative", explanation: "Recessionary signals dominant — defensive positioning, capital preservation.", factors };
  }

  if (type === "fixed_income") {
    let score = 0;
    const factors: string[] = [];
    const ff = getVal("fed_funds");
    const yc = getVal("yield_curve");
    const t10 = getVal("t10y");
    const be = getVal("breakeven_5y5y");
    if (ff != null) {
      if (ff >= 4.5) { score += 1; factors.push("High short-end: cash attractive"); }
      else if (ff < 2.5) { score -= 1; factors.push("Low rates: limited income buffer"); }
    }
    if (yc != null) {
      if (yc < 0) { score += 1; factors.push("Inverted curve: short-end elevated vs long"); }
      else if (yc > 100) { score += 1; factors.push("Normal curve: duration supported"); }
    }
    if (t10 != null) {
      if (t10 >= 4.5) { score += 2; factors.push(`10Y at ${t10.toFixed(2)}%: attractive entry`); }
      else if (t10 >= 3) { score += 1; factors.push("Moderate 10Y: balanced opportunity"); }
      else { score -= 1; factors.push("Low 10Y yield: limited upside"); }
    }
    if (be != null && be >= 2.5) { score += 1; factors.push("Elevated breakevens: TIPS as hedge"); }
    if (score >= 3) return { signal: "positive", label: "Positive", explanation: "High yields offer attractive income entry; short-end and TIPS appealing.", factors };
    if (score >= 1) return { signal: "neutral", label: "Neutral", explanation: "Balanced outlook — barbell approach (short duration + TIPS) recommended.", factors };
    if (score >= -1) return { signal: "warning", label: "Cautious", explanation: "Rate uncertainty creates duration headwinds — favor floating-rate, short-duration.", factors };
    return { signal: "negative", label: "Negative", explanation: "Unfavorable rate environment — minimize duration, prioritize short-dated quality.", factors };
  }

  let score = 0;
  const factors: string[] = [];
  const wti = getVal("wti_crude");
  const usd = getVal("usd_index");
  if (wti != null) {
    if (wti > 85) { score += 2; factors.push(`Oil at $${wti.toFixed(0)}: energy supply tight`); }
    else if (wti > 65) { score += 1; factors.push(`Oil at $${wti.toFixed(0)}: moderate levels`); }
    else { score -= 1; factors.push(`Weak oil at $${wti.toFixed(0)}: demand concerns`); }
  }
  if (usd != null) {
    if (usd > 106) { score -= 2; factors.push("Strong USD: major commodity headwind"); }
    else if (usd > 101) { score -= 1; factors.push("Elevated USD: modest pressure"); }
    else { score += 1; factors.push("Weaker USD: supportive for commodities"); }
  }
  if (getSig("gdp_growth") === "positive") { score += 1; factors.push("Growth drives industrial demand"); }
  else if (getSig("gdp_growth") === "negative") { score -= 1; factors.push("Recession risk weighs on metals"); }
  if (score >= 3) return { signal: "positive", label: "Positive", explanation: "Energy supply tightness and supportive USD underpin commodities; gold hedge attractive.", factors };
  if (score >= 1) return { signal: "neutral", label: "Neutral", explanation: "Mixed signals — energy and USD diverging; selective approach recommended.", factors };
  if (score >= -1) return { signal: "warning", label: "Cautious", explanation: "Strong USD and growth uncertainty create headwinds; gold may outperform.", factors };
  return { signal: "negative", label: "Negative", explanation: "Recessionary demand destruction and strong USD create adverse environment.", factors };
}

interface SelectedIndicator {
  seriesId: string;
  title: string;
  chartUnits: string;
  unitsLabel: string;
}

const REGIME_EXPLANATIONS: Record<string, string> = {
  "Recovery":          "Economy healing after contraction — labor improving, credit recovering, early earnings rebound beginning.",
  "Early Expansion":   "Growth accelerating from low levels — corporate earnings recovering, unemployment falling, consumer confidence rebuilding.",
  "Mid Expansion":     "Healthy, self-sustaining growth — strong labor, solid consumer spending, moderate inflation, healthy corporate profits.",
  "Late Expansion":    "Growth peaking — labor tight, inflation pressures building, yield curve flattening, central bank tightening.",
  "Early Contraction": "Growth decelerating — leading indicators rolling over, credit tightening, confidence weakening.",
  "Recession":         "Economic contraction — GDP declining, unemployment rising, credit spreads wide, central banks likely pivoting to easing.",
};

const TABLE_LEGEND = (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-muted-foreground bg-muted/20 border-t border-border">
    <span className="font-medium text-foreground/60">Legend:</span>
    <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />Positive / Expansion</span>
    <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />Caution / Slowing</span>
    <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-red-400" />Warning / Contraction</span>
    <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-slate-500" />No Data</span>
    <span className="flex items-center gap-1.5 ml-auto"><LineChart className="w-3 h-3 text-primary/40" />Click row to view chart</span>
  </div>
);

export default function MacroOverviewTab({ indicators, marketCycle }: Props) {
  const [selected, setSelected] = useState<SelectedIndicator | null>(null);

  const byId = new Map(indicators.map((i) => [i.id, i]));
  const keyReadings = KEY_READING_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];
  const signalCards = SIGNAL_CARD_IDS.map((id) => byId.get(id)).filter(Boolean) as MacroIndicator[];

  const recProb = computeRecessionProb(byId);
  const equitiesSignal = computeAssetCompass("equities", byId);
  const fiSignal = computeAssetCompass("fixed_income", byId);
  const cmdSignal = computeAssetCompass("commodities", byId);

  const regimeSignal: Signal =
    marketCycle.phase === "Recession" ? "negative" :
    ["Early Contraction", "Late Expansion"].includes(marketCycle.phase) ? "warning" : "positive";

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
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Indicator</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Value</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Reading</th>
              </tr>
            </thead>
            <tbody>
              {keyReadings.map((ind, i) => (
                <tr
                  key={ind.id}
                  onClick={() => open(ind)}
                  className={`border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors border-l-2 ${rowAccentCls(ind.signal)} ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <LineChart className="w-3.5 h-3.5 text-primary/40 flex-shrink-0" />
                      <span className="font-medium">{ind.title}</span>
                      <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">· {ind.source}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${valueCls(ind.signal)}`}>
                    {fmtVal(ind)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${signalBadgeCls(ind.signal)}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls(ind.signal)}`} />
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
          {TABLE_LEGEND}
        </div>
      </section>

      {/* b) Signal Dashboard */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Signal Dashboard
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {signalCards.map((ind) => (
            <Card
              key={ind.id}
              className="cursor-pointer hover:border-primary/40 transition-colors group"
              onClick={() => open(ind)}
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground leading-snug group-hover:text-foreground transition-colors">
                    {ind.title}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotCls(ind.signal)}`} />
                    <LineChart className="w-3 h-3 text-primary/30 group-hover:text-primary/60 transition-colors" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className={`text-2xl font-bold font-mono mb-2 tabular-nums ${valueCls(ind.signal)}`}>
                  {fmtVal(ind)}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${signalBadgeCls(ind.signal)}`}>
                    {ind.signalLabel ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">{ind.date}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{ind.explanation}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 px-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/60">Legend:</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />Risk-On / Positive</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />Caution</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-red-400" />Risk-Off / Warning</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-slate-500" />No Data</span>
          <span className="flex items-center gap-1.5 ml-2"><LineChart className="w-3 h-3 text-primary/40" />Click card to view chart</span>
        </div>
      </section>

      {/* c) Regime & Risk Gauges */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Regime &amp; Risk Gauges
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Current Regime</CardTitle>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${signalBadgeCls(regimeSignal)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotCls(regimeSignal)}`} />
                  {marketCycle.phase}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                {REGIME_EXPLANATIONS[marketCycle.phase] ?? "Composite regime signal based on GDP, labor, yield curve, ISM PMI, and credit indicators."}
              </p>
              <div className="text-xs text-muted-foreground">
                Model confidence: <span className="font-semibold text-foreground">{marketCycle.confidence.toFixed(0)}%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">12M Recession Probability</CardTitle>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${signalBadgeCls(recProb.signal)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotCls(recProb.signal)}`} />
                  {recProb.label}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-3xl font-bold font-mono mb-2 tabular-nums ${valueCls(recProb.signal)}`}>
                {recProb.prob}%
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 mb-3">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    recProb.signal === "positive" ? "bg-emerald-500" :
                    recProb.signal === "negative" ? "bg-red-500" :
                    recProb.signal === "warning"  ? "bg-amber-500" : "bg-slate-500"
                  }`}
                  style={{ width: `${recProb.prob}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-snug mb-2">
                Composite estimate: yield curve slope, LEI trend, HY credit spreads, payroll momentum.
              </p>
              <ul className="space-y-0.5">
                {recProb.factors.slice(0, 4).map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="text-primary/40 flex-shrink-0">·</span>{f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* d) Asset Class Compass */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Asset Class Compass
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            { label: "Equities",     sig: equitiesSignal, bases: "Earnings resiliency · Valuations · Quality/Dividend tilt" },
            { label: "Fixed Income", sig: fiSignal,       bases: "Rate levels · Duration risk · Short-end · TIPS/inflation" },
            { label: "Commodities",  sig: cmdSignal,      bases: "Energy supply · Gold as hedge · Copper growth proxy" },
          ]).map(({ label, sig, bases }) => (
            <Card key={label}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{label}</CardTitle>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${signalBadgeCls(sig.signal)}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotCls(sig.signal)}`} />
                    {sig.label}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground leading-snug mb-2">{sig.explanation}</p>
                <p className="text-xs text-muted-foreground/50 italic mb-2">{bases}</p>
                <ul className="space-y-0.5 mt-2">
                  {sig.factors.slice(0, 3).map((f, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        /strong|tight|above|grow|healthy|normal|attract|low spread/i.test(f) ? "bg-emerald-400" :
                        /weak|contrac|loss|below|crisis|sharp|reces/i.test(f)               ? "bg-red-400" :
                        "bg-amber-400"
                      }`} />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
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
