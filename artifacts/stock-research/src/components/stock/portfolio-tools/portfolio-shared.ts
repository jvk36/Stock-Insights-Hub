import type { PortfolioHolding, RebalanceRule } from "@/lib/portfolio-tools-calculations";

export const PORTFOLIO_VIEWS = ["analyzer", "correlation", "backtester", "crisis", "recovery"] as const;
export type PortfolioView = (typeof PORTFOLIO_VIEWS)[number];
export function parsePortfolioView(v: string | null): PortfolioView {
  return (PORTFOLIO_VIEWS as readonly string[]).includes(v ?? "") ? (v as PortfolioView) : "analyzer";
}
export const PORTFOLIO_LABELS: Record<PortfolioView, string> = {
  analyzer: "Portfolio Analyzer",
  correlation: "Correlation Matrix",
  backtester: "Portfolio Backtester",
  crisis: "Crisis Simulator",
  recovery: "Recovery Time",
};
export const REBALANCE_LABELS: Record<RebalanceRule, string> = {
  none: "None (buy and hold)",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export interface Submission {
  holdings: PortfolioHolding[];
  weighted: boolean;
  initialValue: number;
  annualRiskFree: number;
  rebalance: RebalanceRule;
}

export function fmtWeight(w: number): string {
  return Number.isFinite(w) ? `${Number(w.toFixed(4))}%` : "n/a";
}
