import { useState, useMemo } from "react";
import type { DcfInputs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";

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

function fmtShares(n: number | null): string {
  if (n == null) return "N/A";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toFixed(0);
}

interface DcfParams {
  g1: number;
  g2: number;
  g3: number;
  termG: number;
  discount: number;
  fcf: number;
  shares: number;
  netDebt: number;
}

interface DcfRow {
  year: number;
  growthRate: number;
  cashFlow: number;
  pv: number;
  cumPV: number;
}

interface DcfResult {
  rows: DcfRow[];
  terminalValue: number;
  terminalPV: number;
  sumPV: number;
  totalPV: number;
  equityValue: number;
  intrinsicValue: number;
}

function calcDCF(p: DcfParams): DcfResult {
  const r = p.discount / 100;
  const g1 = p.g1 / 100;
  const g2 = p.g2 / 100;
  const g3 = p.g3 / 100;
  const termG = p.termG / 100;

  const rows: DcfRow[] = [];
  let cf = p.fcf;
  let cumPV = 0;

  for (let yr = 1; yr <= 15; yr++) {
    const g = yr <= 5 ? g1 : yr <= 10 ? g2 : g3;
    cf = cf * (1 + g);
    const pv = cf / Math.pow(1 + r, yr);
    cumPV += pv;
    rows.push({ year: yr, growthRate: (yr <= 5 ? p.g1 : yr <= 10 ? p.g2 : p.g3), cashFlow: cf, pv, cumPV });
  }

  const cf15 = rows[14].cashFlow;
  const terminalValue = (cf15 * (1 + termG)) / (r - termG);
  const terminalPV = terminalValue / Math.pow(1 + r, 15);
  const totalPV = cumPV + terminalPV;
  const equityValue = totalPV - p.netDebt;
  const intrinsicValue = equityValue / p.shares;

  return { rows, terminalValue, terminalPV, sumPV: cumPV, totalPV, equityValue, intrinsicValue };
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

export default function DcfAnalysis({ dcfInputs }: Props) {
  const [g1, setG1] = useState(10);
  const [g2, setG2] = useState(5);
  const [g3, setG3] = useState(3);
  const [termG, setTermG] = useState(1);
  const [discount, setDiscount] = useState(12);
  const [fcf, setFcf] = useState<number>((dcfInputs.freeCashFlow ?? 0) / 1e9);
  const [shares, setShares] = useState<number>((dcfInputs.sharesOutstanding ?? 0) / 1e9);
  const [netDebt, setNetDebt] = useState<number>((dcfInputs.netDebt ?? 0) / 1e9);

  const result = useMemo<DcfResult | null>(() => {
    if (!fcf || !shares || discount <= termG) return null;
    try {
      return calcDCF({
        g1, g2, g3, termG, discount,
        fcf: fcf * 1e9,
        shares: shares * 1e9,
        netDebt: netDebt * 1e9,
      });
    } catch {
      return null;
    }
  }, [g1, g2, g3, termG, discount, fcf, shares, netDebt]);

  const currentPrice = dcfInputs.currentPrice;
  const margin = result && currentPrice
    ? ((result.intrinsicValue - currentPrice) / currentPrice) * 100
    : null;

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <Card className="border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              A <strong className="text-foreground">Discounted Cash Flow (DCF)</strong> model estimates a company's value today by projecting its future free cash flows and discounting them back to present value. The core idea: a dollar received years from now is worth less than a dollar today (due to inflation and the time value of money). The <em>discount rate</em> represents your required annual return. If the resulting intrinsic value per share exceeds the current stock price, the stock may be undervalued.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assumptions Panel */}
        <div className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Growth Rate Assumptions</CardTitle>
              <p className="text-xs text-muted-foreground">How fast do you expect the company's free cash flow to grow? Use optimistic estimates for year 1–5, then taper off. The defaults (10% → 5% → 3%) represent a high-quality compounder.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <NumberInput label="Years 1–5 Growth Rate" value={g1} onChange={setG1} suffix="%" hint="Default 10%: a strong-growth company" />
              <NumberInput label="Years 6–10 Growth Rate" value={g2} onChange={setG2} suffix="%" hint="Default 5%: growth slowing as company matures" />
              <NumberInput label="Years 11–15 Growth Rate" value={g3} onChange={setG3} suffix="%" hint="Default 3%: approaching steady-state" />
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Discount & Terminal Rate</CardTitle>
              <p className="text-xs text-muted-foreground">The discount rate is your minimum required annual return (think of it as your hurdle rate). The terminal growth rate is how fast you expect cash flows to grow after year 15, in perpetuity — keep it near long-run GDP (1–3%).</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <NumberInput label="Discount Rate" value={discount} onChange={setDiscount} suffix="%" hint="Default 12%: reasonable for equities" />
              <NumberInput label="Terminal Growth Rate" value={termG} onChange={setTermG} suffix="%" hint="Default 1%: conservative long-run growth" />
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Financial Inputs
                <span className="ml-2 text-xs font-normal text-muted-foreground">({dcfInputs.dataYear})</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Pre-filled from the most recent annual report. Adjust if you want to use a different base year or make a conservative adjustment.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <NumberInput
                label="Free Cash Flow (billions)"
                value={fcf}
                onChange={setFcf}
                suffix="B"
                hint={`Current: ${fmtB(dcfInputs.freeCashFlow ?? null)}`}
              />
              <NumberInput
                label="Shares Outstanding (billions)"
                value={shares}
                onChange={setShares}
                suffix="B"
                hint={`Current: ${fmtShares(dcfInputs.sharesOutstanding ?? null)}`}
              />
              <NumberInput
                label="Net Debt (billions)"
                value={netDebt}
                onChange={setNetDebt}
                suffix="B"
                hint={`Current: ${fmtB(dcfInputs.netDebt ?? null)} — negative means net cash`}
              />
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Key Result */}
          {result && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-5 pb-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Intrinsic Value</p>
                    <p className="text-2xl font-bold font-mono text-primary">
                      ${fmt(result.intrinsicValue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Current Price</p>
                    <p className="text-2xl font-bold font-mono">
                      ${fmt(currentPrice ?? null)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Margin of Safety</p>
                    <p className={`text-2xl font-bold font-mono ${margin != null && margin > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {margin != null ? `${margin > 0 ? "+" : ""}${fmt(margin)}%` : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total PV</p>
                    <p className="text-lg font-bold font-mono">
                      {fmtB(result.totalPV)}
                    </p>
                  </div>
                </div>
                {margin != null && (
                  <p className="text-xs text-center text-muted-foreground mt-3">
                    {margin > 30
                      ? "Stock appears significantly undervalued — substantial margin of safety."
                      : margin > 10
                      ? "Stock appears modestly undervalued — some margin of safety."
                      : margin > -10
                      ? "Stock appears fairly valued near intrinsic value."
                      : margin > -30
                      ? "Stock appears modestly overvalued relative to this DCF."
                      : "Stock appears significantly overvalued — requires high growth assumptions to justify price."}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* PV Summary */}
          {result && (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Present Value Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">PV of Years 1–15</p>
                    <p className="font-mono font-semibold mt-1">{fmtB(result.sumPV)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fmt((result.sumPV / result.totalPV) * 100)}% of total</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">PV of Terminal Value</p>
                    <p className="font-mono font-semibold mt-1">{fmtB(result.terminalPV)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fmt((result.terminalPV / result.totalPV) * 100)}% of total</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Equity Value</p>
                    <p className="font-mono font-semibold mt-1">{fmtB(result.equityValue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">After net debt</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  <strong>Terminal value</strong> represents cash flows beyond year 15, growing at {termG}% forever. A high terminal value share (&gt;70%) signals heavy reliance on distant projections — treat with caution.
                </p>
              </CardContent>
            </Card>
          )}

          {/* 15-Year Cash Flow Table */}
          {result && (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">15-Year Projected Cash Flows</CardTitle>
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
                        <tr
                          key={row.year}
                          className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${
                            row.year === 5 || row.year === 10 ? "bg-primary/5" : ""
                          }`}
                        >
                          <td className="px-4 py-1.5 font-mono font-medium">
                            {row.year}
                            {row.year === 5 && <span className="ml-1 text-muted-foreground">(phase 1 end)</span>}
                            {row.year === 10 && <span className="ml-1 text-muted-foreground">(phase 2 end)</span>}
                            {row.year === 15 && <span className="ml-1 text-muted-foreground">(terminal base)</span>}
                          </td>
                          <td className="px-4 py-1.5 font-mono text-right text-muted-foreground">{row.growthRate}%</td>
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
          )}

          {!result && (
            <Card className="border-border">
              <CardContent className="pt-8 pb-8 text-center text-muted-foreground text-sm">
                Enter valid inputs (discount rate must exceed terminal growth rate) to see the DCF valuation.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
