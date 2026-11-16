import { useMemo, useState } from "react";
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import type { PricePoint } from "@/lib/performance-calculations";
import { cagrPath, formatPct, resolvePeriod, subtractYears, trailingPeriod } from "@/lib/performance-calculations";
import { Methodology, Notice, PanelCard, SERIES_COLORS, axisProps, fmtDate, fmtYearTick, pctTick, signClass, tooltipStyle } from "./perf-shared";

const HORIZONS = [1, 3, 5, 10, 15, 20];

export default function CagrView({ symbol, prices }: { symbol: string; prices: PricePoint[] }) {
  const first = prices[0].date, last = prices[prices.length - 1].date;
  const defaultStart = useMemo(() => {
    const s = subtractYears(last, 10);
    return s < first ? first : s;
  }, [first, last]);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(last);

  const period = useMemo(() => {
    if (end > last) return { ok: false as const, reason: `End date cannot be after the last available session (${last}).` };
    return resolvePeriod(prices, start, end);
  }, [prices, start, end, last]);
  const path = useMemo(() => (period.ok ? cagrPath(prices, period) : []), [prices, period]);
  const hasAnnualized = path.some((p) => p.cagr !== null);
  const trailingEnd = period.ok ? period.end.date : last;
  const horizons = useMemo(() => HORIZONS.map((y) => ({ y, r: trailingPeriod(prices, trailingEnd, y) })), [prices, trailingEnd]);

  return (
    <div className="space-y-4">
      <PanelCard
        title="Compound annual growth rate"
        testId="panel-cagr"
        subtitle={<>History available {fmtDate(first)} to {fmtDate(last)}</>}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">Start
              <input type="date" value={start} min={first} max={last} onChange={(e) => setStart(e.target.value)} data-testid="input-cagr-start" className="mt-1 block h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground" />
            </label>
            <label className="text-xs text-muted-foreground">End
              <input type="date" value={end} min={first} max={last} onChange={(e) => setEnd(e.target.value)} data-testid="input-cagr-end" className="mt-1 block h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground" />
            </label>
          </div>
        }
      >
        {!period.ok ? (
          <Notice tone="warn" testId="status-cagr-invalid">{period.reason}</Notice>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Actual start" value={fmtDate(period.start.date)} />
              <Stat label="Actual end" value={fmtDate(period.end.date)} />
              <Stat label="Total return" value={formatPct(period.totalReturn)} cls={signClass(period.totalReturn)} testId="text-cagr-total" />
              <Stat label={`CAGR (${period.years.toFixed(2)} yrs)`} value={formatPct(period.cagr, 2)} cls={signClass(period.cagr)} testId="text-cagr-value" />
            </div>
            <div className="h-[320px] w-full">
              {hasAnnualized ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={path} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="date" tickFormatter={fmtYearTick} minTickGap={40} {...axisProps} />
                    <YAxis tickFormatter={pctTick} orientation="right" width={52} domain={["auto", "auto"]} {...axisProps} label={{ value: "Annualized %", angle: 90, position: "insideRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                    <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDate(String(l))} formatter={(v: number, n: string) => [formatPct(v, 2), n === "cagr" ? `${symbol} CAGR since ${period.start.date}` : "Cumulative"]} />
                    <Line type="monotone" dataKey="cagr" stroke={SERIES_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-center font-mono text-sm text-muted-foreground">Not enough sessions in range to plot.</div>
              )}
            </div>
            {period.days < 365 && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300" data-testid="text-cagr-short-warning">Selected period is under one year. Annualizing short periods compounds them to a yearly rate and can greatly exaggerate moves.</p>}
          </>
        )}
      </PanelCard>

      <PanelCard title="Investment horizons" subtitle={<>Trailing windows ending {fmtDate(trailingEnd)}</>} testId="panel-cagr-horizons">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Horizon</th><th className="py-2 pr-3 font-medium">Start session</th><th className="py-2 pr-3 text-right font-medium">Total</th><th className="py-2 text-right font-medium">CAGR</th>
            </tr></thead>
            <tbody>
              {horizons.map(({ y, r }) => (
                <tr key={y} className="border-b border-border/60 font-mono" data-testid={`row-horizon-${y}`}>
                  <td className="py-2 pr-3">{y}Y</td>
                  {r.ok ? (<>
                    <td className="py-2 pr-3 text-muted-foreground">{fmtDate(r.start.date)}</td>
                    <td className={`py-2 pr-3 text-right ${signClass(r.totalReturn)}`}>{formatPct(r.totalReturn)}</td>
                    <td className={`py-2 text-right font-semibold ${signClass(r.cagr)}`}>{formatPct(r.cagr, 2)}</td>
                  </>) : (
                    <td colSpan={3} className="py-2 text-right text-xs text-muted-foreground">Horizon unavailable: insufficient history</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Methodology>
          <p>Returns use split- and dividend-adjusted closes, an estimate of total return with dividends reinvested.</p>
          <p>The start is the first trading session on or after the chosen date; the end is the last session on or before it. Actual dates are shown.</p>
          <p>CAGR = (end / start)^(1 / years) - 1, where years = calendar days / 365.2425. The chart plots annualized return since the start at each month end and at the selected end. Early points cover short windows, where annualization can exaggerate moves.</p>
          <p>If no session falls within 7 days of a requested start or end (for example a trading halt), the range is shown as unavailable instead of shifting silently.</p>
          <p>If a requested start predates available history by more than 7 days, the horizon is shown as unavailable instead of using a shorter period.</p>
        </Methodology>
      </PanelCard>
    </div>
  );
}

function Stat({ label, value, cls = "", testId }: { label: string; value: string; cls?: string; testId?: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono text-base font-semibold ${cls}`} data-testid={testId}>{value}</div>
    </div>
  );
}
