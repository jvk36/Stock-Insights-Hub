import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Info } from "lucide-react";
import type { GrahamData } from "@workspace/api-client-react";

interface Props {
  data: GrahamData;
  currentPrice: number | null;
}

function fmt(v: number | null, prefix = "$", decimals = 2): string {
  if (v == null || isNaN(v)) return "—";
  return `${prefix}${v.toFixed(decimals)}`;
}

function pct(v: number | null, decimals = 1): string {
  if (v == null || isNaN(v)) return "—";
  return `${v.toFixed(decimals)}%`;
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

export default function GrahamModel({ data, currentPrice }: Props) {
  const [bondYield, setBondYield] = useState(5.0);
  const [yFloor, setYFloor] = useState(3.0);
  const [marginOfSafety, setMarginOfSafety] = useState(35);

  const result = useMemo(() => {
    const sorted = [...data.epsHistory]
      .filter(r => r.eps != null)
      .sort((a, b) => a.year.localeCompare(b.year));

    const validEpsVals = sorted.map(r => r.eps as number).filter(v => v > 0);
    const trailingEps = data.trailingEps ?? null;
    const isNegative = (trailingEps != null && trailingEps <= 0) || validEpsVals.length === 0;
    if (isNegative) return { incalculable: true as const };

    const sortedVals = [...validEpsVals].sort((a, b) => a - b);
    const mid = Math.floor(sortedVals.length / 2);
    const medianEps =
      sortedVals.length % 2 === 0
        ? (sortedVals[mid - 1] + sortedVals[mid]) / 2
        : sortedVals[mid];

    const firstEps = validEpsVals[0];
    const lastEps = validEpsVals[validEpsVals.length - 1];
    const n = validEpsVals.length - 1;
    const rawG =
      firstEps > 0 && lastEps > 0 && n > 0
        ? (Math.pow(lastEps / firstEps, 1 / n) - 1) * 100
        : 0;
    const g = Math.min(rawG, 20);
    const capped = rawG > 20;

    const baseEps = trailingEps ?? medianEps;
    const Y = Math.max(bondYield, yFloor);
    const floorApplied = bondYield < yFloor;

    const growthMultiplier = 8.5 + 2 * g;
    const rateAdjustment = 4.4 / Y;
    const V = baseEps * growthMultiplier * rateAdjustment;
    const fairValue = V * (1 - marginOfSafety / 100);

    const upside =
      currentPrice != null && fairValue > 0
        ? ((fairValue - currentPrice) / currentPrice) * 100
        : null;

    return {
      incalculable: false as const,
      sorted,
      medianEps,
      g,
      rawG,
      capped,
      baseEps,
      Y,
      floorApplied,
      growthMultiplier,
      rateAdjustment,
      V,
      fairValue,
      upside,
    };
  }, [data, bondYield, yFloor, marginOfSafety, currentPrice]);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-card border border-border">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
          Best For
        </h3>
        <p className="text-sm">
          Undervalued, mature companies with <strong>stable, slow growth (≤5%)</strong>, strong balance sheets,
          and consistent profitability — established industrials, utilities, or consumer goods firms.
          Not suitable for high-growth, cyclical, or negative-earnings companies.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {result.incalculable ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-3 items-start p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-destructive">Incalculable</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      The Graham model requires positive EPS. This company has negative or zero earnings,
                      which makes the formula mathematically invalid.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">EPS History (up to 10 years)</CardTitle>
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
                        {result.sorted.map((row, i) => {
                          const prev = result.sorted[i - 1]?.eps;
                          const yoy =
                            prev != null && prev > 0 && row.eps != null
                              ? ((row.eps - prev) / prev) * 100
                              : null;
                          return (
                            <tr key={row.year} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-2 font-mono">{row.year}</td>
                              <td className="py-2 text-right font-mono">
                                {row.eps != null ? fmt(row.eps) : "—"}
                              </td>
                              <td className="py-2 text-right">
                                {yoy != null ? (
                                  <span className={yoy >= 0 ? "text-success" : "text-destructive"}>
                                    {yoy >= 0 ? "+" : ""}{yoy.toFixed(1)}%
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    EPS approximated as Net Income ÷ Current Shares Outstanding. Historical share counts
                    may differ due to buybacks/issuances.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Valuation Steps</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    {
                      step: "1",
                      label: "Median EPS (historical)",
                      value: fmt(result.medianEps),
                      note: "Median of all positive historical EPS values — smooths out one-time outliers.",
                    },
                    {
                      step: "2",
                      label: "Trailing EPS (used in formula)",
                      value: fmt(result.baseEps),
                      note: "Most recent twelve-month EPS from Yahoo Finance. Used as the earnings base for the formula.",
                    },
                    {
                      step: "3",
                      label: `EPS Growth Rate (g) — ${result.capped ? "capped" : "computed"}`,
                      value: (
                        <span>
                          {pct(result.g)}
                          {result.capped && (
                            <Badge variant="outline" className="ml-2 text-xs text-amber-700 border-amber-300">
                              Capped at 20%
                            </Badge>
                          )}
                        </span>
                      ),
                      note: `CAGR of historical EPS from first to last available year.${result.capped ? ` Raw rate was ${pct(result.rawG)} — capped at 20% to prevent unrealistic valuations.` : ""} Graham designed this for slow-growing businesses; high g values produce inflated intrinsic values.`,
                    },
                    {
                      step: "4",
                      label: "Growth Multiplier (8.5 + 2g)",
                      value: result.growthMultiplier.toFixed(2),
                      note: `Graham's fair P/E for this growth profile. 8.5 is the baseline P/E for a no-growth company; adding 2× the growth rate rewards higher earnings growth.`,
                    },
                    {
                      step: "5",
                      label: `Rate Adjustment (4.4 ÷ ${result.Y.toFixed(1)}%)`,
                      value: result.rateAdjustment.toFixed(3),
                      note: `4.4 was the AAA bond yield when Graham wrote Security Analysis. Dividing by today's yield adjusts intrinsic value for the current interest-rate environment. Higher rates → smaller multiplier → lower intrinsic value.${result.floorApplied ? ` Floor of ${yFloor}% applied (entered rate of ${bondYield}% was below floor).` : ""}`,
                    },
                    {
                      step: "6",
                      label: "Intrinsic Value (V = EPS × 8.5+2g × 4.4/Y)",
                      value: fmt(result.V),
                      note: "Graham's formula: V = EPS × (8.5 + 2g) × (4.4 / Y). This is the theoretical fair price before applying a margin of safety.",
                    },
                    {
                      step: "7",
                      label: `Fair Value (V × ${(100 - marginOfSafety)}%)`,
                      value: fmt(result.fairValue),
                      note: `Intrinsic Value discounted by your ${marginOfSafety}% margin of safety. Graham's core principle: buy at a meaningful discount to intrinsic value to protect against errors in estimation.`,
                    },
                  ].map(({ step, label, value, note }) => (
                    <div key={step} className="flex gap-3 p-3 rounded-lg border border-border bg-muted/20">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0 font-bold">
                        {step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-medium">{label}</span>
                          <span className="font-mono font-semibold text-primary">{value}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{note}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-4">
          {!result.incalculable && (
            <Card className={`border-2 ${result.upside != null && result.upside > 0 ? "border-success/50 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
              <CardContent className="pt-6 text-center space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Verdict</p>
                <p className="text-3xl font-bold font-mono text-primary">{fmt(result.fairValue)}</p>
                <p className="text-sm text-muted-foreground">Graham Fair Value</p>
                {currentPrice != null && (
                  <>
                    <div className="h-px bg-border my-2" />
                    <p className="text-sm">Current Price: <span className="font-mono font-semibold">{fmt(currentPrice)}</span></p>
                    {result.upside != null && (
                      <Badge
                        className={`text-sm px-3 py-1 ${result.upside > 0 ? "bg-success/20 text-success border-success/30" : "bg-destructive/20 text-destructive border-destructive/30"}`}
                        variant="outline"
                      >
                        {result.upside > 0 ? "▲" : "▼"} {Math.abs(result.upside).toFixed(1)}%{" "}
                        {result.upside > 0 ? "Upside" : "Overvalued"}
                      </Badge>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Adjust Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">AAA Bond Yield (Y) — %</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={bondYield}
                  onChange={e => setBondYield(parseFloat(e.target.value) || 0)}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Current Moody's AAA corporate bond yield. Default ~5.0%. Check FRED or Bloomberg for today's rate.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Rate Floor (Y floor) — %</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={yFloor}
                  onChange={e => setYFloor(parseFloat(e.target.value) || 0)}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum Y used in the formula. Prevents absurdly high intrinsic values when rates are near zero (e.g., 2020–2021). Default 3%.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Margin of Safety — %</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="80"
                  value={marginOfSafety}
                  onChange={e => setMarginOfSafety(parseInt(e.target.value) || 0)}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Discount applied to intrinsic value before buying. Graham recommended 33–50%. Accounts for estimation errors and market surprises.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Important Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <NoteBox>
                <strong>Negative EPS:</strong> If this company reports a net loss, the Graham formula produces a negative or meaningless intrinsic value and is flagged as Incalculable.
              </NoteBox>
              <NoteBox>
                <strong>Interest Rate Sensitivity:</strong> When Y drops near zero (as in 2020–21), the formula produces astronomical values. Always apply a sensible rate floor (≥3%) to keep results grounded.
              </NoteBox>
              <InfoBox>
                <strong>Growth Cap:</strong> Graham never intended this formula for companies growing faster than ~15–20% per year. If the computed g exceeds 20%, it is automatically capped to prevent unrealistic outputs.
              </InfoBox>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
