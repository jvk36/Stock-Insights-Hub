import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Info } from "lucide-react";
import type { DdmData } from "@workspace/api-client-react";

interface Props {
  data: DdmData;
  currentPrice: number | null;
}

function fmt(v: number | null, prefix = "$", decimals = 2): string {
  if (v == null || isNaN(v) || !isFinite(v)) return "—";
  return `${prefix}${v.toFixed(decimals)}`;
}

function pct(v: number | null, decimals = 2): string {
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

export default function DdmModel({ data, currentPrice }: Props) {
  const [rfRate, setRfRate] = useState(4.3);
  const [betaInput, setBetaInput] = useState(
    data.beta != null ? parseFloat(data.beta.toFixed(2)) : 1.0
  );
  const [erp, setErp] = useState(5.0);

  const result = useMemo(() => {
    const sorted = [...data.dividendHistory]
      .filter(d => d.dps > 0)
      .sort((a, b) => a.year.localeCompare(b.year));

    const noDividend = sorted.length < 2;
    if (noDividend) {
      return { incalculable: true as const, reason: "This company does not pay dividends or has fewer than 2 years of dividend history. The Dividend Discount Model requires a dividend-paying stock." };
    }

    const last6 = sorted.slice(-6);
    const firstDps = last6[0].dps;
    const lastDps = last6[last6.length - 1].dps;
    const n = last6.length - 1;
    const dividendGrowthRate = n > 0 ? (Math.pow(lastDps / firstDps, 1 / n) - 1) * 100 : 0;
    const terminalGrowthRate = (2 / 3) * dividendGrowthRate;

    const costOfEquity = rfRate + betaInput * erp;

    if (costOfEquity <= terminalGrowthRate) {
      return {
        incalculable: true as const,
        reason: `Cost of Equity (${pct(costOfEquity)}) must be greater than the Terminal Growth Rate (${pct(terminalGrowthRate)}) for the Gordon Growth formula to work. Try increasing the discount rate or decreasing ERP.`,
      };
    }

    const startDps = lastDps;
    const pvRows: Array<{ year: number; dividend: number; pv: number }> = [];
    let cumPvDividends = 0;

    for (let i = 1; i <= 5; i++) {
      const dividend = startDps * Math.pow(1 + dividendGrowthRate / 100, i);
      const pv = dividend / Math.pow(1 + costOfEquity / 100, i);
      pvRows.push({ year: i, dividend, pv });
      cumPvDividends += pv;
    }

    const d6 = startDps * Math.pow(1 + dividendGrowthRate / 100, 5) * (1 + terminalGrowthRate / 100);
    const terminalValue = d6 / ((costOfEquity - terminalGrowthRate) / 100);
    const pvTerminalValue = terminalValue / Math.pow(1 + costOfEquity / 100, 5);
    const intrinsicValue = cumPvDividends + pvTerminalValue;

    const tvPct = (pvTerminalValue / intrinsicValue) * 100;
    const upside =
      currentPrice != null ? ((intrinsicValue - currentPrice) / currentPrice) * 100 : null;

    const payoutRatio = data.payoutRatio ?? null;
    const payoutUnsustainable = payoutRatio != null && payoutRatio > 0.8;

    return {
      incalculable: false as const,
      sorted: last6,
      dividendGrowthRate,
      terminalGrowthRate,
      costOfEquity,
      startDps,
      pvRows,
      cumPvDividends,
      d6,
      terminalValue,
      pvTerminalValue,
      intrinsicValue,
      tvPct,
      upside,
      payoutRatio,
      payoutUnsustainable,
    };
  }, [data, rfRate, betaInput, erp, currentPrice]);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-card border border-border">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
          Best For
        </h3>
        <p className="text-sm">
          Mature, <strong>dividend-paying companies</strong> with a consistent history of dividend growth —
          utilities, REITs, consumer staples, and established financial institutions. The model values
          a company purely on the dividends it returns to shareholders, discounted back to today.
          Not suitable for growth stocks that reinvest all earnings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dividend History (up to 6 years)</CardTitle>
            </CardHeader>
            <CardContent>
              {data.dividendHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No dividend history found for this company.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 font-medium text-muted-foreground">Year</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">DPS</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">YoY Growth</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">EPS</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Payout Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.dividendHistory]
                        .sort((a, b) => a.year.localeCompare(b.year))
                        .map((row, i, arr) => {
                          const prev = arr[i - 1]?.dps;
                          const yoy =
                            prev != null && prev > 0
                              ? ((row.dps - prev) / prev) * 100
                              : null;
                          const payout =
                            row.eps != null && row.eps > 0
                              ? (row.dps / row.eps) * 100
                              : null;
                          return (
                            <tr key={row.year} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-2 font-mono">{row.year}</td>
                              <td className="py-2 text-right font-mono">{fmt(row.dps)}</td>
                              <td className="py-2 text-right">
                                {yoy != null ? (
                                  <span className={yoy >= 0 ? "text-success" : "text-destructive"}>
                                    {yoy >= 0 ? "+" : ""}{yoy.toFixed(1)}%
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="py-2 text-right font-mono">{row.eps != null ? fmt(row.eps) : "—"}</td>
                              <td className={`py-2 text-right ${payout != null && payout > 80 ? "text-destructive font-semibold" : ""}`}>
                                {payout != null ? `${payout.toFixed(0)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
              {data.trailingDividendRate != null && (
                <p className="text-xs text-muted-foreground mt-3">
                  Trailing annual dividend rate: <span className="font-mono font-semibold">{fmt(data.trailingDividendRate)}</span> per share.
                  {data.payoutRatio != null && ` Current payout ratio: ${(data.payoutRatio * 100).toFixed(0)}%.`}
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
            <>
              {result.payoutUnsustainable && (
                <NoteBox>
                  <strong>High Payout Ratio:</strong> The current payout ratio is{" "}
                  {result.payoutRatio != null ? `${(result.payoutRatio * 100).toFixed(0)}%` : "above 80%"}.
                  Dividend growth at this rate may not be sustainable if earnings don't keep pace. Consider this a risk to the model's assumptions.
                </NoteBox>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Valuation Steps</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    {
                      step: "1",
                      label: "Dividend CAGR (5-yr historical)",
                      value: pct(result.dividendGrowthRate),
                      note: `Compound annual growth rate of dividends over the last ${result.sorted.length - 1} year(s). Projected forward as the near-term (Year 1–5) growth assumption — the idea being that recent dividend growth is the best predictor of near-term growth.`,
                    },
                    {
                      step: "2",
                      label: "Terminal Dividend Growth (Year 6+)",
                      value: pct(result.terminalGrowthRate),
                      note: `Two-thirds of the 5-year CAGR (${pct(result.dividendGrowthRate)} × 0.667). After 5 years the company is assumed to mature further and grow dividends more slowly, closer to long-run nominal GDP growth.`,
                    },
                    {
                      step: "3",
                      label: `Cost of Equity (Rf + β × ERP)`,
                      value: pct(result.costOfEquity),
                      note: `CAPM formula: ${pct(rfRate)} risk-free rate + ${betaInput.toFixed(2)} beta × ${pct(erp)} ERP = ${pct(result.costOfEquity)}. This is the minimum return equity investors require given the stock's market risk (beta). A higher cost of equity reduces the present value of future dividends.`,
                    },
                    {
                      step: "4",
                      label: "PV of Dividends (Years 1–5)",
                      value: fmt(result.cumPvDividends),
                      note: `Sum of the first 5 years of projected dividends, each discounted back to today at the cost of equity. See the table below for the year-by-year breakdown.`,
                    },
                    {
                      step: "5",
                      label: "Year 6 Dividend (D₆)",
                      value: fmt(result.d6),
                      note: `Year 5 dividend grown by the terminal growth rate (${pct(result.terminalGrowthRate)}). This is the first "stable phase" dividend used in the Gordon Growth terminal value formula.`,
                    },
                    {
                      step: "6",
                      label: "Terminal Value (Gordon Growth)",
                      value: fmt(result.terminalValue),
                      note: `D₆ ÷ (Cost of Equity − Terminal Growth Rate) = ${fmt(result.d6)} ÷ ${pct(result.costOfEquity - result.terminalGrowthRate)}. Assumes dividends grow at the terminal rate forever from Year 6. The terminal value typically dominates this model.`,
                    },
                    {
                      step: "7",
                      label: "PV of Terminal Value",
                      value: fmt(result.pvTerminalValue),
                      note: `Terminal Value discounted back 5 years: ${fmt(result.terminalValue)} ÷ (1 + ${pct(result.costOfEquity)})⁵. Represents ${result.tvPct.toFixed(0)}% of total intrinsic value — highlighting the model's heavy dependence on long-run assumptions.`,
                    },
                    {
                      step: "8",
                      label: "Intrinsic Value (PV Dividends + PV Terminal)",
                      value: fmt(result.intrinsicValue),
                      note: "Sum of the present value of near-term dividends and the discounted terminal value. This is what the stock should theoretically be worth to a buyer who values it on its dividend income stream.",
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

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Year-by-Year Dividend Projection</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 font-medium text-muted-foreground">Year</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Proj. Dividend</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">PV Factor</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Present Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.pvRows.map(row => (
                          <tr key={row.year} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2">Year {row.year}</td>
                            <td className="py-2 text-right font-mono">{fmt(row.dividend)}</td>
                            <td className="py-2 text-right text-muted-foreground text-xs">
                              ÷ (1 + {pct(result.costOfEquity)})^{row.year}
                            </td>
                            <td className="py-2 text-right font-mono">{fmt(row.pv)}</td>
                          </tr>
                        ))}
                        <tr className="border-b border-border bg-muted/30">
                          <td className="py-2 font-semibold" colSpan={3}>PV of Dividends (Years 1–5)</td>
                          <td className="py-2 text-right font-mono font-semibold">{fmt(result.cumPvDividends)}</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-2 italic text-muted-foreground" colSpan={3}>
                            Terminal Value (Year 6+ Gordon Growth) — discounted 5 years
                          </td>
                          <td className="py-2 text-right font-mono">{fmt(result.pvTerminalValue)}</td>
                        </tr>
                        <tr className="bg-primary/5">
                          <td className="py-2 font-bold" colSpan={3}>Intrinsic Value Per Share</td>
                          <td className="py-2 text-right font-mono font-bold text-primary">{fmt(result.intrinsicValue)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
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
                <p className="text-3xl font-bold font-mono text-primary">{fmt(result.intrinsicValue)}</p>
                <p className="text-sm text-muted-foreground">DDM Intrinsic Value</p>
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
                {!result.incalculable && (
                  <p className="text-xs text-muted-foreground pt-1">
                    Terminal value = {result.tvPct.toFixed(0)}% of intrinsic value
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Adjust Discount Rate (CAPM)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Risk-Free Rate (Rf) — %</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={rfRate}
                  onChange={e => setRfRate(parseFloat(e.target.value) || 0)}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  10-year US Treasury yield. Default ~4.3%. This is the "risk-free" return investors can earn without taking equity risk.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Beta (β)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={betaInput}
                  onChange={e => setBetaInput(parseFloat(e.target.value) || 0)}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Measures how much the stock moves relative to the market. β = 1 means it moves with the market; β &gt; 1 means more volatile. Pre-filled from Yahoo Finance.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Equity Risk Premium (ERP) — %</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={erp}
                  onChange={e => setErp(parseFloat(e.target.value) || 0)}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  The extra return investors demand for holding equities over risk-free bonds. Damodaran's long-run US estimate is ~4.5–5.5%. Default 5%.
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
                <strong>Payout Sustainability:</strong> If the payout ratio exceeds ~80%, the company may be returning more than it earns — a warning sign for dividend cuts. A dividend cut invalidates the model's core assumption.
              </NoteBox>
              <NoteBox>
                <strong>Terminal Value Dominance:</strong> The terminal value often makes up 60–90% of the computed intrinsic value. Small changes to the terminal growth rate or cost of equity have an outsized effect on the result. Use a wide margin of safety.
              </NoteBox>
              <InfoBox>
                <strong>Non-Dividend Payers:</strong> If a company doesn't pay dividends, this model returns Incalculable. Consider the DCF or Graham model instead, which use earnings and free cash flow.
              </InfoBox>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
