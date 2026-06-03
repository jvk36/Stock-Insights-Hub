import {
  useGetStockScreenerRatings,
  getGetStockScreenerRatingsQueryKey,
} from "@workspace/api-client-react";
import type { ScreenerData } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Zap, Shield, Flower2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Rating = "excellent" | "good" | "fair" | "weak" | "na";

interface Driver {
  label: string;
  rawValue: number | null;
  formattedValue: string;
  score: number;
  maxScore: number;
  rating: Rating;
  threshold: string;
}

interface StrategyResult {
  key: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  totalScore: number;
  primary: Driver;
  secondaries: Driver[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY_MAX = 50;
const SEC_MAX = 50 / 3; // ≈16.67

const RATING_STYLES: Record<Rating, string> = {
  excellent: "bg-emerald-500/20 text-emerald-300 border-emerald-400/50",
  good:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  fair:      "bg-amber-500/10 text-amber-400 border-amber-500/30",
  weak:      "bg-rose-500/10 text-rose-400 border-rose-500/30",
  na:        "bg-muted/60 text-muted-foreground border-border",
};

const RATING_LABELS: Record<Rating, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  weak: "Weak",
  na: "N/A",
};

// ── Scoring helpers ───────────────────────────────────────────────────────────

function computeMetric(
  value: number | null | undefined,
  threshold: number,
  excellent: number,
  higherIsBetter: boolean,
  max: number,
  threshold_exclusive = false,
): { score: number; rating: Rating } {
  if (value == null || !isFinite(value)) return { score: 0, rating: "na" };

  let pct: number;
  if (higherIsBetter) {
    if (threshold_exclusive ? value <= threshold : value < threshold) return { score: 0, rating: "weak" };
    pct = Math.min(1, (value - threshold) / (excellent - threshold));
  } else {
    if (threshold_exclusive ? value >= threshold : value > threshold) return { score: 0, rating: "weak" };
    pct = Math.min(1, (threshold - value) / (threshold - excellent));
  }

  const rating: Rating =
    pct >= 0.8 ? "excellent" : pct >= 0.5 ? "good" : pct >= 0.25 ? "fair" : "weak";
  return { score: pct * max, rating };
}

function driver(
  label: string,
  rawValue: number | null | undefined,
  formatted: string,
  threshold: string,
  score: number,
  maxScore: number,
  rating: Rating,
): Driver {
  return { label, rawValue: rawValue ?? null, formattedValue: formatted, threshold, score, maxScore, rating };
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "N/A";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}
function fmtX(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "N/A";
  return `${v.toFixed(decimals)}×`;
}
function fmtRaw(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "N/A";
  return v.toFixed(decimals);
}
function fmtDividend(v: number | null | undefined): string {
  if (v == null) return "N/A";
  if (v === 0) return "None";
  return `${v.toFixed(2)}%`;
}

// ── Strategy builders ─────────────────────────────────────────────────────────

function buildGARP(d: ScreenerData): StrategyResult {
  const eps = computeMetric(d.epsGrowth5yr, 16, 50, true, PRIMARY_MAX);
  const peg = computeMetric(d.pegRatio, 3, 0.5, false, SEC_MAX);
  const fpe = computeMetric(d.forwardPE, 50, 10, false, SEC_MAX);
  const rev = computeMetric(d.revenueGrowth3yr, 8, 30, true, SEC_MAX);
  const total = Math.round(eps.score + peg.score + fpe.score + rev.score);

  return {
    key: "garp",
    title: "GARP",
    subtitle: "Growth at a Reasonable Price",
    icon: <TrendingUp className="w-5 h-5" />,
    totalScore: total,
    primary: driver("Fwd EPS Growth Est. (1yr)", d.epsGrowth5yr, fmtPct(d.epsGrowth5yr), "≥ 16%", eps.score, PRIMARY_MAX, eps.rating),
    secondaries: [
      driver("PEG Ratio", d.pegRatio, fmtX(d.pegRatio), "≤ 3", peg.score, SEC_MAX, peg.rating),
      driver("Forward P/E", d.forwardPE, fmtX(d.forwardPE), "≤ 50", fpe.score, SEC_MAX, fpe.rating),
      driver("Fwd Revenue Growth (1yr)", d.revenueGrowth3yr, fmtPct(d.revenueGrowth3yr), "≥ 8%", rev.score, SEC_MAX, rev.rating),
    ],
  };
}

function buildDeepValue(d: ScreenerData): StrategyResult {
  const pb  = computeMetric(d.priceToBook, 2.5, 0.5, false, PRIMARY_MAX);
  const ev  = computeMetric(d.evToEbitda, 12, 3, false, SEC_MAX);
  const fcf = computeMetric(d.fcfYield, 5, 15, true, SEC_MAX);
  const tpe = computeMetric(d.trailingPE, 25, 5, false, SEC_MAX);
  const total = Math.round(pb.score + ev.score + fcf.score + tpe.score);

  return {
    key: "deep-value",
    title: "Deep Value",
    subtitle: "Classic Benjamin Graham criteria",
    icon: <DollarSign className="w-5 h-5" />,
    totalScore: total,
    primary: driver("Price to Book Value", d.priceToBook, fmtX(d.priceToBook), "≤ 2.5", pb.score, PRIMARY_MAX, pb.rating),
    secondaries: [
      driver("EV / EBITDA", d.evToEbitda, fmtX(d.evToEbitda), "≤ 12", ev.score, SEC_MAX, ev.rating),
      driver("Free Cash Flow Yield", d.fcfYield, fmtDividend(d.fcfYield), "≥ 5%", fcf.score, SEC_MAX, fcf.rating),
      driver("Trailing P/E", d.trailingPE, fmtX(d.trailingPE), "≤ 25", tpe.score, SEC_MAX, tpe.rating),
    ],
  };
}

function buildMomentum(d: ScreenerData): StrategyResult {
  // Relative strength = outperformance vs S&P
  const outperf =
    d.return52w != null && d.sp52wChange != null ? d.return52w - d.sp52wChange : null;
  const rs  = computeMetric(outperf, 0, 20, true, PRIMARY_MAX, true);
  const r3m = computeMetric(d.return3m, 0, 20, true, SEC_MAX, true);
  const r1m = computeMetric(d.return1m, 0, 10, true, SEC_MAX, true);
  const r52 = computeMetric(d.return52w, 0, 50, true, SEC_MAX, true);
  const total = Math.round(rs.score + r3m.score + r1m.score + r52.score);

  const rsLabel = outperf != null
    ? `${outperf >= 0 ? "+" : ""}${outperf.toFixed(1)}% vs S&P`
    : "N/A";

  return {
    key: "momentum",
    title: "Momentum",
    subtitle: "Price trend strength vs market",
    icon: <Zap className="w-5 h-5" />,
    totalScore: total,
    primary: driver("Relative Strength vs S&P 52W", outperf, rsLabel, "Beats S&P", rs.score, PRIMARY_MAX, rs.rating),
    secondaries: [
      driver("3-Month Return", d.return3m, fmtPct(d.return3m), "Positive", r3m.score, SEC_MAX, r3m.rating),
      driver("1-Month Return", d.return1m, fmtPct(d.return1m), "Positive", r1m.score, SEC_MAX, r1m.rating),
      driver("52-Week Return", d.return52w, fmtPct(d.return52w), "Positive", r52.score, SEC_MAX, r52.rating),
    ],
  };
}

function buildQuality(d: ScreenerData): StrategyResult {
  const roe  = computeMetric(d.returnOnEquity, 15, 40, true, PRIMARY_MAX);
  const gm   = computeMetric(d.grossMargin, 30, 70, true, SEC_MAX);
  const de   = computeMetric(d.debtToEquity, 2, 0, false, SEC_MAX);
  const om   = computeMetric(d.operatingMargin, 5, 30, true, SEC_MAX);
  const total = Math.round(roe.score + gm.score + de.score + om.score);

  return {
    key: "quality",
    title: "Quality",
    subtitle: "Financial strength & durability",
    icon: <Shield className="w-5 h-5" />,
    totalScore: total,
    primary: driver("Return on Equity", d.returnOnEquity, fmtPct(d.returnOnEquity), "≥ 15%", roe.score, PRIMARY_MAX, roe.rating),
    secondaries: [
      driver("Gross Margin", d.grossMargin, fmtPct(d.grossMargin), "≥ 30%", gm.score, SEC_MAX, gm.rating),
      driver("Debt to Equity", d.debtToEquity, fmtRaw(d.debtToEquity), "≤ 2", de.score, SEC_MAX, de.rating),
      driver("Operating Margin", d.operatingMargin, fmtPct(d.operatingMargin), "≥ 5%", om.score, SEC_MAX, om.rating),
    ],
  };
}

function buildDividendGrowth(d: ScreenerData): StrategyResult {
  const dy   = computeMetric(d.dividendYield, 0, 4, true, PRIMARY_MAX, true);
  const pr   = computeMetric(d.payoutRatio, 80, 20, false, SEC_MAX);
  const eps5 = computeMetric(d.epsGrowth5yr, 0, 20, true, SEC_MAX, true);
  const y5   = computeMetric(d.fiveYearAvgDividendYield, 0, 3, true, SEC_MAX, true);
  const total = Math.round(dy.score + pr.score + eps5.score + y5.score);

  return {
    key: "dividend",
    title: "Dividend Growth",
    subtitle: "Sustainable income & growing payouts",
    icon: <Flower2 className="w-5 h-5" />,
    totalScore: total,
    primary: driver("Dividend Yield", d.dividendYield, fmtDividend(d.dividendYield), "> 0%", dy.score, PRIMARY_MAX, dy.rating),
    secondaries: [
      driver("Payout Ratio", d.payoutRatio, fmtPct(d.payoutRatio, 1), "≤ 80%", pr.score, SEC_MAX, pr.rating),
      driver("Fwd EPS Growth Est. (1yr)", d.epsGrowth5yr, fmtPct(d.epsGrowth5yr), "> 0%", eps5.score, SEC_MAX, eps5.rating),
      driver("5yr Avg Dividend Yield", d.fiveYearAvgDividendYield, fmtDividend(d.fiveYearAvgDividendYield), "> 0%", y5.score, SEC_MAX, y5.rating),
    ],
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: Rating }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border shrink-0 ${RATING_STYLES[rating]}`}>
      {RATING_LABELS[rating]}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-rose-500";
  const textColor =
    score >= 70 ? "text-emerald-400" : score >= 45 ? "text-amber-400" : "text-rose-400";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-2xl font-bold font-mono leading-none tabular-nums w-8 text-right ${textColor}`}>
        {score}
      </span>
      <span className="text-xs text-muted-foreground">/100</span>
    </div>
  );
}

function DriverRow({ d, isPrimary }: { d: Driver; isPrimary?: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-2 ${isPrimary ? "border-b border-border mb-1" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-tight ${isPrimary ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {d.label}
        </p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">
          Threshold: {d.threshold}
        </p>
      </div>
      <span className={`font-mono text-sm font-semibold shrink-0 ${isPrimary ? "text-foreground" : "text-muted-foreground"}`}>
        {d.formattedValue}
      </span>
      <RatingBadge rating={d.rating} />
    </div>
  );
}

function StrategyCard({ s }: { s: StrategyResult }) {
  const borderColor =
    s.totalScore >= 70
      ? "border-emerald-500/30"
      : s.totalScore >= 45
      ? "border-amber-500/30"
      : "border-rose-500/20";

  return (
    <Card className={`bg-card border ${borderColor} flex flex-col`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground shrink-0">
            {s.icon}
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold leading-tight">{s.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.subtitle}</p>
          </div>
        </div>
        <ScoreBar score={s.totalScore} />
      </CardHeader>

      <CardContent className="flex flex-col gap-0 pt-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">
          Primary Driver — 50%
        </p>
        <DriverRow d={s.primary} isPrimary />

        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mt-3 mb-1">
          Secondary Drivers — 50%
        </p>
        {s.secondaries.map((sec) => (
          <DriverRow key={sec.label} d={sec} />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ScreenerRatings({ symbol }: { symbol: string }) {
  const { data, isLoading, isError } = useGetStockScreenerRatings(symbol, {
    query: {
      enabled: !!symbol,
      queryKey: getGetStockScreenerRatingsQueryKey(symbol),
      staleTime: 5 * 60 * 1000,
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-muted-foreground text-sm py-8 text-center">
        Failed to load screener data.
      </div>
    );
  }

  const strategies: StrategyResult[] = [
    buildGARP(data),
    buildDeepValue(data),
    buildMomentum(data),
    buildQuality(data),
    buildDividendGrowth(data),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Screener Ratings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          How does the stock score across 5 of the most popular investment strategies?
        </p>
      </div>

      {/* Score legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">Score scale:</span>
        <span className="px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-semibold">
          ≥ 70 Strong fit
        </span>
        <span className="px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30 font-semibold">
          45–69 Partial fit
        </span>
        <span className="px-2 py-0.5 rounded border bg-rose-500/10 text-rose-400 border-rose-500/30 font-semibold">
          &lt; 45 Poor fit
        </span>
        <span className="ml-auto text-muted-foreground/60">
          Primary driver = 50 pts · Each secondary = ~17 pts
        </span>
      </div>

      {/* Strategy cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {strategies.map((s) => (
          <StrategyCard key={s.key} s={s} />
        ))}
      </div>
    </div>
  );
}
