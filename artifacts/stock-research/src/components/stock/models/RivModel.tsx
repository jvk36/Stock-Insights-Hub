import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info, AlertCircle } from "lucide-react";
import type { RivData } from "@workspace/api-client-react";

interface Props {
  data: RivData;
  currentPrice: number | null;
}

function fmt(v: number | null, dec = 2): string {
  if (v == null || isNaN(v)) return "—";
  return `$${v.toFixed(dec)}`;
}

function fmtPct(v: number, dec = 1): string {
  return `${v.toFixed(dec)}%`;
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

interface ProjectionRow {
  t: number;
  bvps: number;
  eps: number;
  equityCharge: number;
  ri: number;
  df: number;
  pvRI: number;
}

export default function RivModel({ data, currentPrice }: Props) {
  const [discountRate, setDiscountRate] = useState(12);
  const [projectionYears, setProjectionYears] = useState(10);

  const result = useMemo(() => {
    const bv0 = data.bookValuePerShare ?? null;
    const roe0 = data.roe ?? null;

    if (bv0 == null || bv0 <= 0) {
      return { incalculable: true as const, reason: "Book value per share is unavailable or negative — the company may have negative equity." };
    }
    if (roe0 == null) {
      return { incalculable: true as const, reason: "Return on Equity (ROE) could not be computed — net income or equity data is unavailable." };
    }

    const r = discountRate / 100;
    const n = Math.max(1, Math.min(20, projectionYears));

    let bvt = bv0;
    let totalPVRI = 0;
    const rows: ProjectionRow[] = [];

    for (let t = 1; t <= n; t++) {
      const eps_t = roe0 * bvt;
      const equityCharge_t = r * bvt;
      const ri_t = eps_t - equityCharge_t;
      const df = 1 / Math.pow(1 + r, t);
      const pvRI_t = ri_t * df;
      totalPVRI += pvRI_t;
      rows.push({ t, bvps: bvt, eps: eps_t, equityCharge: equityCharge_t, ri: ri_t, df, pvRI: pvRI_t });
      bvt = bvt + eps_t;
    }

    const intrinsicValue = bv0 + totalPVRI;
    const upside = currentPrice != null ? ((intrinsicValue - currentPrice) / currentPrice) * 100 : null;
    const pvRIShare = totalPVRI;
    const bvShare = bv0;

    return {
      incalculable: false as const,
      rows,
      totalPVRI,
      intrinsicValue,
      upside,
      pvRIShare,
      bvShare,
      roe0,
      r,
    };
  }, [data, discountRate, projectionYears]);

  if (data.bookValuePerShare == null && data.roe == null) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        Insufficient book value and ROE data to run this model.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-card border border-border">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">Best For</h3>
        <p className="text-sm">
          <strong>Low-growth and mature businesses</strong>, especially regulated financial institutions, companies
          with negative free cash flow but positive economic earnings, and businesses where terminal value is
          uncertain. The Residual Income Valuation (RIV) model anchors valuation to current <em>book value</em>
          rather than speculative terminal cash flows, reducing dependence on long-term growth assumptions.
          It measures value creation as the excess return above the cost of equity capital.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Starting Inputs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  {
                    label: "Book Value Per Share (BV₀)",
                    value: fmt(data.bookValuePerShare ?? null),
                    note: "Current stockholders' equity divided by shares outstanding. The accounting net worth of the business per share — the foundation of this model.",
                  },
                  {
                    label: "Return on Equity (ROE)",
                    value: data.roe != null ? fmtPct(data.roe * 100) : "—",
                    note: "Net income ÷ stockholders' equity. The rate at which the business generates earnings on its book value. This is projected forward as the expected future ROE.",
                  },
                  {
                    label: "Discount Rate (r)",
                    value: fmtPct(discountRate),
                    note: "Your required return on equity (cost of equity). If ROE > r, the business creates economic value; if ROE < r, it destroys value.",
                  },
                  {
                    label: "Beta",
                    value: data.beta != null ? data.beta.toFixed(2) : "—",
                    note: "Market beta for reference when setting the discount rate. CAPM: r = Risk-Free Rate + Beta × ERP.",
                  },
                ].map(({ label, value, note }) => (
                  <div key={label} className="p-3 rounded-lg border border-border bg-muted/20">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium text-xs text-muted-foreground">{label}</span>
                      <span className="font-mono font-semibold text-primary">{value}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{note}</p>
                  </div>
                ))}
              </div>

              {result.incalculable === false && (
                <div className={`mt-4 p-3 rounded-lg border ${result.roe0 > result.r ? "border-success/30 bg-success/5" : "border-destructive/20 bg-destructive/5"}`}>
                  <p className="text-sm font-medium">
                    ROE ({fmtPct(result.roe0 * 100)}) {result.roe0 > result.r ? ">" : "<"} Discount Rate ({fmtPct(discountRate)})
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.roe0 > result.r
                      ? "The business generates returns above your required rate — residual income is positive, and the intrinsic value exceeds book value."
                      : "The business earns below your required rate — residual income is negative, and the intrinsic value falls below book value. Consider whether a lower discount rate is more appropriate."}
                  </p>
                </div>
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
                <CardTitle className="text-base">
                  {projectionYears}-Year Residual Income Projection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 font-medium text-muted-foreground">Year</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">BV/Sh</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">EPS</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Equity Charge</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Residual Income</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Discount</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">PV(RI)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row: ProjectionRow) => (
                        <tr key={row.t} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-1.5 font-mono">{row.t}</td>
                          <td className="py-1.5 text-right font-mono">{fmt(row.bvps)}</td>
                          <td className="py-1.5 text-right font-mono">{fmt(row.eps)}</td>
                          <td className="py-1.5 text-right font-mono text-muted-foreground">{fmt(row.equityCharge)}</td>
                          <td className={`py-1.5 text-right font-mono font-medium ${row.ri >= 0 ? "text-success" : "text-destructive"}`}>
                            {row.ri >= 0 ? "+" : ""}{fmt(row.ri)}
                          </td>
                          <td className="py-1.5 text-right font-mono text-muted-foreground">{(row.df * 100).toFixed(1)}%</td>
                          <td className={`py-1.5 text-right font-mono ${row.pvRI >= 0 ? "text-success" : "text-destructive"}`}>
                            {row.pvRI >= 0 ? "+" : ""}{fmt(row.pvRI)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border font-semibold bg-muted/20">
                        <td colSpan={6} className="py-2 text-right text-xs text-muted-foreground pr-2">Sum of PV(RI) over {projectionYears} years</td>
                        <td className={`py-2 text-right font-mono ${result.totalPVRI >= 0 ? "text-success" : "text-destructive"}`}>
                          {result.totalPVRI >= 0 ? "+" : ""}{fmt(result.totalPVRI)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  <strong>How to read this table:</strong> BV/Sh grows each year as EPS is retained (BV_t = BV_{"{t-1}"} + EPS_t).
                  EPS = ROE × BV/Sh. Equity Charge = Discount Rate × BV/Sh — the minimum return you require.
                  Residual Income = EPS − Equity Charge: positive means value creation above your hurdle.
                  After year {projectionYears}, residual income is assumed to fade to zero (conservative terminal value).
                </p>

                <div className="mt-4 space-y-3">
                  {[
                    {
                      step: "1", label: "Current Book Value Per Share (BV₀)",
                      value: fmt(result.bvShare),
                      note: "The anchor of this model — the known, book-value starting point. Unlike DCF which depends entirely on speculative future cash flows, RIV starts from a verified balance sheet figure.",
                    },
                    {
                      step: "2", label: `Sum of PV(Residual Income) — ${projectionYears} Years`,
                      value: fmt(result.pvRIShare),
                      note: `Total present value of the extra earnings the business generates above your required return over the projection period. Each year's residual income is discounted at ${discountRate}%. After year ${projectionYears}, we assume no further excess returns (conservative).`,
                    },
                    {
                      step: "3", label: "Intrinsic Value Per Share",
                      value: fmt(result.intrinsicValue),
                      note: `BV₀ + Sum of PV(RI). The business is worth its book value plus the present value of any excess returns it generates. If ROE = discount rate, intrinsic value equals book value exactly.`,
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
                  <div className="flex justify-between"><span>Book Value / Share</span><span className="font-mono">{fmt(result.bvShare)}</span></div>
                  <div className="flex justify-between"><span>PV of RI ({projectionYears}yr)</span><span className={`font-mono ${result.totalPVRI >= 0 ? "" : "text-destructive"}`}>{fmt(result.pvRIShare)}</span></div>
                  <div className="flex justify-between"><span>ROE vs Discount Rate</span><span className={`font-mono ${result.roe0 > result.r ? "text-success" : "text-destructive"}`}>{fmtPct(result.roe0 * 100)} vs {fmtPct(discountRate)}</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Model Parameters</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Discount Rate / Cost of Equity (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="5"
                  max="25"
                  value={discountRate}
                  onChange={e => setDiscountRate(parseFloat(e.target.value) || 12)}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Your required return on equity. Default 12% — a conservative hurdle rate for mature businesses.
                  For CAPM-based estimate: Risk-Free Rate + Beta ({(data.beta ?? 1.0).toFixed(2)}) × ERP.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Projection Years</Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  value={projectionYears}
                  onChange={e => setProjectionYears(Math.min(20, Math.max(1, parseInt(e.target.value) || 10)))}
                  className="font-mono h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  How many years to project excess returns before assuming RI fades to zero. 10 years is a reasonable horizon for most mature businesses. Beyond 15 years, uncertainty compounds significantly.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Key Insights</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoBox><strong>Economic profit focus:</strong> RIV measures true economic profit — earnings above and beyond your cost of capital. A company can report positive GAAP earnings but still destroy economic value if its ROE is below the required return.</InfoBox>
              <InfoBox><strong>Book value anchored:</strong> Unlike pure DCF, RIV uses verifiable accounting data (book value, ROE) as the foundation. This makes it more reliable for businesses where terminal value assumptions dominate DCF outputs.</InfoBox>
              <NoteBox><strong>Constant ROE assumption:</strong> This model projects the current ROE forward indefinitely, which may be optimistic for companies whose competitive advantages are eroding, or conservative for those still early in their growth phase.</NoteBox>
              <NoteBox><strong>Best for stable, mature firms:</strong> Works best when ROE and book value are predictable — regulated utilities, banks, and insurance companies. Less reliable for high-growth technology companies where book value understates asset value.</NoteBox>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
