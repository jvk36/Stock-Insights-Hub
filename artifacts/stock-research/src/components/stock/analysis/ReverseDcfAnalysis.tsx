import { useState, useMemo } from "react";
import type { DcfInputs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Info, TrendingUp } from "lucide-react";

interface Props {
  dcfInputs: DcfInputs;
}

function fmt(n: number | null, decimals = 2): string {
  if (n == null) return "N/A";
  return n.toFixed(decimals);
}

function fmtB(n: number | null): string {
  if (n == null) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

interface DcfRow {
  year: number;
  growthRate: number;
  cashFlow: number;
  pv: number;
  cumPV: number;
}

interface CalcResult {
  rows: DcfRow[];
  terminalPV: number;
  sumPV: number;
  totalPV: number;
  intrinsicValue: number;
}

function calcDCFWithRates(
  g1pct: number,
  g2pct: number,
  g3pct: number,
  termGpct: number,
  discountPct: number,
  initialFCF: number,
  shares: number,
  netDebt: number
): CalcResult {
  const r = discountPct / 100;
  const termG = termGpct / 100;
  const rates = [g1pct / 100, g2pct / 100, g3pct / 100];

  const rows: DcfRow[] = [];
  let cf = initialFCF;
  let cumPV = 0;

  for (let yr = 1; yr <= 15; yr++) {
    const g = yr <= 5 ? rates[0] : yr <= 10 ? rates[1] : rates[2];
    cf = cf * (1 + g);
    const pv = cf / Math.pow(1 + r, yr);
    cumPV += pv;
    rows.push({
      year: yr,
      growthRate: yr <= 5 ? g1pct : yr <= 10 ? g2pct : g3pct,
      cashFlow: cf,
      pv,
      cumPV,
    });
  }

  const cf15 = rows[14].cashFlow;
  const terminalValue = (cf15 * (1 + termG)) / (r - termG);
  const terminalPV = terminalValue / Math.pow(1 + r, 15);
  const totalPV = cumPV + terminalPV;
  const equityValue = totalPV - netDebt;
  const intrinsicValue = equityValue / shares;

  return { rows, terminalPV, sumPV: cumPV, totalPV, intrinsicValue };
}

// Binary search for the g1 (1-5yr rate) that makes intrinsicValue === targetPrice
// Uses 10:5:3 ratio: g2 = g1 * 0.5, g3 = g1 * 0.3
function findImpliedGrowth(
  targetPrice: number,
  termGpct: number,
  discountPct: number,
  initialFCF: number,
  shares: number,
  netDebt: number
): number | null {
  const r = discountPct / 100;
  const termG = termGpct / 100;
  if (r <= termG) return null;

  // target total PV = price * shares + netDebt
  const targetPV = targetPrice * shares + netDebt;
  if (targetPV <= 0) return null;

  let lo = -50;
  let hi = 150; // search g1 in [-50%, 150%]

  const evalAt = (g1pct: number) => {
    const g2pct = g1pct * 0.5;
    const g3pct = g1pct * 0.3;
    const res = calcDCFWithRates(g1pct, g2pct, g3pct, termGpct, discountPct, initialFCF, shares, netDebt);
    return res.totalPV;
  };

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const pv = evalAt(mid);
    if (pv < targetPV) lo = mid;
    else hi = mid;
    if (Math.abs(hi - lo) < 0.001) break;
  }

  return (lo + hi) / 2;
}

function NumberInput({
  label,
  value,
  onChange,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          className="h-8 text-sm pr-8"
          step="0.1"
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground leading-tight">{hint}</p>}
    </div>
  );
}

export default function ReverseDcfAnalysis({ dcfInputs }: Props) {
  const [termG, setTermG] = useState(1);
  const [discount, setDiscount] = useState(12);
  const [fcf, setFcf] = useState<number>((dcfInputs.freeCashFlow ?? 0) / 1e9);
  const [shares, setShares] = useState<number>((dcfInputs.sharesOutstanding ?? 0) / 1e9);
  const [netDebt, setNetDebt] = useState<number>((dcfInputs.netDebt ?? 0) / 1e9);

  const currentPrice = dcfInputs.currentPrice;

  const result = useMemo(() => {
    if (!fcf || !shares || !currentPrice || discount <= termG) return null;
    const fcfRaw = fcf * 1e9;
    const sharesRaw = shares * 1e9;
    const netDebtRaw = netDebt * 1e9;

    const impliedG1 = findImpliedGrowth(
      currentPrice,
      termG,
      discount,
      fcfRaw,
      sharesRaw,
      netDebtRaw
    );
    if (impliedG1 == null) return null;

    const impliedG2 = impliedG1 * 0.5;
    const impliedG3 = impliedG1 * 0.3;

    const dcfResult = calcDCFWithRates(
      impliedG1,
      impliedG2,
      impliedG3,
      termG,
      discount,
      fcfRaw,
      sharesRaw,
      netDebtRaw
    );

    return { impliedG1, impliedG2, impliedG3, ...dcfResult };
  }, [termG, discount, fcf, shares, netDebt, currentPrice]);

  function verdictColor(g1: number): string {
    if (g1 <= 0) return "text-emerald-600";
    if (g1 <= 5) return "text-emerald-600";
    if (g1 <= 10) return "text-amber-600";
    if (g1 <= 20) return "text-rose-600";
    return "text-rose-700";
  }

  function verdictLabel(g1: number): string {
    if (g1 <= 0) return "Very conservative expectations — stock may be undervalued.";
    if (g1 <= 5) return "Low growth expectations — stock could be a value opportunity.";
    if (g1 <= 10) return "Moderate growth priced in — stock is fairly valued.";
    if (g1 <= 20) return "High growth required — stock is pricing in optimistic assumptions.";
    return "Extremely high growth baked in — significant execution risk if growth disappoints.";
  }

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <Card className="border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              A <strong className="text-foreground">Reverse DCF</strong> flips the question: instead of asking "what is the stock worth?", it asks <em>"what growth rate must this company achieve to justify its current stock price?"</em> This is powerful because it reveals the market's embedded expectations. If the implied growth rate seems unrealistic, the stock may be overvalued — and vice versa. Growth rates are assumed to follow a <strong className="text-foreground">10:5:3 ratio</strong> across the three phases (the 1–5yr rate is the anchor, with later phases scaling proportionally).
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <div className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Discount & Terminal Rate</CardTitle>
              <p className="text-xs text-muted-foreground">Same meaning as in the DCF model. The reverse DCF will find the growth rate that makes the stock's intrinsic value match its current price, given these rates.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <NumberInput label="Discount Rate" value={discount} onChange={setDiscount} suffix="%" hint="Default 12%" />
              <NumberInput label="Terminal Growth Rate" value={termG} onChange={setTermG} suffix="%" hint="Default 1%" />
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Financial Inputs
                <span className="ml-2 text-xs font-normal text-muted-foreground">({dcfInputs.dataYear})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <NumberInput label="Free Cash Flow (billions)" value={fcf} onChange={setFcf} suffix="B" />
              <NumberInput label="Shares Outstanding (billions)" value={shares} onChange={setShares} suffix="B" />
              <NumberInput label="Net Debt (billions)" value={netDebt} onChange={setNetDebt} suffix="B" />
            </CardContent>
          </Card>

          {/* Growth Ratio Explainer */}
          <Card className="border-border bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">10:5:3 Phase Ratio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Growth rates across the three phases are locked in a 10:5:3 ratio. If the implied Year 1–5 rate is <strong>X%</strong>:</p>
              {result ? (
                <div className="space-y-1">
                  {[
                    { label: "Years 1–5", g: result.impliedG1 },
                    { label: "Years 6–10", g: result.impliedG2 },
                    { label: "Years 11–15", g: result.impliedG3 },
                  ].map(({ label, g }) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-mono font-semibold ${verdictColor(g)}`}>{fmt(g)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Enter inputs to see implied rates.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {result && currentPrice && (
            <>
              {/* Key Result */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-5 pb-5">
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">Implied 5-Year Growth Rate (Years 1–5)</p>
                    <p className={`text-5xl font-bold font-mono ${verdictColor(result.impliedG1)}`}>
                      {fmt(result.impliedG1)}%
                    </p>
                    <p className="text-sm text-muted-foreground">
                      at a current price of <span className="font-mono font-semibold text-foreground">${fmt(currentPrice)}</span>
                    </p>
                  </div>
                  <div className="mt-4 flex items-start gap-2 bg-background/60 rounded-lg p-3">
                    <TrendingUp className={`w-4 h-4 mt-0.5 shrink-0 ${verdictColor(result.impliedG1)}`} />
                    <p className={`text-sm font-medium ${verdictColor(result.impliedG1)}`}>
                      {verdictLabel(result.impliedG1)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Comparison with Standard Assumptions */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Implied vs. Standard Assumptions</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-muted-foreground font-medium text-xs">Phase</th>
                        <th className="text-right py-2 text-muted-foreground font-medium text-xs">Market Implied</th>
                        <th className="text-right py-2 text-muted-foreground font-medium text-xs">Standard Default</th>
                        <th className="text-right py-2 text-muted-foreground font-medium text-xs">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Years 1–5", implied: result.impliedG1, standard: 10 },
                        { label: "Years 6–10", implied: result.impliedG2, standard: 5 },
                        { label: "Years 11–15", implied: result.impliedG3, standard: 3 },
                        { label: "Terminal", implied: termG, standard: 1 },
                        { label: "Discount Rate", implied: discount, standard: 12 },
                      ].map(({ label, implied, standard }) => {
                        const diff = implied - standard;
                        return (
                          <tr key={label} className="border-b border-border/50">
                            <td className="py-2 text-xs font-medium">{label}</td>
                            <td className={`py-2 text-right font-mono text-xs font-semibold ${verdictColor(implied)}`}>{fmt(implied)}%</td>
                            <td className="py-2 text-right font-mono text-xs text-muted-foreground">{fmt(standard)}%</td>
                            <td className={`py-2 text-right font-mono text-xs font-semibold ${diff > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                              {diff > 0 ? "+" : ""}{fmt(diff)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs text-muted-foreground mt-3">
                    A positive difference means the market expects <em>more</em> growth than the standard assumption. A negative difference means the market is pricing in <em>less</em> — a potential value signal.
                  </p>
                </CardContent>
              </Card>

              {/* 15-Year Table */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Implied 15-Year Cash Flow Projection</CardTitle>
                  <p className="text-xs text-muted-foreground">These are the cash flows the market is effectively pricing in at the current stock price.</p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Year</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Growth</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Free Cash Flow</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Present Value</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Cumulative PV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row) => (
                          <tr key={row.year} className={`border-b border-border/50 hover:bg-muted/30 ${row.year === 5 || row.year === 10 ? "bg-primary/5" : ""}`}>
                            <td className="px-4 py-1.5 font-mono font-medium">{row.year}</td>
                            <td className="px-4 py-1.5 font-mono text-right text-muted-foreground">{fmt(row.growthRate)}%</td>
                            <td className="px-4 py-1.5 font-mono text-right">{fmtB(row.cashFlow)}</td>
                            <td className="px-4 py-1.5 font-mono text-right text-primary">{fmtB(row.pv)}</td>
                            <td className="px-4 py-1.5 font-mono text-right">{fmtB(row.cumPV)}</td>
                          </tr>
                        ))}
                        <tr className="border-b border-border bg-muted/40 font-semibold">
                          <td className="px-4 py-2" colSpan={3}>Terminal Value (Year 16+)</td>
                          <td className="px-4 py-2 font-mono text-right text-primary">{fmtB(result.terminalPV)}</td>
                          <td className="px-4 py-2 font-mono text-right">{fmtB(result.totalPV)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {!result && (
            <Card className="border-border">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground text-sm">
                Enter valid inputs (discount rate must exceed terminal growth rate) to see the implied growth rate.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
