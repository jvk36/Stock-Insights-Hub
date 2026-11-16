import type { ReactNode } from "react";

export const SERIES_COLORS = ["hsl(var(--primary))", "#d97706", "#0e7490", "#be123c"];

export const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(var(--popover))",
    borderColor: "hsl(var(--border))",
    color: "hsl(var(--foreground))",
    fontSize: "12px",
    fontFamily: "monospace",
    borderRadius: "6px",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: "6px", fontFamily: "monospace" },
};

export const axisProps = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 11,
  axisLine: false,
  tickLine: false,
} as const;

export function fmtDate(d: string): string {
  const t = Date.parse(d + "T00:00:00Z");
  if (!Number.isFinite(t)) return d;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function fmtYearTick(d: string): string {
  return d.slice(0, 4);
}

export function pctTick(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

export function fmtMoney(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "\u2014";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;
}

export function PanelCard({ title, subtitle, actions, children, testId }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5" data-testid={testId}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
          {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function SegButtons<T extends string | number>({ options, value, onChange, label, testPrefix }: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  testPrefix: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          data-testid={`${testPrefix}-${o.value}`}
          className={`h-7 rounded px-2.5 font-mono text-xs transition-colors disabled:opacity-40 ${value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Methodology({ children }: { children: ReactNode }) {
  return (
    <details className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground" data-testid="details-methodology">
      <summary className="cursor-pointer font-semibold text-foreground">Methodology</summary>
      <div className="mt-2 space-y-1.5 leading-relaxed">{children}</div>
    </details>
  );
}

export function Notice({ children, tone = "muted", testId }: { children: ReactNode; tone?: "muted" | "warn"; testId?: string }) {
  return (
    <p data-testid={testId} className={`rounded-md border px-3 py-2 text-xs ${tone === "warn" ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" : "border-border bg-muted/40 text-muted-foreground"}`}>
      {children}
    </p>
  );
}

export function signClass(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "text-muted-foreground";
  return v >= 0 ? "text-success" : "text-destructive";
}
