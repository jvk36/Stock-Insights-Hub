import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { analyzeDrawdowns } from "@/lib/risk-calculations";
import type { PricePoint } from "@/lib/performance-calculations";
import { PanelCard, Notice, axisProps, tooltipStyle, fmtDate, pctTick } from "@/components/stock/performance/perf-shared";
import { StatTile, fmtPlainPct, toTs, tsDate, tsYear } from "./risk-shared";

export default function DrawdownView({ symbol, prices }: { symbol: string; prices: PricePoint[] }) {
  const a = useMemo(() => analyzeDrawdowns(prices), [prices]);
  const pts = useMemo(() => a.points.map((p) => ({ t: toTs(p.date), drawdown: p.drawdown })), [a.points]);
  const top = a.episodes.slice(0, 10);
  const current = a.points.length ? a.points[a.points.length - 1].drawdown : null;
  const open = a.episodes.find((e) => e.recovery === null);
  const destructive = "hsl(var(--destructive))";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Max drawdown" value={fmtPlainPct(a.maxDrawdown)} tone="text-destructive" testId="text-risk-maxdd" />
        <StatTile label="Current drawdown" value={fmtPlainPct(current)} sub={current !== null && current < 0 ? "below range high" : "at range high"} testId="text-risk-currentdd" />
        <StatTile label="Episodes" value={String(a.episodes.length)} sub="peak-to-recovery cycles" testId="text-risk-episodes" />
        <StatTile label="Unrecovered" value={open ? `${open.underwaterDays}d` : "None"} sub={open ? `since ${fmtDate(open.peak)}` : "all recovered"} testId="text-risk-unrecovered" />
      </div>

      <PanelCard title={`${symbol} underwater curve`} subtitle={`All ${a.points.length.toLocaleString()} sessions plotted, no sampling. 0% = at running high within range.`} testId="chart-risk-drawdown">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pts} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={destructive} stopOpacity={0.05} />
                  <stop offset="100%" stopColor={destructive} stopOpacity={0.45} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} {...axisProps} tickFormatter={(v) => tsYear(Number(v))} minTickGap={40} />
              <YAxis {...axisProps} tickFormatter={pctTick} width={48} domain={["dataMin", 0]} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => tsDate(Number(v))} formatter={(v) => [fmtPlainPct(Number(v)), "Drawdown"]} />
              <Area type="linear" dataKey="drawdown" stroke={destructive} strokeWidth={1.2} fill="url(#ddFill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </PanelCard>

      <PanelCard title="Largest peak-to-trough episodes" subtitle={`Top ${top.length} of ${a.episodes.length} episodes in range, ranked by loss. Durations in calendar days.`} testId="table-risk-episodes">
        {top.length === 0 ? (
          <Notice>No decline below a prior high inside this range.</Notice>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-2">#</th><th className="pr-2">Loss</th><th className="pr-2">Peak</th><th className="pr-2">Trough</th>
                  <th className="pr-2">Recovery</th><th className="pr-2 text-right">Decline</th><th className="pr-2 text-right">Recovery</th><th className="text-right">Underwater</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {top.map((e, i) => (
                  <tr key={e.peak} className="border-b border-border/60" data-testid={`row-risk-episode-${i}`}>
                    <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="pr-2 font-semibold text-destructive">{fmtPlainPct(e.loss)}</td>
                    <td className="pr-2">{fmtDate(e.peak)}</td>
                    <td className="pr-2">{fmtDate(e.trough)}</td>
                    <td className="pr-2">{e.recovery ? fmtDate(e.recovery) : <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-800 dark:text-amber-300">Unrecovered</span>}</td>
                    <td className="pr-2 text-right">{e.declineDays}d</td>
                    <td className="pr-2 text-right">{e.recoveryDays === null ? "\u2014" : `${e.recoveryDays}d`}</td>
                    <td className="text-right">{e.underwaterDays}d{e.recovery ? "" : "+"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}
