import { Plus, Trash2 } from "lucide-react";
import type { RebalanceRule } from "@/lib/portfolio-tools-calculations";
import { REBALANCE_LABELS } from "./portfolio-shared";

export interface Row { id: number; symbol: string; weight: string }

const inputCls = "h-9 w-full rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground";
const labelCls = "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground";
const EXAMPLES = ["SPY", "QQQ", "TLT", "GLD", "VXUS"];

export default function HoldingsEditor({ rows, onRows, weighted, initial, onInitial, rf, onRf, rebalance, onRebalance, onSubmit, submitLabel, errors }: {
  rows: Row[]; onRows: (r: Row[]) => void; weighted: boolean;
  initial: string; onInitial: (v: string) => void; rf: string; onRf: (v: string) => void;
  rebalance: RebalanceRule; onRebalance: (r: RebalanceRule) => void;
  onSubmit: () => void; submitLabel: string; errors: string[];
}) {
  const total = rows.reduce((s, r) => s + (r.weight.trim() === "" ? 0 : Number(r.weight)), 0);
  const nextId = () => Math.max(0, ...rows.map((r) => r.id)) + 1;
  const update = (id: number, patch: Partial<Row>) => onRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = (symbol = "") => { if (rows.length < 20) onRows([...rows, { id: nextId(), symbol, weight: "" }]); };
  const used = new Set(rows.map((r) => r.symbol.trim().toUpperCase()));
  const addExample = (s: string) => {
    const blank = rows.find((r) => !r.symbol.trim());
    if (blank) update(blank.id, { symbol: s }); else add(s);
  };

  return (
    <form className="rounded-xl border border-border bg-card p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); onSubmit(); }} data-testid="form-portfolio-holdings">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Holdings</h3>
        <p className="text-[11px] text-muted-foreground">Temporary inputs: not saved, and cleared when you leave this page.</p>
      </div>
      <div className="mt-3 space-y-2">
        <div className={`grid gap-2 ${weighted ? "grid-cols-[2rem_minmax(0,1fr)_7rem_2.25rem]" : "grid-cols-[2rem_minmax(0,1fr)_2.25rem]"}`}>
          <span />
          <span className={labelCls}>Ticker</span>
          {weighted && <span className={labelCls}>Weight %</span>}
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={r.id} className={`grid items-center gap-2 ${weighted ? "grid-cols-[2rem_minmax(0,1fr)_7rem_2.25rem]" : "grid-cols-[2rem_minmax(0,1fr)_2.25rem]"}`}>
            <span className="text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
            <input aria-label={`Ticker ${i + 1}`} value={r.symbol} placeholder="e.g. MSFT" onChange={(e) => update(r.id, { symbol: e.target.value.toUpperCase() })} className={inputCls} data-testid={`input-portfolio-symbol-${i}`} />
            {weighted && (
              <input aria-label={`Weight ${i + 1} percent`} inputMode="decimal" value={r.weight} placeholder="0" onChange={(e) => update(r.id, { weight: e.target.value })} className={`${inputCls} text-right`} data-testid={`input-portfolio-weight-${i}`} />
            )}
            <button type="button" aria-label={`Remove row ${i + 1}`} disabled={rows.length <= 2} onClick={() => onRows(rows.filter((x) => x.id !== r.id))} className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30" data-testid={`button-portfolio-remove-${i}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => add()} disabled={rows.length >= 20} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-40" data-testid="button-portfolio-add">
          <Plus className="h-3.5 w-3.5" /> Add holding
        </button>
        <span className="font-mono text-[11px] text-muted-foreground">{rows.length}/20 rows</span>
        {weighted && (
          <span className={`ml-auto font-mono text-xs ${Math.abs(total - 100) < 1e-6 ? "text-success" : "text-amber-700 dark:text-amber-300"}`} data-testid="text-portfolio-weight-total">
            Total {Number.isFinite(total) ? Number(total.toFixed(4)) : "invalid"}% of 100%
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        Suggestions (added as blank rows, not analyzed):
        {EXAMPLES.filter((s) => !used.has(s)).map((s) => (
          <button key={s} type="button" onClick={() => addExample(s)} className="rounded border border-dashed border-border px-1.5 py-0.5 font-mono hover:border-primary hover:text-primary" data-testid={`button-portfolio-example-${s}`}>{s}</button>
        ))}
      </div>

      {weighted ? (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <label className={labelCls}>Initial investment (USD)
            <input inputMode="decimal" value={initial} onChange={(e) => onInitial(e.target.value)} className={`${inputCls} mt-1`} data-testid="input-portfolio-initial" />
          </label>
          <label className={labelCls}>Annual risk-free rate %
            <input inputMode="decimal" value={rf} onChange={(e) => onRf(e.target.value)} className={`${inputCls} mt-1`} data-testid="input-portfolio-rf" />
          </label>
          <label className={labelCls}>Rebalancing
            <select value={rebalance} onChange={(e) => onRebalance(e.target.value as RebalanceRule)} className={`${inputCls} mt-1`} data-testid="select-portfolio-rebalance">
              {(Object.keys(REBALANCE_LABELS) as RebalanceRule[]).map((k) => <option key={k} value={k}>{REBALANCE_LABELS[k]}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground sm:col-span-3">Long-only and fully invested: weights must be 0% to 100% and total exactly 100%. No leverage, shorting, fees, taxes, slippage or contributions. Weights are never normalized for you.</p>
        </div>
      ) : (
        <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">Correlation ignores weights entirely, so the weight column is hidden here. Weights you entered on the other tabs are kept but not checked.</p>
      )}

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-testid="list-portfolio-errors">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <button type="submit" className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90" data-testid="button-portfolio-submit">{submitLabel}</button>
    </form>
  );
}
