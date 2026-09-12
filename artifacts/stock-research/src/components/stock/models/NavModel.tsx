import { useMemo, useState } from "react";
import type { NavData } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Info, AlertCircle } from "lucide-react";
import { calculateNav } from "@/lib/nav-calculations";

interface Props {
  data: NavData;
}

function fmtMoney(value: number | null, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(decimals)}`;
}

function fmtBillions(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${(value / 1e9).toFixed(2)}B`;
}

function AssumptionInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="relative">
        <NumericInput
          value={value}
          onChange={onChange}
          className="h-9 pr-8 font-mono"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          B
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function NavModel({ data }: Props) {
  const [propertyValue, setPropertyValue] = useState(
    (data.propertyAssets ?? 0) / 1e9,
  );
  const [otherAssets, setOtherAssets] = useState(
    (data.otherAssets ?? 0) / 1e9,
  );
  const [totalLiabilities, setTotalLiabilities] = useState(
    (data.totalLiabilities ?? 0) / 1e9,
  );
  const [shares, setShares] = useState(
    (data.sharesOutstanding ?? 0) / 1e9,
  );

  const result = useMemo(
    () =>
      calculateNav({
        propertyValue,
        otherAssets,
        totalLiabilities,
        sharesOutstanding: shares,
        currentPrice: data.currentPrice,
      }),
    [propertyValue, otherAssets, totalLiabilities, shares, data.currentPrice],
  );

  const marketLabel =
    result?.premiumDiscountPct == null
      ? null
      : result.premiumDiscountPct <= 0
        ? "Discount to NAV"
        : "Premium to NAV";
  const marketPct =
    result?.premiumDiscountPct == null
      ? null
      : Math.abs(result.premiumDiscountPct);
  const marketIsDiscount =
    result?.premiumDiscountPct != null && result.premiumDiscountPct <= 0;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          The <strong className="text-foreground">Net Asset Value (NAV) model</strong>{" "}
          estimates the fair market value of the company&apos;s properties or primary
          assets, adds other assets, subtracts total liabilities, and divides the
          result by shares outstanding. The resulting NAV per share is compared with
          the current stock price to identify a discount or premium.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Reported Financial Inputs</CardTitle>
              <p className="text-xs text-muted-foreground">
                Latest annual balance sheet{data.dataYear ? ` (${data.dataYear})` : ""}.
                These are accounting carrying values, not independent appraisals.
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ["Properties / primary assets", fmtBillions(data.propertyAssets)],
                ["Other assets", fmtBillions(data.otherAssets)],
                ["Total assets", fmtBillions(data.totalAssets)],
                ["Total liabilities", fmtBillions(data.totalLiabilities)],
                [
                  "Shares outstanding",
                  data.sharesOutstanding != null
                    ? `${(data.sharesOutstanding / 1e9).toFixed(3)}B`
                    : "—",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0"
                >
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="font-mono text-xs font-semibold">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Valuation Assumptions</CardTitle>
              <p className="text-xs text-muted-foreground">
                Replace carrying values with your fair-market estimates where appropriate.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <AssumptionInput
                label="Fair Value of Properties / Primary Assets"
                value={propertyValue}
                onChange={setPropertyValue}
                hint="For a REIT, estimate the market value of its real estate. For a fund or holding company, use the fair value of its principal investments."
              />
              <AssumptionInput
                label="Other Assets"
                value={otherAssets}
                onChange={setOtherAssets}
                hint="Cash, receivables, investments, and other assets not included in the primary asset estimate."
              />
              <AssumptionInput
                label="Total Liabilities"
                value={totalLiabilities}
                onChange={setTotalLiabilities}
                hint="All reported liabilities—not only interest-bearing debt."
              />
              <AssumptionInput
                label="Shares Outstanding"
                value={shares}
                onChange={setShares}
                hint="Current common shares outstanding."
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {result ? (
            <>
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="grid grid-cols-2 gap-4 pt-5 text-center md:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">NAV per Share</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-primary">
                      {fmtMoney(result.navPerShare)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Current Price</p>
                    <p className="mt-1 font-mono text-2xl font-bold">
                      {fmtMoney(data.currentPrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{marketLabel ?? "Price Comparison"}</p>
                    <p
                      className={`mt-1 font-mono text-2xl font-bold ${
                        marketIsDiscount ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {marketPct != null ? `${marketPct.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net Asset Value</p>
                    <p className="mt-1 font-mono text-xl font-bold">
                      ${result.netAssetValue.toFixed(2)}B
                    </p>
                  </div>
                </CardContent>
              </Card>

              {result.netAssetValue <= 0 && (
                <div className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-muted-foreground">
                    Liabilities exceed the estimated fair value of assets. Review the
                    assumptions before relying on this result.
                  </p>
                </div>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">NAV Valuation Bridge</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b border-border/50">
                          <td className="py-3">Fair value of properties / primary assets</td>
                          <td className="py-3 text-right font-mono">${propertyValue.toFixed(2)}B</td>
                        </tr>
                        <tr className="border-b border-border/50">
                          <td className="py-3">Plus: Other assets</td>
                          <td className="py-3 text-right font-mono">+${otherAssets.toFixed(2)}B</td>
                        </tr>
                        <tr className="border-b border-border font-semibold">
                          <td className="py-3">Fair value of total assets</td>
                          <td className="py-3 text-right font-mono">${result.grossAssetValue.toFixed(2)}B</td>
                        </tr>
                        <tr className="border-b border-border/50">
                          <td className="py-3">Less: Total liabilities</td>
                          <td className="py-3 text-right font-mono text-destructive">−${totalLiabilities.toFixed(2)}B</td>
                        </tr>
                        <tr className="border-b-2 border-border font-semibold">
                          <td className="py-3">Net Asset Value</td>
                          <td className="py-3 text-right font-mono">${result.netAssetValue.toFixed(2)}B</td>
                        </tr>
                        <tr className="font-semibold text-primary">
                          <td className="py-3">NAV ÷ {shares.toFixed(3)}B shares</td>
                          <td className="py-3 text-right font-mono">{fmtMoney(result.navPerShare)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Formula: (Fair market value of properties or primary assets + other
                    assets − total liabilities) ÷ shares outstanding.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">How to Interpret the Result</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    A <strong className="text-foreground">discount to NAV</strong> means
                    the market price is below the estimated net value of the assets. It
                    may reflect an opportunity, but can also reflect weak asset quality,
                    high costs, taxes, illiquidity, or poor capital allocation.
                  </p>
                  <p>
                    A <strong className="text-foreground">premium to NAV</strong> means
                    investors are paying above estimated asset value, often for management
                    quality, growth prospects, scarce assets, or access to capital.
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Enter non-negative asset and liability values and a positive share count
                to calculate NAV.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}