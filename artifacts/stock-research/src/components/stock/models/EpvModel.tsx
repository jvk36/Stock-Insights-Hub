import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info, AlertCircle } from "lucide-react";
import type { EpvData, EpvHistoryRow } from "@workspace/api-client-react";

interface Props {
  data: EpvData;
  currentPrice: number | null;
}

function fmtB(v: number | null): string {
  if (v == null || isNaN(v)) return "—";
  return `$${(v / 1e9).toFixed(2)}B`;
}

function fmt(v: number | null, dec = 2): string {
  if (v == null || isNaN(v)) return "—";
  return `$${v.toFixed(dec)}`;
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

export default function EpvModel({ data, currentPrice }: Props) {
  const [rfRate, setRfRate] = useState(4.5);
  const [erp, setErp] = useState(5.0);

  const result = useMemo(() => {
    const ke = rfRate / 100 + (data.beta ?? 1.0) * (erp / 100);

    // Cost of debt: interest expense / total debt, capped 2%–15%
    const kd = data.latestInterestExpense != null && data.currentDebt != null && data.currentDebt > 0
      ? Math.min(0.15, Math.max(0.02, data.latestInterestExpense / data.currentDebt))
      : 0.05;

    // WACC weights by market cap vs debt
    const marketCap = (currentPrice ?? 0) * (data.sharesOutstanding ?? 0);
    const totalCapital = marketCap + (data.currentDebt ?? 0);
    const equityWeight = totalCapital > 0 ? marketCap / totalCapital : 0.8;
    const debtWeight = 1 - equityWeight;
    const taxRate = data.normalizedTaxRate ?? 0.25;
    const wacc = ke * equityWeight + kd * (1 - taxRate) * debtWeight;

    // Maintenance capex from backend
    const maintenanceCapex = data.maintenanceCapex ?? null;
    const normalizedEbit = data.normalizedEbit ?? null;
    const latestDep = data.latestDepreciation ?? null;

    if (normalizedEbit == null || maintenanceCapex == null || latestDep == null) {
      return { incalculable: true as const, reason: "Insufficient historical data to normalize EBIT or compute maintenance capex.", ke, kd, wacc, equityWeight, debtWeight };
    }
    if (normalizedEbit <= 0) {
      return { incalculable: true as const, reason: "Normalized EBIT is negative — the company is not covering its operating costs on average.", ke, kd, wacc, equityWeight, debtWeight };
    }
    if (wacc <= 0) {
      return { incalculable: true as const, reason: "WACC is zero or negative — please adjust the risk-free rate or ERP.", ke, kd, wacc, equityWeight, debtWeight };
    }

    const nopat = normalizedEbit * (1 - taxRate);
    const adjustedEarnings = nopat + latestDep - maintenanceCapex;

    if (adjustedEarnings <= 0) {
      return { incalculable: true as const, reason: "Adjusted earnings are negative after subtracting maintenance CapEx — the business does not generate distributable earnings on a normalized basis.", ke, kd, wacc, equityWeight, debtWeight };
    }

    const epvOperations = adjustedEarnings / wacc;
    const epvEquity = epvOperations + (data.currentCash ?? 0) - (data.currentDebt ?? 0);
    const epvPerShare = data.sharesOutstanding != null && data.sharesOutstanding > 0
      ? epvEquity / data.sharesOutstanding : null;
    const upside = currentPrice != null && epvPerShare != null
      ? ((epvPerShare - currentPrice) / currentPrice) * 100 : null;

    return {
      incalculable: false as const,
      ke, kd, wacc, equityWeight, debtWeight,
      nopat, adjustedEarnings, epvOperations, epvEquity, epvPerShare, upside,
      maintenanceCapex, normalizedEbit, latestDep, taxRate,
    };
  }, [data, currentPrice, rfRate, erp]);

  const growthCapexPct = data.growthCapexRatio != null ? (data.growthCapexRatio * 100).toFixed(1) : null;

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-card border border-border">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">Best For</h3>
        <p className="text-sm">
          <strong>Mature companies with stable, recurring earnings</strong> — especially capital-intensive businesses
          like utilities, industrials, and manufacturing where maintenance CapEx is a real economic cost.
          Greenwald's EPV strips away all long-term growth assumptions and asks: what is this business worth
          if it simply keeps doing what it's doing today, forever? The gap between current price and EPV
          represents the <em>growth premium</em> the market is pricing in.
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
                      <th className="text-right py-2 font-medium text-muted-foreground">Gross PP&E</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">CapEx</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">D&A</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Tax Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((row: EpvHistoryRow) => (
                      <tr key={row.year} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 font-mono">{row.year}</td>
                        <td className="py-2 text-right font-mono">{fmtB(row.revenue ?? null)}</td>
                        <td className={`py-2 text-right font-mono ${row.ebit != null && row.ebit < 0 ? "text-destructive" : ""}`}>{fmtB(row.ebit ?? null)}</td>
                        <td className="py-2 text-right font-mono text-muted-foreground">{fmtB(row.grossPPE ?? null)}</td>
                        <td className="py-2 text-right font-mono">{fmtB(row.capex ?? null)}</td>
                        <td className="py-2 text-right font-mono">{fmtB(row.depreciation ?? null)}</td>
                        <td className="py-2 text-right">{row.taxRate != null ? pct(row.taxRate) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Maintenance CapEx Computation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  step: "1", label: "Growth CapEx Ratio",
                  value: growthCapexPct != null ? growthCapexPct + "%" : "—",
                  note: `Average of (Gross PP&E ÷ Revenue) over the last 5 years = ${growthCapexPct ?? "—"}%. This ratio tells us: for every dollar of new revenue, how much PP&E investment is required? This is Greenwald's way of separating growth-driven capital from maintenance capital.`,
                },
                {
                  step: "2", label: "Revenue Growth (Latest Year, $)",
                  value: fmtB(data.latestRevenueDelta ?? null),
                  note: `Incremental revenue added in the most recent year. Growth CapEx = Growth Ratio × Revenue Growth = ${growthCapexPct ?? "—"}% × ${fmtB(data.latestRevenueDelta ?? null)} — only the CapEx required to support this new revenue.`,
                },
                {
                  step: "3", label: "Total CapEx (Latest Year)",
                  value: fmtB(data.latestCapex ?? null),
                  note: "Total capital expenditures spent in the latest year (absolute value of cash spent on property, plant, and equipment). This includes both growth and maintenance capital.",
                },
                {
                  step: "4", label: "Maintenance CapEx",
                  value: fmtB(data.maintenanceCapex ?? null),
                  note: `Total CapEx (${fmtB(data.latestCapex ?? null)}) minus Growth CapEx. This is the irreducible minimum the business must spend just to maintain its current earnings capacity — not to grow, simply to survive. Traditional FCF analysis uses total CapEx, which overstates the maintenance burden.`,
                },
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
                <CardTitle className="text-base">EPV Valuation Steps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    step: "5", label: "Normalized EBIT (5-yr avg)",
                    value: fmtB(result.normalizedEbit ?? null),
                    note: "Simple average of operating income over the last 5 years. Smooths out one-off bumper or depressed years to get a representative 'steady-state' operating profit.",
                  },
                  {
                    step: "6", label: "Normalized Tax Rate",
                    value: pct(result.taxRate),
                    note: "5-year average effective tax rate (tax provision ÷ pre-tax income). Applied to EBIT to compute how much actually flows through to shareholders.",
                  },
                  {
                    step: "7", label: "NOPAT (Net Operating Profit After Tax)",
                    value: fmtB(result.nopat ?? null),
                    note: `Normalized EBIT × (1 − Tax Rate). The after-tax operating profit the business generates before any financing decisions — a clean measure of operating value creation.`,
                  },
                  {
                    step: "8", label: "Adjusted Earnings",
                    value: fmtB(result.adjustedEarnings ?? null),
                    note: `NOPAT + D&A (${fmtB(result.latestDep ?? null)}) − Maintenance CapEx (${fmtB(result.maintenanceCapex ?? null)}). This is the true distributable cash: we add back non-cash depreciation, then subtract only the real cash needed to maintain existing assets. This is the number that matters for valuation.`,
                  },
                  {
                    step: "9", label: "WACC",
                    value: pct(result.wacc),
                    note: `Weighted Average Cost of Capital = Ke (${pct(result.ke)}) × equity weight (${(result.equityWeight * 100).toFixed(0)}%) + Kd (${pct(result.kd)}) × (1−tax) × debt weight (${(result.debtWeight * 100).toFixed(0)}%). Ke uses CAPM: ${rfRate}% risk-free + beta × ${erp}% ERP.`,
                  },
                  {
                    step: "10", label: "EPV of Operations",
                    value: fmtB(result.epvOperations ?? null),
                    note: "Adjusted Earnings ÷ WACC. A perpetuity: how much would you pay today for a stream of adjusted earnings forever at the required return? This is the no-growth intrinsic value of the operating business.",
                  },
                  {
                    step: "11", label: "EPV of Equity",
                    value: fmtB(result.epvEquity ?? null),
                    note: `EPV of Operations + Cash (${fmtB(data.currentCash ?? null)}) − Debt (${fmtB(data.currentDebt ?? null)}). What belongs to equity shareholders after accounting for the capital structure.`,
                  },
                  {
                    step: "12", label: "EPV Per Share",
                    value: fmt(result.epvPerShare),
                    note: `EPV of Equity ÷ ${data.sharesOutstanding != null ? (data.sharesOutstanding / 1e9).toFixed(2) + "B" : "N/A"} shares. The no-growth fair value per share — what the business is worth if it never grows again.`,
                  },
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
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {result.incalculable === false && (
            <Card className={`border-2 ${result.upside != null && result.upside > 0 ? "border-success/50 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
              <CardContent className="pt-6 text-center space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">EPV Verdict</p>
                <p className="text-3xl font-bold font-mono text-primary">{fmt(result.epvPerShare)}</p>
                <p className="text-sm text-muted-foreground">No-Growth Fair Value / Share</p>
                {currentPrice != null && (
                  <>
                    <div className="h-px bg-border my-2" />
                    <p className="text-sm">Current Price: <span className="font-mono font-semibold">{fmt(currentPrice)}</span></p>
                    {result.upside != null && (
                      <Badge className={`text-sm px-3 py-1 ${result.upside > 0 ? "bg-success/20 text-success border-success/30" : "bg-destructive/20 text-destructive border-destructive/30"}`} variant="outline">
                        {result.upside > 0 ? "▲" : "▼"} {Math.abs(result.upside).toFixed(1)}% {result.upside > 0 ? "Upside" : "Growth Premium"}
                      </Badge>
                    )}
                    {result.upside != null && result.upside < 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        The market is paying a {Math.abs(result.upside).toFixed(1)}% premium above no-growth EPV — pricing in future growth expectations.
                      </p>
                    )}
                  </>
                )}
                <div className="h-px bg-border my-2" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>WACC</span><span className="font-mono">{pct(result.wacc)}</span></div>
                  <div className="flex justify-between"><span>Adj. Earnings</span><span className="font-mono">{fmtB(result.adjustedEarnings ?? null)}</span></div>
                  <div className="flex justify-between"><span>Maint. CapEx</span><span className="font-mono">{fmtB(result.maintenanceCapex ?? null)}</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">WACC Inputs</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Risk-Free Rate (%)</Label>
                <Input type="number" step="0.1" min="0" max="15" value={rfRate} onChange={e => setRfRate(parseFloat(e.target.value) || 4.5)} className="font-mono h-8 text-sm" />
                <p className="text-xs text-muted-foreground">Typically the 10-year government bond yield. Default 4.5% reflects current U.S. Treasury rates.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Equity Risk Premium (%)</Label>
                <Input type="number" step="0.1" min="0" max="15" value={erp} onChange={e => setErp(parseFloat(e.target.value) || 5.0)} className="font-mono h-8 text-sm" />
                <p className="text-xs text-muted-foreground">Additional return investors demand above the risk-free rate for owning equities. Damodaran's long-run estimate is 4.5%–5.5%. Default 5.0%.</p>
              </div>
              {result.incalculable === false && (
                <div className="p-3 rounded-lg bg-muted/30 space-y-1 text-xs font-mono">
                  <div className="flex justify-between"><span className="text-muted-foreground">Beta</span><span>{(data.beta ?? 1.0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cost of Equity (Ke)</span><span>{pct(result.ke)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cost of Debt (Kd)</span><span>{pct(result.kd)}</span></div>
                  <div className="flex justify-between font-semibold"><span className="text-muted-foreground">WACC</span><span className="text-primary">{pct(result.wacc)}</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Key Insights</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoBox><strong>Growth premium:</strong> If current price exceeds EPV, the market is betting on future growth. EPV helps you quantify exactly how much growth is being priced in — a powerful sanity check.</InfoBox>
              <InfoBox><strong>Moat signal:</strong> Greenwald used EPV alongside Asset Reproduction Value (ARV). If EPV significantly exceeds what a competitor would pay to replicate the business assets, it proves a durable competitive advantage — a genuine moat.</InfoBox>
              <NoteBox><strong>CapEx-heavy businesses:</strong> EPV can look pessimistic for businesses that must invest heavily in growth. It is specifically designed for mature, asset-intensive businesses where current earnings capacity is stable and reliable.</NoteBox>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
