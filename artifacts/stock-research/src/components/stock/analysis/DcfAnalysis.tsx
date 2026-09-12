import { useState, useMemo } from "react";
import type { DcfInputs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { calculateDcf, type DcfResult } from "@/lib/dcf-calculations";

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
        <NumericInput
          value={value}
          onChange={onChange}
          className="h-8 text-sm pr-8"
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
  const [basis, setBasis] = useState<"fcf" | "affo">(dcfInputs.valuationBasis);
  const [g1, setG1] = useState(dcfInputs.valuationBasis === "affo" ? 4 : 10);
  const [g2, setG2] = useState(dcfInputs.valuationBasis === "affo" ? 3 : 5);
  const [g3, setG3] = useState(dcfInputs.valuationBasis === "affo" ? 2 : 3);
  const [termG, setTermG] = useState(1);
  const [discount, setDiscount] = useState(dcfInputs.valuationBasis === "affo" ? 10 : 12);
  const [fcf, setFcf] = useState<number>((dcfInputs.freeCashFlow ?? 0) / 1e9);
  const [shares, setShares] = useState<number>((dcfInputs.sharesOutstanding ?? 0) / 1e9);
  const [netDebt, setNetDebt] = useState<number>((dcfInputs.netDebt ?? 0) / 1e9);
  const reportedAffoPerShare = dcfInputs.affo.perShare;
  const [affoPerShare, setAffoPerShare] = useState<number>(reportedAffoPerShare ?? 0);
  const isAffo = basis === "affo";
  const mortgageBlocked =
    isAffo && dcfInputs.reitClassification.kind === "mortgage_reit";

  const result = useMemo<DcfResult | null>(() => {
    if (discount <= termG || mortgageBlocked) return null;
    if (isAffo && affoPerShare <= 0) return null;
    if (!isAffo && (!fcf || !shares)) return null;
    try {
      return calculateDcf({
        g1, g2, g3, termG, discount,
        cashFlow: isAffo ? affoPerShare : fcf * 1e9,
        shares: isAffo ? 1 : shares * 1e9,
        netDebt: isAffo ? 0 : netDebt * 1e9,
      });
    } catch {
      return null;
    }
  }, [g1, g2, g3, termG, discount, fcf, shares, netDebt, isAffo, affoPerShare, mortgageBlocked]);

  const currentPrice = dcfInputs.currentPrice;
  const margin = result && currentPrice
    ? ((result.intrinsicValue - currentPrice) / currentPrice) * 100
    : null;

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">
                  DCF Valuation — {isAffo ? "AFFO Basis" : "FCF Basis"}
                </p>
                <Badge variant="secondary">
                  {dcfInputs.reitClassification.confidence} confidence
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {dcfInputs.reitClassification.reason} Source: {dcfInputs.reitClassification.source}
                {dcfInputs.reitClassification.industry
                  ? ` (${dcfInputs.reitClassification.industry})`
                  : ""}
              </p>
            </div>
            <div className="flex rounded-md border border-border p-1" aria-label="Valuation basis">
              {(["fcf", "affo"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setBasis(option)}
                  className={`rounded px-3 py-1 text-xs font-medium ${
                    basis === option ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {basis !== dcfInputs.valuationBasis && (
            <p className="text-xs text-amber-700">
              Manual override active. Automatic basis: {dcfInputs.valuationBasis.toUpperCase()}.
            </p>
          )}
          {mortgageBlocked && (
            <p className="text-sm text-rose-700 font-medium">
              Mortgage REITs are not supported by this AFFO DCF. Use a book-value, spread, and leverage model instead.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Explanation */}
      <Card className="border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isAffo ? (
                <>For equity REITs, this model projects <strong className="text-foreground">AFFO per share</strong> and discounts those after-interest equity cash flows directly. Net debt is not subtracted. AFFO is used because ordinary free cash flow is distorted by real-estate depreciation and property investment.</>
              ) : (
                <>A <strong className="text-foreground">Discounted Cash Flow (DCF)</strong> model estimates a company's value today by projecting its future free cash flows and discounting them back to present value. The <em>discount rate</em> represents your required annual return.</>
              )}
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
               <p className="text-xs text-muted-foreground">How fast do you expect {isAffo ? "AFFO per share" : "free cash flow"} to grow? Defaults are {isAffo ? "conservative for a mature equity REIT (4% → 3% → 2%)" : "10% → 5% → 3% for a high-quality compounder"}.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <NumberInput label="Years 1–5 Growth Rate" value={g1} onChange={setG1} suffix="%" />
              <NumberInput label="Years 6–10 Growth Rate" value={g2} onChange={setG2} suffix="%" />
              <NumberInput label="Years 11–15 Growth Rate" value={g3} onChange={setG3} suffix="%" />
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Discount & Terminal Rate</CardTitle>
              <p className="text-xs text-muted-foreground">The discount rate is your minimum required annual return (think of it as your hurdle rate). The terminal growth rate is how fast you expect cash flows to grow after year 15, in perpetuity — keep it near long-run GDP (1–3%).</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <NumberInput label="Discount Rate" value={discount} onChange={setDiscount} suffix="%" hint={isAffo ? "Initial REIT default: 10%" : "Initial equity default: 12%"} />
              <NumberInput label="Terminal Growth Rate" value={termG} onChange={setTermG} suffix="%" hint="Default 1%: conservative long-run growth" />
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Financial Inputs
                <span className="ml-2 text-xs font-normal text-muted-foreground">({dcfInputs.dataYear})</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{isAffo ? "Company-reported data is shown separately from your editable valuation assumption." : "Pre-filled from current financial data. Adjust if needed."}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {isAffo ? (
                <>
                  <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                    <p className="font-semibold">Company-reported AFFO</p>
                    <p>{dcfInputs.affo.status === "reported" ? `${dcfInputs.affo.perShare != null ? `$${fmt(dcfInputs.affo.perShare)} per share` : fmtB(dcfInputs.affo.total)} for period ${dcfInputs.affo.period}` : "Unavailable"}</p>
                    <p className="text-muted-foreground">{dcfInputs.affo.source ?? dcfInputs.affo.note}</p>
                    {dcfInputs.affo.concept && <p className="text-muted-foreground">SEC concept: {dcfInputs.affo.concept}</p>}
                  </div>
                  <NumberInput
                    label="AFFO per share assumption"
                    value={affoPerShare}
                    onChange={setAffoPerShare}
                    suffix="$"
                    hint={reportedAffoPerShare != null ? `Initialized from reported data: $${fmt(reportedAffoPerShare)}` : "Required manual input. No FCF or FFO substitution is made."}
                  />
                  <p className="text-xs text-muted-foreground">Net debt is not subtracted because AFFO is an after-interest equity measure.</p>
                </>
              ) : (
                <>
                  <NumberInput label="Free Cash Flow (billions)" value={fcf} onChange={setFcf} suffix="B" hint={`Current: ${fmtB(dcfInputs.freeCashFlow ?? null)}`} />
                  <NumberInput label="Shares Outstanding (billions)" value={shares} onChange={setShares} suffix="B" hint={`Current: ${fmtShares(dcfInputs.sharesOutstanding ?? null)}`} />
                  <NumberInput label="Net Debt (billions)" value={netDebt} onChange={setNetDebt} suffix="B" hint={`Current: ${fmtB(dcfInputs.netDebt ?? null)} — negative means net cash`} />
                </>
              )}
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
                     <p className="text-xs text-muted-foreground mb-1">{isAffo ? "PV per Share" : "Total PV"}</p>
                    <p className="text-lg font-bold font-mono">
                       {isAffo ? `$${fmt(result.totalPV)}` : fmtB(result.totalPV)}
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
                    <p className="font-mono font-semibold mt-1">{isAffo ? `$${fmt(result.sumPV)}` : fmtB(result.sumPV)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fmt((result.sumPV / result.totalPV) * 100)}% of total</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">PV of Terminal Value</p>
                    <p className="font-mono font-semibold mt-1">{isAffo ? `$${fmt(result.terminalPV)}` : fmtB(result.terminalPV)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fmt((result.terminalPV / result.totalPV) * 100)}% of total</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Equity Value</p>
                    <p className="font-mono font-semibold mt-1">{isAffo ? `$${fmt(result.equityValue)}` : fmtB(result.equityValue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{isAffo ? "No net debt subtraction" : "After net debt"}</p>
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
                 <CardTitle className="text-sm font-semibold">15-Year Projected {isAffo ? "AFFO per Share" : "Cash Flows"}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Year</th>
                        <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Growth</th>
                         <th className="text-right px-4 py-2 font-semibold text-muted-foreground">{isAffo ? "AFFO / Share" : "Free Cash Flow"}</th>
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
                           <td className="px-4 py-1.5 font-mono text-right">{isAffo ? `$${fmt(row.cashFlow)}` : fmtB(row.cashFlow)}</td>
                           <td className="px-4 py-1.5 font-mono text-right text-primary">{isAffo ? `$${fmt(row.pv)}` : fmtB(row.pv)}</td>
                           <td className="px-4 py-1.5 font-mono text-right">{isAffo ? `$${fmt(row.cumPV)}` : fmtB(row.cumPV)}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-border bg-muted/40 font-semibold">
                        <td className="px-4 py-2" colSpan={3}>Terminal Value (Year 16+)</td>
                         <td className="px-4 py-2 font-mono text-right text-primary">{isAffo ? `$${fmt(result.terminalPV)}` : fmtB(result.terminalPV)}</td>
                         <td className="px-4 py-2 font-mono text-right">{isAffo ? `$${fmt(result.totalPV)}` : fmtB(result.totalPV)}</td>
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
                 {mortgageBlocked
                   ? "AFFO DCF is unavailable for mortgage REITs."
                   : isAffo && affoPerShare <= 0
                     ? "Enter a positive AFFO per share assumption to calculate a valuation. FCF is not used as a fallback."
                     : "Enter valid inputs (discount rate must exceed terminal growth rate) to see the DCF valuation."}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
