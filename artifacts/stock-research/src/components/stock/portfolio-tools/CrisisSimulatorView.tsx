import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { simulateCrises } from "@/lib/portfolio-stress-calculations";
import type { HoldingHistory } from "@/lib/portfolio-tools-calculations";
import { Methodology, Notice, PanelCard, axisProps, fmtDate, fmtMoney, signClass, tooltipStyle } from "@/components/stock/performance/perf-shared";
import { fmtPlainPct, toTs, tsDate } from "@/components/stock/risk/risk-shared";
import { REBALANCE_LABELS } from "./portfolio-shared";
import type { Submission } from "./portfolio-shared";

export default function CrisisSimulatorView({ sub, histories }: { sub: Submission; histories: HoldingHistory[] }) {
  const scenarios = useMemo(
    () => simulateCrises(sub.holdings, histories, { initialValue: sub.initialValue, annualRiskFree: sub.annualRiskFree, rebalance: sub.rebalance }),
    [sub, histories],
  );
  const firstOk = scenarios.find((s) => s.outcome.ok)?.window.id ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const selectedId = picked && scenarios.some((s) => s.window.id === picked && s.outcome.ok) ? picked : firstOk;
  const selected = scenarios.find((s) => s.window.id === selectedId);
  const points = useMemo(() => {
    if (!selected || !selected.outcome.ok) return [];
    return selected.outcome.prices.map((p) => ({ t: toTs(p.date), v: p.adjustedClose }));
  }, [selected]);

  return (
    <PanelCard title="Crisis Simulator" testId="panel-portfolio-crisis" subtitle={<>Each crisis starts fresh with {fmtMoney(sub.initialValue, "USD")} at your target weights on the first common close. Rebalancing: {REBALANCE_LABELS[sub.rebalance]}.</>}>
      <p className="text-xs text-muted-foreground">These windows ignore the general date range. A holding without history for a window makes only that window unavailable; nothing is clipped to the shortest history and no proxy is substituted for a younger ticker.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {scenarios.map((s) => {
          const o = s.outcome;
          const active = s.window.id === selectedId;
          const dd = o.ok ? o.stats.maxDrawdown : null;
          return (
            <button key={s.window.id} type="button" disabled={!o.ok} onClick={() => setPicked(s.window.id)}
              className={`rounded-lg border p-4 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50"} disabled:cursor-default disabled:hover:bg-card`}
              data-testid={`card-crisis-${s.window.id}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{s.window.name}</p>
                {o.ok ? <span className={`font-mono text-lg font-bold ${signClass(s.totalReturn)}`} data-testid={`text-crisis-return-${s.window.id}`}>{fmtPlainPct(s.totalReturn, 1)}</span>
                  : <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">Unavailable</span>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{s.window.description}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">Requested {fmtDate(s.window.start)} to {fmtDate(s.window.end)}</p>
              {o.ok ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
                  <dt className="text-muted-foreground">Actual</dt><dd className="text-right">{fmtDate(o.start)} to {fmtDate(o.end)}</dd>
                  <dt className="text-muted-foreground">Initial</dt><dd className="text-right">{fmtMoney(o.prices[0].adjustedClose, "USD")}</dd>
                  <dt className="text-muted-foreground">End value</dt><dd className={`text-right ${signClass(s.totalReturn)}`} data-testid={`text-crisis-end-${s.window.id}`}>{fmtMoney(o.prices[o.prices.length - 1].adjustedClose, "USD")}</dd>
                  <dt className="text-muted-foreground">Max drawdown</dt><dd className="text-right text-destructive" data-testid={`text-crisis-maxdd-${s.window.id}`}>{dd === null ? "\u2014" : `-${fmtPlainPct(dd, 1)}`}</dd>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300" data-testid={`text-crisis-reason-${s.window.id}`}>{o.reason}</p>
              )}
              {o.ok && o.omittedSessions > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{o.omittedSessions} sessions where not every holding traded were excluded.</p>}
            </button>
          );
        })}
      </div>

      {selected && selected.outcome.ok ? (
        <div className="mt-5">
          <p className="text-sm font-semibold" data-testid="text-crisis-selected">{selected.window.name}: portfolio value</p>
          <div className="mt-2 h-[300px] w-full" data-testid="chart-crisis-path">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pfCrisis" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => tsDate(v)} {...axisProps} minTickGap={60} />
                <YAxis type="number" domain={[0, "auto"]} tickFormatter={(v: number) => `$${Math.round(v).toLocaleString("en-US")}`} width={78} {...axisProps} />
                <Tooltip {...tooltipStyle} labelFormatter={(v) => tsDate(Number(v))} formatter={(v) => [fmtMoney(Number(v), "USD"), "Portfolio value"]} />
                <Area type="linear" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={1.75} fill="url(#pfCrisis)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Select another available crisis card to chart it. Value axis starts at $0.</p>
        </div>
      ) : (
        <div className="mt-5"><Notice tone="warn" testId="status-crisis-none">None of the four crises can be simulated with these holdings. Review each card’s reason, including historical coverage and USD-listing requirements. No holding is removed or replaced for you.</Notice></div>
      )}

      <Methodology>
        Each window is simulated independently with the same initial amount and target weights. All positive-weight holdings must have prices on both fixed US-market boundary sessions; even a slightly younger listing cannot shorten the window. Calendar-year scenarios start at the preceding year-end close; 2022 ends at the December 30 close because December 31 was a Saturday. The 2008 card covers calendar 2008 only, not the full 2007 to 2009 decline from the October 2007 peak to the March 2009 trough. Rebalancing resets weights at the first common close of each new selected calendar period, after marking existing positions. Adjusted closes assume dividends reinvested; only confirmed USD listings are supported, with no FX conversion. Taxes, fees and trading costs are ignored. A past crisis does not predict the next one.
      </Methodology>
    </PanelCard>
  );
}
