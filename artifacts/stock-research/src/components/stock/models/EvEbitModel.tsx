import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Info } from "lucide-react";
import type { EvEbitData, EvEbitHistoryRow } from "@workspace/api-client-react";

interface Props {
  data: EvEbitData;
  currentPrice: number | null;
}

function fmtB(v: number | null): string {
  if (v == null || isNaN(v)) return "—";
  return `$${(v / 1e9).toFixed(2)}B`;
}

function fmt(v: number | null, prefix = "$", decimals = 2): string {
  if (v == null || isNaN(v)) return "—";
  return `${prefix}${v.toFixed(decimals)}`;
}

function pct(v: number | null): string {
  if (v == null || isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
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

export default function EvEbitModel({ data, currentPrice }: Props) {
  const latestBalance = [...data.history].reverse().find(r => r.totalDebt != null);
  const [preferredStockB, setPreferredStockB] = useState(0);
  const [minorityInterestB, setMinorityInterestB] = useState(
    latestBalance?.minorityInterest != null
      ? parseFloat(((latestBalance.minorityInterest) / 1e9).toFixed(2))
      : 0
  );

  const result = useMemo(() => {
    // Only use rows that have valid positive EBIT, revenue, AND historical EV
    const validRows = data.history.filter(
      (r: EvEbitHistoryRow) =>
        r.ebit != null && r.ebit > 0 &&
        r.revenue != null && r.revenue > 0 &&
        r.ev != null && r.ev > 0
    );

    if (validRows.length === 0) {
      const hasNegEbit = data.history.some(r => r.ebit != null && r.ebit <= 0);
      const missingEv = data.history.some(r => r.ebit != null && r.ebit > 0 && (r.ev == null || r.ev <= 0));
      const reason = hasNegEbit
        ? "Normalized EBIT is negative across all years — the business is not sustaining its capital structure."
        : missingEv
        ? "Historical enterprise value data could not be computed for sufficient years."
        : "Insufficient operating history data.";
      return { incalculable: true as const, reason };
    }

    const evEbitRatios = validRows.map((r: EvEbitHistoryRow) => r.ev! / r.ebit!);
    const avgEvEbit = evEbitRatios.reduce((a: number, b: number) => a + b, 0) / evEbitRatios.length;

    const revenues = validRows.map((r: EvEbitHistoryRow) => r.revenue!);
    const normalizedRevenue = revenues.reduce((a: number, b: number) => a + b, 0) / revenues.length;

    const margins = validRows.map((r: EvEbitHistoryRow) => r.ebit! / r.revenue!);
    const normalizedMargin = margins.reduce((a: number, b: number) => a + b, 0) / margins.length;

    const normalizedEbit = normalizedRevenue * normalizedMargin;

    if (normalizedEbit <= 0) {
      return {
        incalculable: true as const,
        reason: "Normalized EBIT is negative — the business is not sustaining its capital structure on average.",
      };
    }

    const targetEv = normalizedEbit * avgEvEbit;

    const totalDebt = latestBalance?.totalDebt ?? 0;
    const cash = latestBalance?.cash ?? 0;
    const minorityInterest = minorityInterestB * 1e9;
    const preferredStock = preferredStockB * 1e9;

    const intrinsicEquity = targetEv - totalDebt - minorityInterest - preferredStock + cash;
    const perShare =
      data.sharesOutstanding != null && data.sharesOutstanding > 0
        ? intrinsicEquity / data.sharesOutstanding
        : null;

    const upside =
      currentPrice != null && perShare != null
        ? ((perShare - currentPrice) / currentPrice) * 100
        : null;

    return {
      incalculable: false as const,
      validRows,
      evEbitRatios,
      avgEvEbit,
      normalizedRevenue,
      normalizedMargin,
      normalizedEbit,
      targetEv,
      totalDebt,
      cash,
      minorityInterest,
      preferredStock,
      intrinsicEquity,
      perShare,
      upside,
    };
  }, [data, currentPrice, minorityInterestB, preferredStockB]);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-card border border-border">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
          Best For
        </h3>
        <p className="text-sm">
          Mature, stable companies with <strong>significant capital expenditures</strong> and diverse capital structures —
          manufacturing, transportation, and industrial sectors where depreciation is a real economic cost.
          EV/EBIT strips out financing differences so you can compare across companies with different debt levels.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">5-Year Operating History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-medium text-muted-foreground">Year</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Revenue</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">EBIT</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Op. Margin</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Hist. EV</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">EV/EBIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((row: EvEbitHistoryRow) => {
                      const margin =
                        row.ebit != null && row.revenue != null && row.revenue > 0
                          ? row.ebit / row.revenue
                          : null;
                      const evEbit =
                        row.ev != null && row.ebit != null && row.ebit > 0
                          ? row.ev / row.ebit
                          : null;
                      const isNeg = row.ebit != null && row.ebit <= 0;
                      return (
                        <tr key={row.year} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 font-mono">{row.year}</td>
                          <td className="py-2 text-right font-mono">{fmtB(row.revenue ?? null)}</td>
                          <td className={`py-2 text-right font-mono ${isNeg ? "text-destructive" : ""}`}>
                            {fmtB(row.ebit ?? null)}
                          </td>
                          <td className="py-2 text-right">{pct(margin)}</td>
                          <td className="py-2 text-right font-mono text-muted-foreground text-xs">
                            {row.ev != null ? fmtB(row.ev) : "—"}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {evEbit != null
                              ? evEbit.toFixed(1) + "×"
                              : isNeg
                              ? <span className="text-destructive text-xs">N/A (neg)</span>
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Historical EV = (fiscal year-end stock price × diluted shares) + total debt − cash.
                Stock price is sourced from the monthly close matching the company's fiscal year-end month.
              </p>
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
                <CardTitle className="text-base">Valuation Steps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    step: "1",
                    label: "Average Historical EV/EBIT Multiple",
                    value: `${result.avgEvEbit.toFixed(1)}×`,
                    note: `Mean of the ${result.validRows.length} year(s) with positive EBIT and available historical EV data. Each year's EV is computed from that year's fiscal year-end stock price × diluted shares, adjusted for net cash/debt. This reflects the actual multiple investors paid over the period.`,
                  },
                  {
                    step: "2",
                    label: "Normalized Revenue (5-yr avg)",
                    value: fmtB(result.normalizedRevenue),
                    note: "Simple average of annual revenues. Smooths out one-off bumper or weak years to get a representative top-line figure.",
                  },
                  {
                    step: "3",
                    label: "Normalized Operating Margin",
                    value: pct(result.normalizedMargin),
                    note: "Average of annual EBIT margins (EBIT ÷ Revenue). Reflects the business's typical profitability after operating costs.",
                  },
                  {
                    step: "4",
                    label: "Normalized EBIT",
                    value: fmtB(result.normalizedEbit),
                    note: "Normalized Revenue × Normalized Operating Margin. The estimated 'steady-state' operating profit the business generates in a typical year.",
                  },
                  {
                    step: "5",
                    label: "Target Enterprise Value",
                    value: fmtB(result.targetEv),
                    note: "Normalized EBIT × Average EV/EBIT multiple. The estimated fair total enterprise value for the business based on normalized earnings power.",
                  },
                  {
                    step: "6",
                    label: "Net Debt & Adjustments (current)",
                    value: fmtB(result.totalDebt - result.cash + result.minorityInterest + result.preferredStock),
                    note: `Current Total Debt (${fmtB(result.totalDebt)}) − Cash (${fmtB(result.cash)}) + Minority Interest + Preferred Stock. These current claims are subtracted because they rank ahead of common equity holders.`,
                  },
                  {
                    step: "7",
                    label: "Intrinsic Equity Value",
                    value: fmtB(result.intrinsicEquity),
                    note: "Target EV minus all senior claims plus cash. What belongs to common shareholders if the business were valued at its normalized earnings power.",
                  },
                  {
                    step: "8",
                    label: "Intrinsic Value Per Share",
                    value: fmt(result.perShare),
                    note: `Intrinsic Equity Value ÷ ${data.sharesOutstanding != null ? `${(data.sharesOutstanding / 1e9).toFixed(2)}B` : "N/A"} current shares outstanding.`,
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
          )}
        </div>

        <div className="space-y-4">
          {!result.incalculable && (
            <Card className={`border-2 ${result.upside != null && result.upside > 0 ? "border-success/50 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
              <CardContent className="pt-6 text-center space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Verdict</p>
                <p className="text-3xl font-bold font-mono text-primary">{fmt(result.perShare)}</p>
                <p className="text-sm text-muted-foreground">Intrinsic Value / Share</p>
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
              <CardTitle className="text-sm">Adjust Capital Structure</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Minority Interest ($ billions)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={minorityInterestB}
                  onChange={e => setMinorityInterestB(parseFloat(e.target.value) || 0)}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Portion of subsidiaries not owned by the parent. Pre-filled from latest balance sheet. Ranks ahead of common equity.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Preferred Stock ($ billions)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={preferredStockB}
                  onChange={e => setPreferredStockB(parseFloat(e.target.value) || 0)}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Preferred shareholders receive dividends and liquidation preference before common equity holders. Default 0.
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
                <strong>Negative EBIT:</strong> If normalized EBIT is negative, the model returns Incalculable — the business is not covering its operating costs on a sustained basis.
              </NoteBox>
              <NoteBox>
                <strong>CapEx Trap:</strong> A cheap EV/EBIT can be misleading if the company requires massive ongoing capital expenditure. Check the cash flow statement — if FCF is significantly below EBIT, depreciation may not reflect real economic costs.
              </NoteBox>
              <InfoBox>
                <strong>Historical EV methodology:</strong> Each year's Enterprise Value is computed as fiscal year-end stock price × diluted shares + net debt. The stock price is matched to the company's fiscal year-end month for accuracy.
              </InfoBox>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
