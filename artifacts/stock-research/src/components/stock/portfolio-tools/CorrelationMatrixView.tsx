import { useMemo, useState } from "react";
import { portfolioCorrelationMatrix } from "@/lib/portfolio-tools-calculations";
import type { CorrelationCell, HoldingHistory, PortfolioHolding } from "@/lib/portfolio-tools-calculations";
import { Methodology, Notice, PanelCard, fmtDate } from "@/components/stock/performance/perf-shared";

const NEG = [0x26, 0x72, 0xa6], MID = [0xff, 0xff, 0xff], POS = [0xe9, 0x9f, 0x2e];
function cellColor(c: number): string {
  const t = Math.min(1, Math.abs(c)), to = c < 0 ? NEG : POS;
  const rgb = MID.map((m, i) => Math.round(m + (to[i] - m) * t));
  return `rgb(${rgb.join(",")})`;
}
function describe(c: CorrelationCell): string {
  const pair = `${c.a} vs ${c.b}`;
  if (c.correlation === null) return `${pair}: unavailable. ${c.reason ?? ""}`;
  return `${pair}: ${c.correlation.toFixed(2)}, N=${c.observations} daily returns, ${c.start ? fmtDate(c.start) : "?"} to ${c.end ? fmtDate(c.end) : "?"}`;
}

export default function CorrelationMatrixView({ holdings, histories, start, end }: { holdings: PortfolioHolding[]; histories: HoldingHistory[]; start: string; end: string }) {
  const cells = useMemo(() => portfolioCorrelationMatrix(holdings, histories, start, end), [holdings, histories, start, end]);
  const n = holdings.length;
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? cells.find((c) => `${c.a}|${c.b}` === activeId) ?? null : null;
  const off = cells.filter((c) => c.a !== c.b && c.correlation !== null);
  const counts = off.map((c) => c.observations);
  const minN = counts.length ? Math.min(...counts) : 0, maxN = counts.length ? Math.max(...counts) : 0;
  const currencies = [...new Set(histories.map((h) => h.currency ?? "unknown"))];

  return (
    <PanelCard title="Correlation Matrix" testId="panel-portfolio-correlation" subtitle={<>Daily return correlation, requested range {fmtDate(start)} to {fmtDate(end)}. Weights are ignored.</>}>
      <div className="overflow-x-auto">
        <div className="grid gap-1" style={{ gridTemplateColumns: `minmax(3.5rem,auto) repeat(${n}, minmax(3.25rem,1fr))`, minWidth: `${4 + n * 3.5}rem` }} role="table" aria-label="Correlation matrix">
          <span />
          {cells.slice(0, n).map((c) => <span key={`h-${c.b}`} className="truncate text-center font-mono text-[11px] font-semibold text-muted-foreground" role="columnheader">{c.b}</span>)}
          {Array.from({ length: n }, (_, r) => (
            <div key={`r-${r}`} className="contents" role="row">
              <span className="self-center truncate pr-1 text-right font-mono text-[11px] font-semibold text-muted-foreground" role="rowheader">{cells[r * n].a}</span>
              {cells.slice(r * n, r * n + n).map((c) => {
                const v = c.correlation;
                return (
                  <button key={`${c.a}-${c.b}`} type="button" title={describe(c)} aria-label={describe(c)}
                    onMouseEnter={() => setActiveId(`${c.a}|${c.b}`)} onFocus={() => setActiveId(`${c.a}|${c.b}`)}
                    className="aspect-square min-h-[3rem] rounded-sm font-mono text-xs font-semibold outline-none ring-offset-1 transition-transform hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-foreground"
                    style={{ backgroundColor: v === null ? "hsl(var(--muted))" : cellColor(v), color: v === null ? "hsl(var(--foreground))" : v < -0.6 ? "#FFFFFF" : "#16231D" }}
                    data-testid={`cell-corr-${c.a}-${c.b}`}>
                    {v === null ? "\u2014" : v.toFixed(2)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground" data-testid="legend-correlation">
        <span className="inline-flex flex-col">
          <span className="h-3 w-48 rounded-sm border border-border" style={{ background: "linear-gradient(90deg, #2672A6, #FFFFFF, #E99F2E)" }} />
          <span className="mt-0.5 flex w-48 justify-between font-mono"><span>-1</span><span>0</span><span>+1</span></span>
        </span>
        <span className="ml-2 inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-muted" /> unavailable</span>
        <span>Blue: tend to move opposite. Orange: tend to move together. Color shows co-movement, not gain or loss.</span>
      </div>
      <p className="mt-3 min-h-[2.5rem] rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs" aria-live="polite" data-testid="text-corr-active">{active ? describe(active) : "Hover or focus a cell for its pair, sample size and dates."}</p>
      {counts.length > 0 && minN !== maxN && <div className="mt-3"><Notice>Pairwise samples differ: off-diagonal cells use {minN.toLocaleString()} to {maxN.toLocaleString()} matched daily returns. Each cell is computed only from days both holdings traded.</Notice></div>}
      {counts.some((c) => c < 252) && <div className="mt-3"><Notice tone="warn">Some pairs have fewer than 252 matched daily returns (about one year). Short samples produce unstable correlations.</Notice></div>}
      {(currencies.length > 1 || currencies[0] !== "USD") && <div className="mt-3"><Notice>Listing currencies: {currencies.join(", ")}. Returns are in each listing currency with no FX conversion, so cross-currency pairs include no currency effect.</Notice></div>}
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <p className="rounded-md bg-muted/40 p-3 text-muted-foreground"><span className="font-semibold text-foreground">Interpretation.</span> +1 means daily returns moved in perfect lockstep, 0 means no linear relationship, -1 means they moved exactly opposite. Holdings with high correlation add little diversification to each other.</p>
        <p className="rounded-md bg-muted/40 p-3 text-muted-foreground"><span className="font-semibold text-foreground">Caution.</span> Correlation is not guaranteed to persist and often rises toward 1 during market stress. Low correlation does not mean low risk, and a portfolio of highly correlated holdings is not diversified however many tickers it holds.</p>
      </div>
      <Methodology>
        <p>For each pair, daily simple returns are computed from adjusted closes, and only days where both holdings have a return over the same two sessions are matched (pairwise complete).</p>
        <p>Correlation = covariance of matched returns / (standard deviation A x standard deviation B), the Pearson coefficient.</p>
        <p>A pair is shown only if both holdings have history within 7 days of the requested start and end, so a recent listing shows as unavailable rather than silently using a shorter window. If returns have zero variance (including the diagonal of a flat series), the cell shows a dash, not zero.</p>
      </Methodology>
    </PanelCard>
  );
}
