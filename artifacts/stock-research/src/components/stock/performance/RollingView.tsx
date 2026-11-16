import { useMemo, useState } from "react";
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";
import type { PricePoint } from "@/lib/performance-calculations";
import { formatPct, rollingReturns } from "@/lib/performance-calculations";
import { Methodology, Notice, PanelCard, SERIES_COLORS, axisProps, fmtDate, fmtYearTick, pctTick, signClass, tooltipStyle } from "./perf-shared";

const WINDOWS = [1, 3, 5, 10] as const;

export default function RollingView({ symbol, prices }: { symbol: string; prices: PricePoint[] }) {
  const [shown, setShown] = useState<Record<number, boolean>>({ 1: true, 3: true, 5: true, 10: true });
  const { data, stats } = useMemo(() => {
    const series = WINDOWS.map((w) => rollingReturns(prices, w));
    const data = series[0].map((p, i) => {
      const row: Record<string, string | number | null> = { date: p.date };
      WINDOWS.forEach((w, k) => { row[`y${w}`] = series[k][i].value; });
      return row;
    });
    const stats = WINDOWS.map((w, k) => {
      const vals = series[k].map((p) => p.value).filter((v): v is number => v !== null);
      if (!vals.length) return { w, n: 0, min: null, max: null, median: null, latest: null, pos: null };
      const sorted = [...vals].sort((a, b) => a - b);
      return { w, n: vals.length, min: sorted[0], max: sorted[sorted.length - 1], median: sorted[Math.floor(sorted.length / 2)], latest: vals[vals.length - 1], pos: vals.filter((v) => v > 0).length / vals.length };
    });
    return { data, stats };
  }, [prices]);
  const anyVisible = stats.some((s) => s.n > 0 && shown[s.w]);

  return (
    <PanelCard title="Rolling annualized returns" testId="panel-rolling" subtitle={<>Evaluated at each month end through {fmtDate(prices[prices.length - 1].date)}</>}
      actions={
        <div role="group" aria-label="Rolling windows" className="flex flex-wrap gap-1">
          {WINDOWS.map((w, k) => (
            <button key={w} type="button" aria-pressed={shown[w]} disabled={stats[k].n === 0} onClick={() => setShown((s) => ({ ...s, [w]: !s[w] }))} data-testid={`button-rolling-${w}`}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 font-mono text-xs disabled:opacity-40 ${shown[w] ? "border-foreground/30 bg-background text-foreground" : "border-border text-muted-foreground"}`}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: shown[w] ? SERIES_COLORS[k] : "transparent", border: `1px solid ${SERIES_COLORS[k]}` }} />{w}Y
            </button>
          ))}
        </div>
      }>
      {!anyVisible ? (
        <Notice testId="status-rolling-empty">No rolling window is selected or has enough history. Each N-year window needs at least N years of sessions.</Notice>
      ) : (
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="date" tickFormatter={fmtYearTick} minTickGap={40} {...axisProps} />
              <YAxis orientation="right" width={52} tickFormatter={pctTick} domain={["auto", "auto"]} {...axisProps} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <Tooltip {...tooltipStyle} labelFormatter={(l) => `Window ending ${fmtDate(String(l))}`} formatter={(v: number, n: string) => [formatPct(v, 2), `${n.slice(1)}Y annualized`]} />
              <Legend verticalAlign="top" align="left" iconType="line" wrapperStyle={{ fontSize: 11, fontFamily: "monospace", paddingBottom: 6 }} formatter={(v: string) => `${symbol} ${v.slice(1)}Y rolling`} />
              {WINDOWS.map((w, k) => shown[w] && stats[k].n > 0 && (
                <Line key={w} type="monotone" dataKey={`y${w}`} stroke={SERIES_COLORS[k]} strokeWidth={w === 1 ? 1.25 : 2} dot={false} isAnimationActive={false} connectNulls={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 font-medium">Window</th><th className="py-2 text-right font-medium">Latest</th><th className="py-2 text-right font-medium">Median</th><th className="py-2 text-right font-medium">Worst</th><th className="py-2 text-right font-medium">Best</th><th className="py-2 text-right font-medium">% positive</th>
          </tr></thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.w} className="border-b border-border/60 font-mono" data-testid={`row-rolling-${s.w}`}>
                <td className="py-2">{s.w}Y</td>
                {s.n === 0 ? <td colSpan={5} className="py-2 text-right text-xs text-muted-foreground">Unavailable: less than {s.w} years of history</td> : (<>
                  <td className={`py-2 text-right ${signClass(s.latest)}`}>{formatPct(s.latest)}</td>
                  <td className={`py-2 text-right ${signClass(s.median)}`}>{formatPct(s.median)}</td>
                  <td className={`py-2 text-right ${signClass(s.min)}`}>{formatPct(s.min)}</td>
                  <td className={`py-2 text-right ${signClass(s.max)}`}>{formatPct(s.max)}</td>
                  <td className="py-2 text-right">{s.pos === null ? "\u2014" : `${(s.pos * 100).toFixed(1)}%`}</td>
                </>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Methodology>
        <p>At each month end, the window starts at the first session on or after exactly N calendar years earlier. Annualized using calendar days / 365.2425 on adjusted closes.</p>
        <p>The first N years of history have no value for an N-year window; nothing is extrapolated. Each line is independent.</p>
      </Methodology>
    </PanelCard>
  );
}
