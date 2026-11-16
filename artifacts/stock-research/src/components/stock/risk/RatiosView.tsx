import { useMemo, useState } from "react";
import type { TickerPerformance } from "@workspace/api-client-react";
import { riskRatios } from "@/lib/risk-calculations";
import type { RiskRatios } from "@/lib/risk-calculations";
import type { PricePoint } from "@/lib/performance-calculations";
import { resolvePeriod } from "@/lib/performance-calculations";
import { PanelCard, Notice, fmtDate } from "@/components/stock/performance/perf-shared";
import { fmtNum, fmtPlainPct, sliceRange } from "./risk-shared";

export default function RatiosView({ symbol, data, prices, start, end }: { symbol: string; data: TickerPerformance; prices: PricePoint[]; start: string; end: string }) {
  const [rfText, setRfText] = useState("0");
  const rfNum = Number(rfText);
  const rfValid = rfText.trim() !== "" && Number.isFinite(rfNum) && rfNum > -100 && rfNum < 100;
  const rf = rfValid ? rfNum / 100 : null;
  const own = useMemo(() => (rf === null ? null : riskRatios(prices, rf)), [prices, rf]);
  const spyPeriod = useMemo(() => (data.benchmark?.prices.length ? resolvePeriod(data.benchmark.prices, start, end) : null), [data.benchmark, start, end]);
  const spyPrices = useMemo(() => (spyPeriod?.ok && data.benchmark ? sliceRange(data.benchmark.prices, spyPeriod.start.date, spyPeriod.end.date) : null), [spyPeriod, data.benchmark]);
  const spy = useMemo(() => (spyPrices && rf !== null ? riskRatios(spyPrices, rf) : null), [spyPrices, rf]);
  const spyNote = !data.benchmark?.prices.length ? "SPY benchmark unavailable for this request."
    : spyPeriod && !spyPeriod.ok ? `SPY unavailable for these dates: ${spyPeriod.reason}`
    : spyPeriod?.ok && spy ? `SPY actual dates ${fmtDate(spyPeriod.start.date)} to ${fmtDate(spyPeriod.end.date)}, ${spy.observations.toLocaleString()} daily returns (${symbol}: ${fmtDate(start)} to ${fmtDate(end)}, ${own?.observations.toLocaleString() ?? "—"} returns).` : "";

  const rows: { key: keyof RiskRatios; label: string; pct?: boolean }[] = [
    { key: "sharpe", label: "Sharpe ratio" },
    { key: "sortino", label: "Sortino ratio" },
    { key: "calmar", label: "Calmar ratio" },
    { key: "cagr", label: "CAGR", pct: true },
    { key: "volatility", label: "Annualized volatility", pct: true },
    { key: "downsideDeviation", label: "Downside deviation", pct: true },
    { key: "maxDrawdown", label: "Max drawdown (abs)", pct: true },
    { key: "observations", label: "Daily returns used" },
  ];
  const show = (r: RiskRatios | null, k: keyof RiskRatios, pct?: boolean) => {
    if (!r) return "\u2014";
    const v = r[k];
    if (k === "observations") return v === null ? "\u2014" : Number(v).toLocaleString();
    return pct ? fmtPlainPct(v) : fmtNum(v);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="text-xs text-muted-foreground">
          <span className="block font-semibold uppercase tracking-widest">Annual risk-free / MAR (%)</span>
          <input value={rfText} onChange={(e) => setRfText(e.target.value)} inputMode="decimal" className="mt-1 h-9 w-28 rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground" data-testid="input-risk-rf" />
        </label>
        <p className="max-w-md text-xs text-muted-foreground">Your assumption, applied to Sharpe and Sortino. Default 0%. This is not a live Treasury rate; enter a yield you consider appropriate.</p>
        {!rfValid && <p className="text-xs text-destructive" data-testid="status-risk-rf-invalid">Enter a number between -100 and 100. No ratios are shown until the rate is valid.</p>}
      </div>
      {!own || rf === null ? (
        <Notice tone="warn" testId="status-risk-ratios-unavailable">Ratios unavailable: no valid risk-free / MAR rate entered.</Notice>
      ) : (<>
      {own.observations < 252 && <Notice tone="warn" testId="status-risk-ratios-short">Only {own.observations} daily returns in range (under one year). Ratios are highly unreliable.</Notice>}
      <PanelCard title="Risk adjusted returns" subtitle={`${symbol} vs SPY (S&P 500 ETF proxy) over the same selected dates, rf ${fmtPlainPct(rf, 2)}.`} testId="table-risk-ratios">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2">Metric</th><th className="text-right">{symbol}</th><th className="text-right">SPY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className={`border-b border-border/60 ${i < 3 ? "text-base font-semibold" : "text-xs text-muted-foreground"}`}>
                  <td className="py-2">{r.label}</td>
                  <td className="text-right font-mono text-foreground" data-testid={`text-risk-${r.key}`}>{show(own, r.key, r.pct)}</td>
                  <td className="text-right font-mono" data-testid={`text-risk-spy-${r.key}`}>{show(spy, r.key, r.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground" data-testid="text-risk-spy-coverage">{spyNote}{!spy ? ` ${symbol} figures are unaffected.` : ""}</p>
        <p className="mt-3 text-[11px] text-muted-foreground">A dash means the ratio is undefined (zero deviation, no drawdown or too few returns), never infinity. SPY is shown only when its history covers the selected range within 7 days.</p>
      </PanelCard>
      </>)}
    </div>
  );
}
