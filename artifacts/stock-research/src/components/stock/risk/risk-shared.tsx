import { useGetTickerPerformance, getGetTickerPerformanceQueryKey } from "@workspace/api-client-react";
import type { TickerPerformance } from "@workspace/api-client-react";
import type { PricePoint } from "@/lib/performance-calculations";

export const RISK_VIEWS = ["drawdown", "volatility", "ratios", "correlation"] as const;
export type RiskView = (typeof RISK_VIEWS)[number];
export function parseRiskView(v: string | null): RiskView {
  return (RISK_VIEWS as readonly string[]).includes(v ?? "") ? (v as RiskView) : "drawdown";
}
export const RISK_LABELS: Record<RiskView, string> = {
  drawdown: "Historical Drawdown Analyzer",
  volatility: "Volatility",
  ratios: "Risk Adjusted Returns",
  correlation: "Beta & Correlation",
};

export function sliceRange(prices: PricePoint[], start: string, end: string): PricePoint[] {
  return prices.filter((p) => p.date >= start && p.date <= end);
}

export function toTs(d: string): number { return Date.parse(d + "T00:00:00Z"); }
export function tsYear(v: number): string { return String(new Date(v).getUTCFullYear()); }
export function tsDate(v: number): string {
  return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "\u2014";
  return v.toFixed(digits);
}
export function fmtPlainPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "\u2014";
  return `${(v * 100).toFixed(digits)}%`;
}

/** Fetch a comparison series via the shared Performance endpoint, reusing the cached SPY benchmark when possible. */
export function useComparisonSeries(symbol: string, primary: TickerPerformance | undefined) {
  const reuse = symbol === "SPY" && !!primary?.benchmark?.prices.length;
  const sameAsPrimary = !!primary && symbol === primary.stock.symbol;
  const q = useGetTickerPerformance(symbol, {
    query: { enabled: !!symbol && !reuse && !sameAsPrimary, queryKey: getGetTickerPerformanceQueryKey(symbol), staleTime: 600000, retry: 1 },
  });
  if (reuse) return { prices: primary!.benchmark!.prices, loading: false, error: false, refetch: () => {}, fetching: false, reused: true };
  if (sameAsPrimary) return { prices: primary!.stock.prices, loading: false, error: false, refetch: () => {}, fetching: false, reused: true };
  return {
    prices: q.data?.stock.prices ?? null,
    loading: q.isLoading,
    error: q.isError,
    refetch: () => { q.refetch(); },
    fetching: q.isFetching,
    reused: false,
  };
}

export function StatTile({ label, value, sub, testId, tone }: { label: string; value: string; sub?: string; testId: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold ${tone ?? ""}`} data-testid={testId}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
