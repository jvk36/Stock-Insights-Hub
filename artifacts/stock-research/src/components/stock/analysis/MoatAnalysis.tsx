import type { MoatRow } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info, CheckCircle, XCircle, MinusCircle } from "lucide-react";

interface Props {
  moatRows: MoatRow[];
}

type MoatVerdict = "moat" | "mixed" | "no_moat" | "na";

interface MetricDef {
  key: keyof Omit<MoatRow, "year">;
  label: string;
  unit: string;
  description: string;
  hasMoatIf: string;
  hasMoatThreshold: number;
  noMoatThreshold: number;
  lowerBetter: boolean;
  formatFn?: (v: number) => string;
}

const METRICS: MetricDef[] = [
  {
    key: "grossMargin",
    label: "Gross Margin",
    unit: "%",
    description: "Gross profit as a % of revenue. High and stable gross margins indicate pricing power — the company can charge more than it costs to produce.",
    hasMoatIf: "> 40% and consistent",
    hasMoatThreshold: 40,
    noMoatThreshold: 20,
    lowerBetter: false,
  },
  {
    key: "sgaMargin",
    label: "SG&A / Gross Profit",
    unit: "%",
    description: "Selling, General & Administrative expenses as a % of gross profit (Buffett-style). A company with a durable moat typically doesn't need to spend heavily on marketing to maintain its position.",
    hasMoatIf: "< 30% of gross profit",
    hasMoatThreshold: 30,
    noMoatThreshold: 80,
    lowerBetter: true,
  },
  {
    key: "daRatio",
    label: "D&A / Gross Profit",
    unit: "%",
    description: "Depreciation & Amortization as a % of gross profit. Low D&A means the company doesn't require expensive physical assets to generate profits — a sign of an asset-light business with a moat.",
    hasMoatIf: "< 10% of gross profit",
    hasMoatThreshold: 10,
    noMoatThreshold: 25,
    lowerBetter: true,
  },
  {
    key: "interestRatio",
    label: "Interest Expense / Pre-tax Income",
    unit: "%",
    description: "Net interest expense as a % of pre-tax income. Companies with strong moats generate enough earnings that interest payments are a small burden. High interest expense can signal financial fragility.",
    hasMoatIf: "< 15% of pre-tax income",
    hasMoatThreshold: 15,
    noMoatThreshold: 50,
    lowerBetter: true,
  },
  {
    key: "taxRate",
    label: "Income Tax Rate",
    unit: "%",
    description: "Income taxes as a % of pre-tax income. A consistently profitable company pays taxes regularly near the statutory rate (~21%). Erratic or negative tax rates may indicate financial distress or accounting complexities.",
    hasMoatIf: "Consistently ~21%",
    hasMoatThreshold: 21,
    noMoatThreshold: 0,
    lowerBetter: false,
    formatFn: (v) => v.toFixed(1),
  },
  {
    key: "netMargin",
    label: "Net Profit Margin",
    unit: "%",
    description: "Net income as a % of revenue. A high and stable net margin is one of the clearest signals of a durable competitive advantage — the company retains a large share of every dollar it earns.",
    hasMoatIf: "> 20% and consistent",
    hasMoatThreshold: 20,
    noMoatThreshold: 10,
    lowerBetter: false,
  },
  {
    key: "capexRatio",
    label: "CapEx / Net Income",
    unit: "%",
    description: "Capital expenditures as a % of net income. A moat business doesn't need to reinvest heavily just to maintain its position. Low CapEx relative to earnings means more free cash for shareholders.",
    hasMoatIf: "< 25% of net income",
    hasMoatThreshold: 25,
    noMoatThreshold: 75,
    lowerBetter: true,
  },
  {
    key: "liabToEquity",
    label: "Total Liabilities / Equity",
    unit: "x",
    description: "Total liabilities divided by shareholders' equity. Companies with strong moats often carry little debt because they generate enough cash internally. Note: large buyback programs can reduce equity, inflating this ratio.",
    hasMoatIf: "< 0.80x",
    hasMoatThreshold: 0.8,
    noMoatThreshold: 2.0,
    lowerBetter: true,
    formatFn: (v) => v.toFixed(2),
  },
  {
    key: "roe",
    label: "Return on Equity (ROE)",
    unit: "%",
    description: "Net income as a % of shareholders' equity. High ROE means the company generates strong profits from the capital shareholders have invested. A consistently high ROE is a hallmark of a moat business.",
    hasMoatIf: "> 15% and consistent",
    hasMoatThreshold: 15,
    noMoatThreshold: 10,
    lowerBetter: false,
  },
];

function cellColor(metric: MetricDef, value: number | null | undefined): string {
  if (value == null) return "text-muted-foreground";
  const { hasMoatThreshold, noMoatThreshold, lowerBetter, key } = metric;

  // Tax rate: special — score by distance from 21%
  if (key === "taxRate") {
    const dist = Math.abs(value - 21);
    if (dist < 5) return "text-emerald-700 font-semibold";
    if (dist < 12) return "text-amber-700 font-semibold";
    return "text-rose-700 font-semibold";
  }

  if (lowerBetter) {
    if (value <= hasMoatThreshold) return "text-emerald-700 font-semibold";
    if (value <= noMoatThreshold) return "text-amber-700 font-semibold";
    return "text-rose-700 font-semibold";
  } else {
    if (value >= hasMoatThreshold) return "text-emerald-700 font-semibold";
    if (value >= noMoatThreshold) return "text-amber-700 font-semibold";
    return "text-rose-700 font-semibold";
  }
}

function getVerdict(metric: MetricDef, values: (number | null | undefined)[]): MoatVerdict {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return "na";

  const { hasMoatThreshold, noMoatThreshold, lowerBetter, key } = metric;

  const scores = valid.map((v) => {
    if (key === "taxRate") {
      const dist = Math.abs(v - 21);
      return dist < 5 ? 2 : dist < 12 ? 1 : 0;
    }
    if (lowerBetter) {
      return v <= hasMoatThreshold ? 2 : v <= noMoatThreshold ? 1 : 0;
    } else {
      return v >= hasMoatThreshold ? 2 : v >= noMoatThreshold ? 1 : 0;
    }
  });

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 1.7) return "moat";
  if (avg >= 0.8) return "mixed";
  return "no_moat";
}

function VerdictBadge({ verdict }: { verdict: MoatVerdict }) {
  if (verdict === "moat")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
        <CheckCircle className="w-3 h-3" /> Has Moat
      </span>
    );
  if (verdict === "mixed")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
        <MinusCircle className="w-3 h-3" /> Mixed
      </span>
    );
  if (verdict === "no_moat")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-200">
        <XCircle className="w-3 h-3" /> No Moat
      </span>
    );
  return <span className="text-xs text-muted-foreground">N/A</span>;
}

function OverallVerdict({ verdicts }: { verdicts: MoatVerdict[] }) {
  const valid = verdicts.filter((v) => v !== "na");
  if (valid.length === 0) return null;
  const moatCount = valid.filter((v) => v === "moat").length;
  const mixedCount = valid.filter((v) => v === "mixed").length;
  const noMoatCount = valid.filter((v) => v === "no_moat").length;
  const score = (moatCount * 2 + mixedCount) / (valid.length * 2);

  if (score >= 0.75) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
        <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800">Strong Competitive Moat Detected</p>
          <p className="text-sm text-emerald-700 mt-0.5">
            {moatCount} of {valid.length} indicators show moat characteristics. This company exhibits the financial hallmarks of a durable competitive advantage — consistently high margins, low capital needs, and strong returns.
          </p>
        </div>
      </div>
    );
  }
  if (score >= 0.45) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
        <MinusCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-amber-800">Partial / Uncertain Moat</p>
          <p className="text-sm text-amber-700 mt-0.5">
            {moatCount} moat, {mixedCount} mixed, {noMoatCount} no-moat indicators. The business shows some competitive advantages but also areas of concern. Dig deeper into the specific weak metrics before concluding.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-rose-50 border border-rose-200">
      <XCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold text-rose-800">Weak or No Moat Detected</p>
        <p className="text-sm text-rose-700 mt-0.5">
          Most indicators suggest this company lacks a durable competitive advantage. Low margins, high capital requirements, or volatile returns make it difficult to compound wealth reliably over time.
        </p>
      </div>
    </div>
  );
}

export default function MoatAnalysis({ moatRows }: Props) {
  const years = moatRows.map((r) => r.year);

  function getValues(key: keyof Omit<MoatRow, "year">): (number | null | undefined)[] {
    return moatRows.map((r) => r[key]);
  }

  const verdicts = METRICS.map((m) => getVerdict(m, getValues(m.key)));

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <Card className="border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              A <strong className="text-foreground">MOAT Analysis</strong> (popularised by Warren Buffett) evaluates whether a company has a durable competitive advantage — a "moat" that protects it from competitors and allows it to earn above-average profits for years. This analysis uses 9 financial metrics over 5 years, inspired by the methodology in <em>Buffettology</em>. Consistency matters as much as the absolute level: a moat business shows stable, predictable numbers across economic cycles.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Overall Verdict */}
      <OverallVerdict verdicts={verdicts} />

      {/* Metric Table */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">9-Metric MOAT Scorecard — {years.join(", ")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground min-w-[180px]">Metric</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-xs">Has Moat If</th>
                  {years.map((y) => (
                    <th key={y} className="text-right px-3 py-2.5 font-semibold text-muted-foreground">{y}</th>
                  ))}
                  <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric, idx) => {
                  const values = getValues(metric.key);
                  const verdict = verdicts[idx];
                  return (
                    <tr key={metric.key} className="border-b border-border/50 hover:bg-muted/20 group">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{metric.label}</div>
                        <div className="text-muted-foreground mt-0.5 leading-tight max-w-xs hidden group-hover:block text-xs">
                          {metric.description}
                        </div>
                        <div className="text-muted-foreground mt-0.5 leading-tight max-w-xs block group-hover:hidden text-xs line-clamp-2">
                          {metric.description}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-muted-foreground whitespace-nowrap">
                        {metric.hasMoatIf}
                      </td>
                      {values.map((val, i) => (
                        <td key={years[i]} className={`px-3 py-3 text-right font-mono ${cellColor(metric, val)}`}>
                          {val != null
                            ? `${metric.formatFn ? metric.formatFn(val) : val.toFixed(1)}${metric.unit}`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <VerdictBadge verdict={verdict} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-700 font-semibold">Green</span> = meets moat threshold. <span className="text-amber-700 font-semibold">Amber</span> = borderline. <span className="text-rose-700 font-semibold">Red</span> = does not meet threshold. Hover over a row to read the full description. Data sourced from Yahoo Finance annual fundamentals.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards for deeper explanation */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {METRICS.map((metric, idx) => {
          const values = getValues(metric.key);
          const verdict = verdicts[idx];
          const valid = values.filter((v): v is number => v != null);
          const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;

          return (
            <Card key={metric.key} className="border-border">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold">{metric.label}</p>
                  <VerdictBadge verdict={verdict} />
                </div>
                {avg != null && (
                  <p className={`text-xl font-bold font-mono mb-2 ${cellColor(metric, avg)}`}>
                    {metric.formatFn ? metric.formatFn(avg) : avg.toFixed(1)}{metric.unit}
                    <span className="text-xs text-muted-foreground font-normal ml-1">5-yr avg</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground leading-relaxed">{metric.description}</p>
                <p className="text-xs text-primary mt-2">Has moat if: {metric.hasMoatIf}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
