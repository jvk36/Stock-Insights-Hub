import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info, AlertCircle } from "lucide-react";
import type { OwnersEarningsData } from "@workspace/api-client-react";

interface Props {
  data: OwnersEarningsData;
  currentPrice: number | null;
}

function fmtB(v: number | null, dec = 2): string {
  if (v == null || isNaN(v)) return "—";
  return `$${(v / 1e9).toFixed(dec)}B`;
}

function fmt(v: number | null, dec = 2): string {
  if (v == null || isNaN(v)) return "—";
  return `$${v.toFixed(dec)}`;
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

export default function OwnersEarningsModel({ data, currentPrice }: Props) {
  const [multiplier, setMultiplier] = useState(10);

  const result = useMemo(() => {
    const netIncome = data.netIncome ?? null;
    const depreciation = data.depreciation ?? null;
    const deferredTax = data.deferredTax ?? null;
    const wcChange = data.workingCapitalChange ?? null;
    const maintCapex = data.maintenanceCapex ?? null;

    if (netIncome == null) {
      return { incalculable: true as const, reason: "Net income data unavailable for the most recent year." };
    }
    if (maintCapex == null) {
      return { incalculable: true as const, reason: "Maintenance CapEx could not be computed — insufficient PP&E and revenue history." };
    }

    const ownersEarnings =
      netIncome +
      (depreciation ?? 0) +
      (deferredTax ?? 0) +
      (wcChange ?? 0) -
      maintCapex;

    const ownersEarningsPerShare = data.sharesOutstanding != null && data.sharesOutstanding > 0
      ? ownersEarnings / data.sharesOutstanding : null;

    const fairValue = ownersEarningsPerShare != null ? ownersEarningsPerShare * multiplier : null;
    const upside = currentPrice != null && fairValue != null
      ? ((fairValue - currentPrice) / currentPrice) * 100 : null;

    return {
      incalculable: false as const,
      netIncome, depreciation, deferredTax, wcChange, maintCapex,
      ownersEarnings, ownersEarningsPerShare, fairValue, upside,
    };
  }, [data, multiplier]);

  const growthCapexPct = data.growthCapexRatio != null ? (data.growthCapexRatio * 100).toFixed(1) : null;

  const componentRows = [
    {
      label: "Net Income",
      value: data.netIncome ?? null,
      sign: "+",
      note: "The bottom-line GAAP profit as reported. Starting point, but distorted by non-cash charges and accounting conventions.",
    },
    {
      label: "Depreciation & Amortization",
      value: data.depreciation ?? null,
      sign: "+",
      note: "A non-cash accounting charge added back because no cash actually left the business. The business depreciates assets on paper, but the real cost of maintaining those assets is captured separately as maintenance CapEx.",
    },
    {
      label: "Change in Deferred Tax",
      value: data.deferredTax ?? null,
      sign: "+",
      note: "Difference between taxes accrued and taxes actually paid in cash. A positive change means the company accrued more tax than it paid — adding it back recovers the non-cash portion of the tax charge.",
    },
    {
      label: "Change in Working Capital",
      value: data.workingCapitalChange ?? null,
      sign: "+",
      note: "Cash impact of changes in receivables, inventory, and payables. Positive means working capital released cash (e.g. collecting receivables); negative means cash was tied up. Buffett includes this to capture the full cash reality.",
    },
    {
      label: "Maintenance CapEx",
      value: data.maintenanceCapex ?? null,
      sign: "−",
      note: `The cash required just to keep the existing business running — not to grow it. Computed as: Total CapEx (${fmtB(data.latestCapex ?? null)}) minus growth CapEx (Growth Ratio ${growthCapexPct ?? "—"}% × Revenue Growth ${fmtB(data.latestRevenueDelta ?? null)}).`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-card border border-border">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">Best For</h3>
        <p className="text-sm">
          <strong>Any profitable business</strong> — but especially those with significant non-cash charges or
          where GAAP earnings diverge from cash reality. Warren Buffett introduced this in his 1986 Berkshire
          Hathaway letter as the measure of a business's true cash-generating ability. It captures what an
          owner can <em>actually take out</em> of the business without impairing its operations —
          unlike reported earnings, which can be distorted by accounting rules.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Owner's Earnings Components (Most Recent Year)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {componentRows.map(({ label, value, sign, note }, i) => {
                  const isSubtract = sign === "−";
                  const displayVal = value != null ? (isSubtract ? `-${fmtB(value)}` : (value >= 0 ? `+${fmtB(value)}` : fmtB(value))) : "—";
                  const colorClass = value != null
                    ? (isSubtract ? "text-destructive" : value >= 0 ? "text-success" : "text-destructive")
                    : "text-muted-foreground";
                  return (
                    <div key={i}>
                      <div className="flex items-start justify-between gap-4 py-2 border-b border-border/50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium w-4 text-center font-mono text-muted-foreground">{sign}</span>
                            <span className="text-sm font-medium">{label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 ml-6">{note}</p>
                        </div>
                        <span className={`font-mono font-semibold text-sm shrink-0 ${colorClass}`}>{displayVal}</span>
                      </div>
                    </div>
                  );
                })}

                {result.incalculable === false && (
                  <div className="flex items-center justify-between pt-3 mt-1 border-t-2 border-border">
                    <span className="font-semibold text-sm">= Owner's Earnings (Total)</span>
                    <span className={`font-mono font-bold text-lg ${result.ownersEarnings >= 0 ? "text-primary" : "text-destructive"}`}>
                      {fmtB(result.ownersEarnings)}
                    </span>
                  </div>
                )}
              </div>

              {result.incalculable && (
                <div className="flex gap-3 items-start p-4 rounded-lg bg-destructive/10 border border-destructive/20 mt-4">
                  <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-destructive">Incalculable</p>
                    <p className="text-sm text-muted-foreground mt-1">{result.reason}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {result.incalculable === false && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Valuation Steps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    step: "1", label: "Owner's Earnings Per Share",
                    value: fmt(result.ownersEarningsPerShare),
                    note: `Owner's Earnings (${fmtB(result.ownersEarnings)}) ÷ ${data.sharesOutstanding != null ? (data.sharesOutstanding / 1e9).toFixed(2) + "B" : "N/A"} shares. The true cash each share represents — what Buffett calls the owner's "look-through" earnings.`,
                  },
                  {
                    step: "2", label: "Earnings Multiplier",
                    value: `${multiplier}×`,
                    note: `A P/E-like multiple applied to Owner's Earnings per Share. Adjust this based on your required rate of return: a multiplier of 10 implies a 10% required return. Lower multiplier = higher return requirement (more conservative). Default 10.`,
                  },
                  {
                    step: "3", label: "Fair Value Per Share",
                    value: fmt(result.fairValue),
                    note: `Owner's Earnings Per Share × Multiplier. The price at which you would earn your target return from the business's current cash-generating power alone.`,
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
          {result.incalculable === false && result.fairValue != null && (
            <Card className={`border-2 ${result.upside != null && result.upside > 0 ? "border-success/50 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
              <CardContent className="pt-6 text-center space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Verdict</p>
                <p className="text-3xl font-bold font-mono text-primary">{fmt(result.fairValue)}</p>
                <p className="text-sm text-muted-foreground">Fair Value / Share</p>
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
                  <div className="flex justify-between"><span>OE Total</span><span className="font-mono">{fmtB(result.ownersEarnings)}</span></div>
                  <div className="flex justify-between"><span>OE / Share</span><span className="font-mono">{fmt(result.ownersEarningsPerShare)}</span></div>
                  <div className="flex justify-between"><span>Multiplier</span><span className="font-mono">{multiplier}×</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Earnings Multiplier</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Multiplier (×)</Label>
                <Input
                  type="number"
                  step="1"
                  min="5"
                  max="30"
                  value={multiplier}
                  onChange={e => setMultiplier(parseInt(e.target.value) || 10)}
                  className="font-mono h-8 text-sm"
                />
              </div>
              <div className="p-3 rounded-lg bg-muted/30 text-xs space-y-1">
                <p className="font-medium text-foreground mb-2">Multiplier ↔ Implied Return</p>
                {[
                  ["8×", "12.5% return"],
                  ["10×", "10% return (default)"],
                  ["12×", "8.3% return"],
                  ["15×", "6.7% return"],
                ].map(([m, r]) => (
                  <div key={m} className={`flex justify-between ${multiplier === parseInt(m) ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                    <span>{m}</span><span>{r}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Choose based on your required rate of return. A lower multiplier demands higher returns (more conservative). Adjust to reflect your investment hurdle rate.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Key Insights</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoBox><strong>Why not reported earnings?</strong> Net income can be skewed by non-cash charges (depreciation, amortization) and accounting rules (deferred taxes). Owner's Earnings focuses strictly on cash availability — the cash an owner can extract without harming the business.</InfoBox>
              <NoteBox><strong>FCF vs. Owner's Earnings:</strong> Free Cash Flow uses total CapEx, which overstates the maintenance burden. Owner's Earnings uses only maintenance CapEx — the irreducible minimum to preserve the business's earning power. This difference can be significant for capital-intensive companies.</NoteBox>
              <InfoBox><strong>Working capital changes:</strong> If negative (working capital grew), the business absorbed cash — typical during high-growth phases. If positive, the business released cash — common in mature or declining businesses.</InfoBox>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
