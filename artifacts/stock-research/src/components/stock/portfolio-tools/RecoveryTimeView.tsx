import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { portfolioRecovery } from "@/lib/portfolio-stress-calculations";
import type { PortfolioResult } from "@/lib/portfolio-tools-calculations";
import { Methodology, Notice, PanelCard, SegButtons, axisProps, fmtDate, tooltipStyle } from "@/components/stock/performance/perf-shared";
import { StatTile, fmtPlainPct, toTs, tsDate, tsYear } from "@/components/stock/risk/risk-shared";
import { REBALANCE_LABELS } from "./portfolio-shared";
import type { Submission } from "./portfolio-shared";

const MAX_POINTS = 1500;
const days = (n: number) => `${n.toLocaleString()} d`;

export default function RecoveryTimeView({ result, sub }: { result: PortfolioResult; sub: Submission }) {
  const [threshold, setThreshold] = useState(10);
  const rec = useMemo(() => portfolioRecovery(result.prices, threshold / 100), [result.prices, threshold]);
  const { points, step } = useMemo(() => {
    const p = rec.analysis.points;
    const k = Math.max(1, Math.ceil(p.length / MAX_POINTS));
    const anchors = new Set(rec.analysis.episodes.flatMap((e) => [e.peak, e.trough, e.recovery].filter((d): d is string => d !== null)));
    return {
      points: p.filter((x, i) => i % k === 0 || i === p.length - 1 || anchors.has(x.date)).map((x) => ({ t: toTs(x.date), v: x.drawdown * 100 })),
      step: k,
    };
  }, [rec]);
  const unrecovered = rec.episodes.filter((e) => !e.recovery).length;
  const deepest = Math.abs(rec.analysis.maxDrawdown);

  return (
    <PanelCard title="Recovery Time" testId="panel-portfolio-recovery"
      subtitle={<>Combined portfolio, {fmtDate(result.start)} to {fmtDate(result.end)}, rebalancing: {REBALANCE_LABELS[sub.rebalance]}</>}
      actions={<SegButtons options={[5, 10, 20].map((n) => ({ value: n, label: `${n}%` }))} value={threshold} onChange={(v) => setThreshold(Number(v))} label="Major drawdown threshold" testPrefix="button-recovery-threshold" />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={`Drawdowns of ${threshold}%+`} value={String(rec.episodes.length)} testId="text-recovery-count" />
        <StatTile label="Still underwater" value={String(unrecovered)} tone={unrecovered ? "text-destructive" : undefined} testId="text-recovery-open" />
        <StatTile label="Deepest decline" value={`-${fmtPlainPct(deepest, 1)}`} tone="text-destructive" testId="text-recovery-deepest" />
        <StatTile label="As of" value={rec.asOf ? fmtDate(rec.asOf) : "\u2014"} testId="text-recovery-asof" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Results depend on the selected range: the first selected close is treated as the starting high, so any earlier peak is unknown, and closes after the selected end are not used. Change the dates above to test another period.</p>

      <div className="mt-4 h-[260px] w-full" data-testid="chart-recovery-underwater">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tsYear} {...axisProps} minTickGap={40} />
            <YAxis type="number" domain={["auto", 0]} tickFormatter={(v: number) => `${Math.round(v)}%`} width={52} {...axisProps} />
            <Tooltip {...tooltipStyle} labelFormatter={(v) => tsDate(Number(v))} formatter={(v) => [`${Number(v).toFixed(2)}%`, "Below prior high"]} />
            <Area type="linear" dataKey="v" stroke="hsl(var(--destructive))" strokeWidth={1.5} fill="hsl(var(--destructive))" fillOpacity={0.15} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Underwater path: percent below the highest portfolio value reached so far within the selected range.</p>
      {step > 1 && <p className="mt-1 text-[11px] text-muted-foreground">Chart samples every {step} sessions and retains episode peaks, troughs and recovery dates. Calculations and the table use every common session.</p>}
      {result.omittedSessions > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{result.omittedSessions.toLocaleString()} sessions where not every holding traded were excluded; no prices were filled in.</p>}

      {rec.episodes.length === 0 ? (
        <div className="mt-4"><Notice testId="status-recovery-empty">No drawdown of {threshold}% or more occurred in this range. The deepest decline was -{fmtPlainPct(deepest, 1)}. Try a lower threshold or a longer range.</Notice></div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm" data-testid="table-recovery-episodes">
            <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="py-2">Peak</th><th>Trough</th><th className="text-right">Depth</th><th className="text-right">Decline</th><th>Recovered</th><th className="text-right">Trough to recovery</th><th className="text-right">Peak to recovery</th>
            </tr></thead>
            <tbody>
              {rec.episodes.map((e, i) => (
                <tr key={e.peak} className="border-b border-border/60 font-mono text-xs" data-testid={`row-recovery-episode-${i}`}>
                  <td className="py-2">{fmtDate(e.peak)}</td>
                  <td>{fmtDate(e.trough)}</td>
                  <td className="text-right text-destructive">-{fmtPlainPct(Math.abs(e.loss), 1)}</td>
                  <td className="text-right">{days(e.declineDays)}</td>
                  <td>{e.recovery ? fmtDate(e.recovery) : <span className="font-sans font-semibold text-destructive">Still underwater</span>}</td>
                  <td className="text-right">{e.recoveryDays !== null && e.recovery ? days(e.recoveryDays) : "\u2014"}</td>
                  <td className="text-right">{e.recovery ? days(e.underwaterDays) : <span className="text-muted-foreground">{days(e.underwaterDays)} elapsed as of {rec.asOf ? fmtDate(rec.asOf) : "last close"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Methodology>
        A major drawdown is a non-overlapping decline from a running high of at least the selected threshold. Recovery is the first close at or above the old high. Decline counts calendar days from peak to trough; trough to recovery and peak to recovery are separate calendar-day measures. Unrecovered episodes show elapsed time to the last selected close, not a recovery. The path is the weighted portfolio value with your rebalancing rule, not an average of individual holdings. Past recoveries do not promise future ones.
      </Methodology>
    </PanelCard>
  );
}
