import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info, AlertCircle } from "lucide-react";
import type { KatsenelsonData, GrahamEpsRow } from "@workspace/api-client-react";

interface Props {
  data: KatsenelsonData;
  currentPrice: number | null;
}

function fmt(v: number | null, prefix = "$", dec = 2): string {
  if (v == null || isNaN(v)) return "—";
  return `${prefix}${v.toFixed(dec)}`;
}

function pct(v: number | null, dec = 1): string {
  if (v == null || isNaN(v)) return "—";
  return `${(v * 100).toFixed(dec)}%`;
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
      <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
      <span>{children}</span>
    </div>
  );
}

function NoteBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
      <span>{children}</span>
    </div>
  );
}

function RiskInput({
  label, value, onChange, description,
}: {
  label: string; value: number; onChange: (v: number) => void; description: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <span className="font-mono text-sm font-semibold text-primary">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min="0.70"
        max="1.00"
        step="0.01"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0.70 (High Risk)</span>
        <span>1.00 (Default)</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export default function KatsenelsonModel({ data, currentPrice }: Props) {
  const [rb, setRb] = useState(1.0);
  const [rf, setRf] = useState(1.0);
  const [re, setRe] = useState(1.0);

  const result = useMemo(() => {
    const ttmEps = data.ttmEps ?? null;
    if (ttmEps == null || ttmEps <= 0) return { incalculable: true as const, reason: "TTM EPS is unavailable or negative — the company is not currently profitable." };

    const rawGrowth = data.epsGrowthRate ?? null;
    const cappedGrowthDecimal = rawGrowth != null ? Math.min(rawGrowth, 0.16) : null;
    const cappedGrowthPct = cappedGrowthDecimal != null ? cappedGrowthDecimal * 100 : null;

    const rawYield = data.dividendYield ?? 0;
    const cappedYieldDecimal = Math.min(rawYield, 0.05);
    const cappedYieldPct = cappedYieldDecimal * 100;

    const growthPoints = cappedGrowthPct != null ? 0.65 * cappedGrowthPct : 0;
    const yieldPoints = 0.5 * cappedYieldPct;
    const basePE = 8 + growthPoints + yieldPoints;
    const absolutePE = basePE * rb * rf * re;
    const intrinsicValue = ttmEps * absolutePE;
    const upside = currentPrice != null ? ((intrinsicValue - currentPrice) / currentPrice) * 100 : null;

    return {
      incalculable: false as const,
      ttmEps,
      rawGrowth,
      cappedGrowthDecimal,
      cappedGrowthPct,
      rawYield,
      cappedYieldDecimal,
      cappedYieldPct,
      growthPoints,
      yieldPoints,
      basePE,
      absolutePE,
      intrinsicValue,
      upside,
    };
  }, [data, rb, rf, re]);

  const epsHistory = (data.epsHistory ?? []).sort((a: GrahamEpsRow, b: GrahamEpsRow) => a.year.localeCompare(b.year));
  const positiveEps = epsHistory.filter((r: GrahamEpsRow) => r.eps != null && r.eps > 0);
  const oldestPositive = positiveEps[0];
  const latest = positiveEps[positiveEps.length - 1];
  const yearsSpan = oldestPositive && latest && oldestPositive.year !== latest.year
    ? parseInt(latest.year) - parseInt(oldestPositive.year)
    : null;

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-card border border-border">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">Best For</h3>
        <p className="text-sm">
          <strong>Value-oriented businesses</strong> with steady, predictable earnings. Unlike models that rely
          on volatile market sentiment or speculative growth, Katsenelson's Absolute PE calculates what a stock's
          P/E ratio <em>should be</em> based solely on fundamental merits — growth, dividends, and risk —
          independent of current market multiples.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">EPS History ({epsHistory.length} Years)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-medium text-muted-foreground">Year</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">EPS</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">YoY Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {epsHistory.map((row: GrahamEpsRow, i: number) => {
                      const prev = epsHistory[i - 1];
                      const yoy = prev?.eps != null && prev.eps > 0 && row.eps != null
                        ? (row.eps - prev.eps) / Math.abs(prev.eps)
                        : null;
                      return (
                        <tr key={row.year} className={`border-b border-border/50 hover:bg-muted/30 ${row === oldestPositive || row === latest ? "bg-primary/5" : ""}`}>
                          <td className="py-2 font-mono">
                            {row.year}
                            {row === oldestPositive && yearsSpan != null && <span className="ml-2 text-xs text-muted-foreground">(start)</span>}
                            {row === latest && <span className="ml-2 text-xs text-muted-foreground">(latest)</span>}
                          </td>
                          <td className={`py-2 text-right font-mono ${row.eps != null && row.eps < 0 ? "text-destructive" : ""}`}>
                            {row.eps != null ? `$${row.eps.toFixed(2)}` : "—"}
                          </td>
                          <td className={`py-2 text-right text-xs ${yoy != null && yoy < 0 ? "text-destructive" : "text-success"}`}>
                            {yoy != null ? `${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {oldestPositive && latest && yearsSpan != null && (
                <p className="text-xs text-muted-foreground mt-3">
                  EPS CAGR computed from {oldestPositive.year} (${oldestPositive.eps?.toFixed(2)}) to {latest.year} (${latest.eps?.toFixed(2)}) over {yearsSpan} years.
                  {result.incalculable === false && result.rawGrowth != null && result.rawGrowth > 0.16 && (
                    <span className="text-amber-700 ml-1">Raw growth {pct(result.rawGrowth)} capped at 16% per the model's rules.</span>
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          {result.incalculable ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-3 items-start p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-destructive">Incalculable</p>
                    <p className="text-sm text-muted-foreground mt-1">{result.reason}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">PE Points System</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 font-medium text-muted-foreground">Component</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Formula</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Points Added</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Running Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="py-2">Base PE</td>
                        <td className="py-2 text-right text-muted-foreground text-xs">Starting point for any business</td>
                        <td className="py-2 text-right font-mono">8.0</td>
                        <td className="py-2 text-right font-mono font-semibold">8.00</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2">
                          Growth ({result.cappedGrowthPct != null ? result.cappedGrowthPct.toFixed(1) : "—"}%
                          {result.rawGrowth != null && result.rawGrowth > 0.16 && <span className="text-amber-600 ml-1">↓ capped</span>})
                        </td>
                        <td className="py-2 text-right text-muted-foreground text-xs">0.65 × {result.cappedGrowthPct?.toFixed(1) ?? "—"}</td>
                        <td className="py-2 text-right font-mono">+{result.growthPoints.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono font-semibold">{(8 + result.growthPoints).toFixed(2)}</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2">
                          Dividend Yield ({result.cappedYieldPct.toFixed(1)}%
                          {result.rawYield > 0.05 && <span className="text-amber-600 ml-1">↓ capped</span>})
                        </td>
                        <td className="py-2 text-right text-muted-foreground text-xs">0.5 × {result.cappedYieldPct.toFixed(1)}</td>
                        <td className="py-2 text-right font-mono">+{result.yieldPoints.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono font-semibold text-primary">{result.basePE.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 space-y-3">
                  {[
                    { step: "1", label: "Base Fair PE", value: result.basePE.toFixed(2) + "×", note: `Starting from a base of 8 (a no-growth, no-dividend business), we add 0.65 PE points per 1% of growth and 0.5 PE points per 1% of dividend yield. This gives a fair P/E purely from fundamentals.` },
                    { step: "2", label: "Risk-Adjusted PE (Absolute PE)", value: result.absolutePE.toFixed(2) + "×", note: `Base Fair PE (${result.basePE.toFixed(2)}) × Business Risk (${rb.toFixed(2)}) × Financial Risk (${rf.toFixed(2)}) × Earnings Visibility (${re.toFixed(2)}). Multipliers below 1.0 reduce the PE to account for uncertainty. Default 1.0 means full credit is given.` },
                    { step: "3", label: "TTM EPS", value: `$${result.ttmEps.toFixed(2)}`, note: "Trailing twelve months earnings per share — the actual earnings the business delivered to shareholders over the past year." },
                    { step: "4", label: "Intrinsic Value", value: fmt(result.intrinsicValue), note: `TTM EPS ($${result.ttmEps.toFixed(2)}) × Absolute PE (${result.absolutePE.toFixed(2)}×). The price you should pay for this stock given its growth, dividends, and risk profile.` },
                  ].map(({ step, label, value, note }) => (
                    <div key={step} className="flex gap-3 p-3 rounded-lg border border-border bg-muted/20">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0 font-bold">{step}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-medium">{label}</span>
                          <span className="font-mono font-semibold text-primary">{value}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {result.incalculable === false && (
            <Card className={`border-2 ${result.upside != null && result.upside > 0 ? "border-success/50 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
              <CardContent className="pt-6 text-center space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Verdict</p>
                <p className="text-3xl font-bold font-mono text-primary">{fmt(result.intrinsicValue)}</p>
                <p className="text-sm text-muted-foreground">Intrinsic Value / Share</p>
                {currentPrice != null && (
                  <>
                    <div className="h-px bg-border my-2" />
                    <p className="text-sm">Current Price: <span className="font-mono font-semibold">{fmt(currentPrice)}</span></p>
                    {result.upside != null && (
                      <Badge className={`text-sm px-3 py-1 ${result.upside > 0 ? "bg-success/20 text-success border-success/30" : "bg-destructive/20 text-destructive border-destructive/30"}`} variant="outline">
                        {result.upside > 0 ? "▲" : "▼"} {Math.abs(result.upside).toFixed(1)}% {result.upside > 0 ? "Upside" : "Overvalued"}
                      </Badge>
                    )}
                  </>
                )}
                <div className="h-px bg-border my-2" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>Absolute PE</span><span className="font-mono">{result.absolutePE.toFixed(2)}×</span></div>
                  <div className="flex justify-between"><span>TTM EPS</span><span className="font-mono">${result.ttmEps.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>EPS Growth (capped)</span><span className="font-mono">{result.cappedGrowthPct?.toFixed(1) ?? "—"}%</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Risk Multipliers</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <RiskInput
                label="Business Risk (Rb)"
                value={rb}
                onChange={setRb}
                description="Reflects the volatility and predictability of the company's revenue and operating model. A cyclical business (e.g. mining) warrants a lower Rb than a stable consumer staple. Default 1.0 = minimal business risk."
              />
              <RiskInput
                label="Financial Risk (Rf)"
                value={rf}
                onChange={setRf}
                description="Captures balance sheet risk — primarily debt levels. A company with significant leverage has greater risk of financial distress. Default 1.0 = conservative, well-funded balance sheet."
              />
              <RiskInput
                label="Earnings Visibility (Re)"
                value={re}
                onChange={setRe}
                description="How consistent and predictable future earnings are. A company with lumpy, project-based revenues or high analyst estimate dispersion warrants a lower Re. Default 1.0 = high earnings certainty."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Model Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <NoteBox><strong>Growth cap 16%:</strong> As a value model, excessively high growth assumptions introduce the same speculative risk that value investing seeks to avoid. Katsenelson caps the growth contribution at 16% to ensure the model stays grounded.</NoteBox>
              <NoteBox><strong>Yield cap 5%:</strong> Dividend yields above 5% often signal unsustainably high payouts or a depressed stock price — not genuine income quality. The cap prevents the model from over-rewarding potentially fragile dividends.</NoteBox>
              <InfoBox><strong>Risk defaults at 1.0:</strong> The three multipliers (Rb, Rf, Re) are set to 1.0 by default, giving the business full credit. Reduce them only when you have specific reasons — e.g. high leverage, a cyclical industry, or inconsistent earnings history.</InfoBox>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
