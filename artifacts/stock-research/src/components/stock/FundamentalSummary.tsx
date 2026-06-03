import { useMemo } from "react";
import {
  useGetStockFundamentals,
  getGetStockFundamentalsQueryKey,
  useGetStockIndicators,
  getGetStockIndicatorsQueryKey,
} from "@workspace/api-client-react";
import type {
  FundamentalMetric,
  FundamentalTrendPoint,
  StockIndicators,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, DollarSign, Shield, Users } from "lucide-react";

// ── Signal colors ─────────────────────────────────────────────────────────────

type SignalColor = "green" | "yellow" | "orange" | "red" | "neutral";

const SIGNAL_CLASSES: Record<SignalColor, { badge: string; dot: string }> = {
  green:   { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",  dot: "bg-emerald-400" },
  yellow:  { badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",        dot: "bg-amber-400" },
  orange:  { badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",     dot: "bg-orange-400" },
  red:     { badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",           dot: "bg-rose-400" },
  neutral: { badge: "bg-muted/60 text-muted-foreground border-border",           dot: "bg-muted-foreground" },
};

// ── Per-indicator signal computation ─────────────────────────────────────────

interface Signal {
  label: string;
  value: string;
  color: SignalColor;
  signalLabel: string;
  legend: string;
}

function peSignal(pe: number | null | undefined): Signal {
  const legend = "1–19× Value · 20–40× Fair · >40× Expensive · ≤0 Neg. Earnings";
  if (pe == null) return { label: "P/E (Fwd)", value: "N/A", color: "neutral", signalLabel: "No Data", legend };
  if (pe <= 0)   return { label: "P/E (Fwd)", value: `${pe.toFixed(1)}×`, color: "red",    signalLabel: "Negative Earnings", legend };
  if (pe < 20)   return { label: "P/E (Fwd)", value: `${pe.toFixed(1)}×`, color: "green",  signalLabel: "Value Territory",   legend };
  if (pe <= 40)  return { label: "P/E (Fwd)", value: `${pe.toFixed(1)}×`, color: "yellow", signalLabel: "Fairly Valued",     legend };
  return             { label: "P/E (Fwd)", value: `${pe.toFixed(1)}×`, color: "orange", signalLabel: "Expensive",          legend };
}

function epsGrowthSignal(g: number | null | undefined): Signal {
  const legend = ">15% Strong · 5–15% Moderate · <5% Slow/Declining";
  if (g == null) return { label: "EPS Growth (YoY)", value: "N/A",            color: "neutral", signalLabel: "No Data",         legend };
  const fmt = `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`;
  if (g > 15)    return { label: "EPS Growth (YoY)", value: fmt, color: "green",  signalLabel: "Strong Growth",   legend };
  if (g >= 5)    return { label: "EPS Growth (YoY)", value: fmt, color: "yellow", signalLabel: "Moderate Growth", legend };
  return             { label: "EPS Growth (YoY)", value: fmt, color: "red",    signalLabel: "Slow / Declining", legend };
}

function debtEquitySignal(de: number | null | undefined): Signal {
  const legend = "<0.5× Low Leverage · 0.5–1.5× Moderate · >1.5× High Leverage";
  if (de == null) return { label: "Debt / Equity", value: "N/A",            color: "neutral", signalLabel: "No Data",         legend };
  const fmt = `${de.toFixed(2)}×`;
  if (de < 0.5)   return { label: "Debt / Equity", value: fmt, color: "green",  signalLabel: "Low Leverage",    legend };
  if (de <= 1.5)  return { label: "Debt / Equity", value: fmt, color: "yellow", signalLabel: "Moderate Leverage",legend };
  return              { label: "Debt / Equity", value: fmt, color: "red",    signalLabel: "High Leverage",   legend };
}

function maSignal(
  price: number | null | undefined,
  ma50: number | null | undefined,
  ma200: number | null | undefined,
): Signal {
  const legend = "Price > MA = Uptrend · Price < MA = Downtrend";
  if (price == null || (ma50 == null && ma200 == null)) {
    return { label: "50D / 200D MA", value: "N/A", color: "neutral", signalLabel: "No Data", legend };
  }
  const above50  = ma50  != null ? price > ma50  : null;
  const above200 = ma200 != null ? price > ma200 : null;

  let signalLabel: string;
  let color: SignalColor;
  if (above50 === true && above200 === true) {
    signalLabel = "Above Both MAs"; color = "green";
  } else if (above50 === false && above200 === false) {
    signalLabel = "Below Both MAs"; color = "yellow";
  } else if (above200 === true) {
    signalLabel = "Above 200D, Below 50D"; color = "yellow";
  } else {
    signalLabel = "Above 50D, Below 200D"; color = "yellow";
  }

  const parts: string[] = [];
  if (ma50  != null) parts.push(`50D: ${above50  ? "↑" : "↓"} $${ma50.toFixed(2)}`);
  if (ma200 != null) parts.push(`200D: ${above200 ? "↑" : "↓"} $${ma200.toFixed(2)}`);
  return { label: "50D / 200D MA", value: parts.join("  "), color, signalLabel, legend };
}

function rsiSignal(rsi: number | null | undefined): Signal {
  const legend = "<30 Oversold/Buy · 30–70 Neutral · >70 Overbought/Sell";
  if (rsi == null) return { label: "RSI (14)", value: "N/A",            color: "neutral", signalLabel: "No Data",   legend };
  const fmt = rsi.toFixed(1);
  if (rsi < 30)   return { label: "RSI (14)", value: fmt, color: "green",  signalLabel: "Oversold / Buy",  legend };
  if (rsi <= 70)  return { label: "RSI (14)", value: fmt, color: "neutral", signalLabel: "Neutral Momentum", legend };
  return              { label: "RSI (14)", value: fmt, color: "red",    signalLabel: "Overbought / Sell", legend };
}

function shortInterestSignal(si: number | null | undefined): Signal {
  const legend = "<3% Low · 3–5% Moderate · >5% Heavily Shorted";
  if (si == null) return { label: "Short Interest", value: "N/A",          color: "neutral", signalLabel: "No Data",          legend };
  const fmt = `${si.toFixed(1)}%`;
  if (si < 3)    return { label: "Short Interest", value: fmt, color: "green",  signalLabel: "Low Short Pressure",  legend };
  if (si <= 5)   return { label: "Short Interest", value: fmt, color: "yellow", signalLabel: "Moderate Short Interest", legend };
  return             { label: "Short Interest", value: fmt, color: "red",    signalLabel: "Heavily Shorted",    legend };
}

function putCallSignal(pcr: number | null | undefined): Signal {
  const legend = "<0.7 Bullish · 0.7–1.0 Neutral · >1.0 Bearish/Hedging";
  if (pcr == null) return { label: "Put/Call Ratio", value: "N/A",           color: "neutral", signalLabel: "No Data",           legend };
  const fmt = pcr.toFixed(2);
  if (pcr < 0.7)   return { label: "Put/Call Ratio", value: fmt, color: "green",  signalLabel: "Bullish Sentiment",  legend };
  if (pcr <= 1.0)  return { label: "Put/Call Ratio", value: fmt, color: "yellow", signalLabel: "Neutral Sentiment",  legend };
  return               { label: "Put/Call Ratio", value: fmt, color: "red",    signalLabel: "Bearish / Hedging",  legend };
}

function betaSignal(beta: number | null | undefined): Signal {
  const legend = "=1 Market · <1 Low volatility · >1 High volatility · <0 Inverse";
  if (beta == null) return { label: "Beta", value: "N/A", color: "neutral", signalLabel: "No Data", legend };
  const fmt = beta.toFixed(2);
  let desc: string;
  if (Math.abs(beta) < 0.05) desc = "Market-Independent";
  else if (beta < 0)         desc = "Inverse to Market";
  else if (beta < 1)         desc = "Lower Volatility";
  else if (beta === 1)       desc = "Tracks Market";
  else                       desc = "Higher Volatility";
  return { label: "Beta", value: fmt, color: "neutral", signalLabel: desc, legend };
}

function ivSignal(iv: number | null | undefined): Signal {
  const legend = "<30% Low, cheap options · 30–50% Moderate · >50% High, expensive options";
  if (iv == null) return { label: "Implied Volatility", value: "N/A",          color: "neutral", signalLabel: "No Data",       legend };
  const fmt = `${iv.toFixed(1)}%`;
  let desc: string;
  if (iv < 30)  desc = "Low — Cheap Options";
  else if (iv <= 50) desc = "Moderate";
  else          desc = "High — Expensive Options";
  return { label: "Implied Volatility", value: fmt, color: "neutral", signalLabel: desc, legend };
}

// ── IndicatorSummaryCard ──────────────────────────────────────────────────────

function SignalChip({ signal }: { signal: Signal }) {
  const { badge, dot } = SIGNAL_CLASSES[signal.color];
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{signal.label}</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      </div>
      <div className="font-mono font-bold text-sm text-foreground leading-tight">
        {signal.value}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded border ${badge}`}>
          {signal.signalLabel}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/60 leading-tight">{signal.legend}</p>
    </div>
  );
}

function IndicatorSummaryCard({ data }: { data: StockIndicators }) {
  const signals: Signal[] = [
    peSignal(data.forwardPE),
    epsGrowthSignal(data.epsGrowth),
    debtEquitySignal(data.debtToEquity),
    maSignal(data.currentPrice, data.fiftyDayAverage, data.twoHundredDayAverage),
    rsiSignal(data.rsi14),
    shortInterestSignal(data.shortPercentOfFloat),
    putCallSignal(data.putCallRatio),
    betaSignal(data.beta),
    ivSignal(data.impliedVolatility),
  ];

  const greenCount  = signals.filter(s => s.color === "green").length;
  const redCount    = signals.filter(s => s.color === "red" || s.color === "orange").length;
  const neutralCount = signals.length - greenCount - redCount;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Signal Overview</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Quick-read on valuation, technicals &amp; sentiment
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {greenCount} Positive
            </span>
            <span className="px-2 py-1 rounded-md bg-muted/60 text-muted-foreground border border-border">
              {neutralCount} Neutral
            </span>
            <span className="px-2 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
              {redCount} Caution
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {signals.map((s) => (
            <SignalChip key={s.label} signal={s} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Pillar components (unchanged) ─────────────────────────────────────────────

const RATING_COLORS: Record<string, string> = {
  excellent: "text-emerald-400",
  good: "text-blue-400",
  fair: "text-amber-400",
  poor: "text-rose-400",
};

const RATING_BG: Record<string, string> = {
  excellent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  good: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  fair: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  poor: "bg-rose-500/10 text-rose-400 border-rose-500/30",
};

const RATING_LABELS: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

type Rating = "excellent" | "good" | "fair" | "poor" | null;

function RatingBadge({ rating }: { rating: Rating }) {
  if (!rating) return <span className="text-xs text-muted-foreground">N/A</span>;
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${RATING_BG[rating]}`}>
      {RATING_LABELS[rating]}
    </span>
  );
}

function MetricValue({ metric }: { metric: FundamentalMetric }) {
  const color = metric.rating ? RATING_COLORS[metric.rating] : "text-muted-foreground";
  return (
    <span className={`text-3xl font-bold tracking-tight font-mono ${color}`}>
      {metric.formatted ?? "N/A"}
    </span>
  );
}

interface MetricCardProps {
  title: string;
  subtitle?: string;
  description: string;
  metric: FundamentalMetric;
  thresholdHint?: string;
  children?: React.ReactNode;
}

function MetricCard({ title, subtitle, description, metric, thresholdHint, children }: MetricCardProps) {
  return (
    <Card className="bg-card border-border flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground leading-tight">
          {title}
          {subtitle && <span className="block text-xs font-normal text-muted-foreground mt-0.5">{subtitle}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <div className="flex items-end justify-between gap-2">
          <MetricValue metric={metric} />
          <RatingBadge rating={metric.rating as Rating} />
        </div>
        {thresholdHint && (
          <p className="text-xs text-muted-foreground/70 font-mono">{thresholdHint}</p>
        )}
        {children}
        <p className="text-xs text-muted-foreground leading-relaxed mt-auto pt-2 border-t border-border">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function TrendSparkline({ data, label, color }: { data: FundamentalTrendPoint[]; label: string; color: string }) {
  const valid = data.filter((d) => d.value != null);
  if (valid.length < 2) return null;
  const min = Math.min(...valid.map((d) => d.value!));
  const max = Math.max(...valid.map((d) => d.value!));
  const padding = (max - min) * 0.2 || 1;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <ResponsiveContainer width="100%" height={56}>
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
          <YAxis domain={[min - padding, max + padding]} hide />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(v: number) => [`${v.toFixed(1)}%`, ""]}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#grad-${label})`}
            dot={{ fill: color, r: 2, strokeWidth: 0 }} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PillarSection({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">{icon}</div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{children}</div>
    </div>
  );
}

function TrendMetricCard({ title, subtitle, description, thresholdHint, trend, rating, trendLabel, trendColor }: {
  title: string; subtitle?: string; description: string; thresholdHint?: string;
  trend: FundamentalTrendPoint[]; rating: string | null; trendLabel: string; trendColor: string;
}) {
  const validTrend = trend.filter((d) => d.value != null);
  const latest = validTrend.at(-1);
  const ratingLabels: Record<string, string> = {
    excellent: "Expanding", good: "Flat", fair: "Slight Decline", poor: "Declining",
  };
  const displayRating = rating ?? null;
  const color = displayRating ? RATING_COLORS[displayRating] : "text-muted-foreground";
  return (
    <Card className="bg-card border-border flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground leading-tight">
          {title}
          {subtitle && <span className="block text-xs font-normal text-muted-foreground mt-0.5">{subtitle}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <div className="flex items-end justify-between gap-2">
          <span className={`text-3xl font-bold tracking-tight font-mono ${color}`}>
            {latest ? `${latest.value?.toFixed(1)}%` : "N/A"}
          </span>
          {displayRating && (
            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${RATING_BG[displayRating]}`}>
              {ratingLabels[displayRating] ?? RATING_LABELS[displayRating]}
            </span>
          )}
        </div>
        {thresholdHint && <p className="text-xs text-muted-foreground/70 font-mono">{thresholdHint}</p>}
        <TrendSparkline data={trend} label={trendLabel} color={trendColor} />
        <p className="text-xs text-muted-foreground leading-relaxed mt-auto pt-2 border-t border-border">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function ShareCountCard({ trend, metric }: { trend: FundamentalTrendPoint[]; metric: FundamentalMetric }) {
  const ratingLabels: Record<string, string> = {
    excellent: "Strong Buybacks", good: "Buybacks", fair: "Slight Dilution", poor: "Dilution",
  };
  const direction = (metric.value ?? 0) < 0 ? "text-emerald-400" : "text-rose-400";
  const displayRating = metric.rating ?? null;
  return (
    <Card className="bg-card border-border flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground leading-tight">
          Share Count Trend
          <span className="block text-xs font-normal text-muted-foreground mt-0.5">5-Year Change</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <div className="flex items-end justify-between gap-2">
          <span className={`text-3xl font-bold tracking-tight font-mono ${direction}`}>
            {metric.formatted ?? "N/A"}
          </span>
          {displayRating && (
            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${RATING_BG[displayRating]}`}>
              {ratingLabels[displayRating] ?? RATING_LABELS[displayRating]}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground/70 font-mono">
          Excellent: &lt;−10% · Good: &lt;−2% · Fair: &lt;5% · Poor: ≥5%
        </p>
        <TrendSparkline data={trend} label="Shares Outstanding" color="#a78bfa" />
        <p className="text-xs text-muted-foreground leading-relaxed mt-auto pt-2 border-t border-border">
          A declining share count means the company is buying back its own shares — your "slice of the pie" grows
          without you doing anything. A rising count means ownership is being diluted. Prefer companies that
          reduce shares over time.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function FundamentalSummary({ symbol }: { symbol: string }) {
  const { data: fundamentals, isLoading: loadingFundamentals, isError: errorFundamentals } =
    useGetStockFundamentals(symbol, {
      query: {
        enabled: !!symbol,
        queryKey: getGetStockFundamentalsQueryKey(symbol),
        staleTime: 5 * 60 * 1000,
      },
    });

  const { data: indicators, isLoading: loadingIndicators } = useGetStockIndicators(symbol, {
    query: {
      enabled: !!symbol,
      queryKey: getGetStockIndicatorsQueryKey(symbol),
      staleTime: 2 * 60 * 1000,
    },
  });

  const grossMarginColor = useMemo(() => {
    if (!fundamentals) return "#6b7280";
    const r = fundamentals.profitability.grossMarginRating;
    if (r === "excellent") return "#34d399";
    if (r === "good") return "#60a5fa";
    if (r === "fair") return "#fbbf24";
    return "#f87171";
  }, [fundamentals]);

  if (loadingFundamentals) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-52 rounded-xl w-full" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, j) => (
                <Skeleton key={j} className="h-52 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (errorFundamentals || !fundamentals) {
    return (
      <div className="text-muted-foreground text-sm py-8 text-center">
        Failed to load fundamental data.
      </div>
    );
  }

  const { profitability, valuation, solvency, qualitative } = fundamentals;

  return (
    <div className="space-y-10">
      {/* ── Signal Overview card ── */}
      {loadingIndicators ? (
        <Skeleton className="h-64 rounded-xl w-full" />
      ) : indicators ? (
        <IndicatorSummaryCard data={indicators} />
      ) : null}

      {/* Pillar rating legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">Pillar rating scale:</span>
        {(["excellent", "good", "fair", "poor"] as const).map((r) => (
          <span key={r} className={`px-2 py-0.5 rounded border font-semibold ${RATING_BG[r]}`}>
            {RATING_LABELS[r]}
          </span>
        ))}
      </div>

      {/* ── a) Profitability Pillar ── */}
      <PillarSection
        icon={<TrendingUp className="w-5 h-5" />}
        title="Profitability Pillar"
        subtitle="Efficiency & Moat — How well does the business convert resources into profit?"
      >
        <MetricCard
          title="Return on Equity (ROE)" subtitle="Net Income ÷ Shareholder Equity"
          description="Measures how effectively management uses the money shareholders have invested. Think of it as the 'return on your capital' from management's perspective. A consistent ROE above 15% suggests a business with real competitive advantages."
          metric={profitability.roe} thresholdHint="Excellent: >20% · Good: >15% · Fair: >8%"
        />
        <MetricCard
          title="Return on Invested Capital (ROIC)" subtitle="Net Income ÷ (Equity + Debt)"
          description="Shows how much profit the business generates for every dollar of capital put in — both equity AND debt. It's a more complete picture than ROE. A ROIC well above the cost of borrowing (WACC) means the business is genuinely creating value, not just using leverage."
          metric={profitability.roic} thresholdHint="Excellent: >15% · Good: >10% · Fair: >5%"
        />
        <TrendMetricCard
          title="Pricing Power" subtitle="Gross Margin Trend (5 Years)"
          description="Gross margin (revenue minus cost of goods) tells you how much pricing power the company has. A flat or rising margin over five years means competitors can't easily undercut them — a key sign of a durable business model or 'moat'."
          thresholdHint="Expanding · Flat · Slight Decline · Declining"
          trend={profitability.grossMarginTrend} rating={profitability.grossMarginRating}
          trendLabel="Gross Margin %" trendColor={grossMarginColor}
        />
        <MetricCard
          title="Cash Conversion Cycle" subtitle="DSO + DIO − DPO (days)"
          description="Measures how efficiently the business manages cash. A negative CCC means the company collects money from customers before it has to pay its own suppliers — like a supermarket. Amazon and Walmart have negative CCCs. A high positive number signals cash tied up in inventory or slow receivables."
          metric={profitability.ccc} thresholdHint="Excellent: <0d · Good: <30d · Fair: <60d"
        />
      </PillarSection>

      {/* ── b) Valuation Pillar ── */}
      <PillarSection
        icon={<DollarSign className="w-5 h-5" />}
        title="Valuation Pillar"
        subtitle="Are you paying a fair price for the business?"
      >
        <MetricCard
          title="EV / EBITDA" subtitle="Enterprise Value ÷ EBITDA"
          description="A more reliable valuation multiple than P/E because it accounts for debt levels and is harder to distort with accounting choices. It lets you compare companies with different capital structures on equal footing. Below 10x is generally cheap; above 20x is expensive and implies high growth expectations."
          metric={valuation.evToEbitda} thresholdHint="Excellent: <10x · Good: <15x · Fair: <20x"
        />
        <MetricCard
          title="Free Cash Flow Yield" subtitle="Free Cash Flow ÷ Market Cap"
          description="How much real cash the company generates relative to what you're paying for it. Unlike earnings, cash flow is very hard to fake. A 5%+ FCF yield is often seen as a healthy baseline — it means the company could theoretically return 5% of your investment in cash every year."
          metric={valuation.fcfYield} thresholdHint="Excellent: >8% · Good: >5% · Fair: >2%"
        />
        <MetricCard
          title="Price / Tangible Book" subtitle="Price per share ÷ Tangible Book per share"
          description="Book value minus intangibles (goodwill, brand names, patents) gives you the 'hard asset' value of the business. Especially useful for banks, manufacturers, and asset-heavy industries. A very high ratio means you're paying a lot for intangibles that may not survive a downturn."
          metric={valuation.priceToTangibleBook} thresholdHint="Excellent: <1x · Good: <3x · Fair: <5x"
        />
        <div className="hidden xl:block" />
      </PillarSection>

      {/* ── c) Solvency & Health Pillar ── */}
      <PillarSection
        icon={<Shield className="w-5 h-5" />}
        title="Solvency & Health Pillar"
        subtitle="Can the business survive hard times and still pay its obligations?"
      >
        <MetricCard
          title="Net Debt / EBITDA" subtitle="(Total Debt − Cash) ÷ EBITDA"
          description="How many years of earnings it would take to pay off all debt. Think of it like a mortgage-to-income ratio. Below 3x is generally healthy. Above 5x is a red flag — one bad year could leave the company unable to service its debt. Negative net debt means the company has more cash than debt — fortress-like."
          metric={solvency.netDebtToEbitda} thresholdHint="Excellent: <1x · Good: <3x · Fair: <5x · Poor: ≥5x"
        />
        <MetricCard
          title="Interest Coverage" subtitle="EBIT ÷ Interest Expense"
          description="Can the company comfortably pay its lenders? This ratio shows how many times over operating profit covers interest payments. Above 3x is healthy. Below 1.5x means the dividend (if any) is at high risk and the company may need to borrow more just to survive."
          metric={solvency.interestCoverage} thresholdHint="Excellent: >10x · Good: >3x · Fair: >1.5x"
        />
        <MetricCard
          title="Current Ratio" subtitle="Current Assets ÷ Current Liabilities"
          description="A snapshot of short-term liquidity. Above 1.0 means the company has more cash, receivables, and inventory than bills due in the next 12 months. Below 1.0 is a warning sign — the company may struggle to meet near-term obligations."
          metric={solvency.currentRatio} thresholdHint="Excellent: >2.0x · Good: >1.5x · Fair: >1.0x"
        />
        <MetricCard
          title="Quick Ratio" subtitle="(Current Assets − Inventory) ÷ Current Liabilities"
          description="A stricter version of the current ratio that strips out inventory (which may be hard to sell quickly). Often called the 'acid-test'. It tells you if the company can meet its short-term obligations using only its most liquid assets. Above 1.0 is generally healthy."
          metric={solvency.quickRatio} thresholdHint="Excellent: >1.5x · Good: >1.0x · Fair: >0.5x"
        />
      </PillarSection>

      {/* ── d) Qualitative Pillar ── */}
      <PillarSection
        icon={<Users className="w-5 h-5" />}
        title="Qualitative Pillar"
        subtitle="Softer signals about management incentives, innovation, and shareholder treatment"
      >
        <MetricCard
          title="Insider Ownership" subtitle="% of shares held by insiders"
          description="Are the captains of the ship also owners of the ship? When executives and directors own a meaningful stake, their interests are directly aligned with yours. They feel the same pain when the stock drops. Very low insider ownership can signal a 'hired hand' mentality."
          metric={qualitative.insiderOwnership} thresholdHint="Excellent: >10% · Good: >5% · Fair: >1%"
        />
        <MetricCard
          title="R&D as % of Revenue" subtitle="R&D Expense ÷ Total Revenue"
          description="Is the company reinvesting for the future, or just harvesting its existing products? A high R&D ratio suggests a company building a moat through innovation. A low ratio in a fast-moving industry can signal a company that is 'milking' old products and will eventually fall behind."
          metric={qualitative.rdAsPercentRevenue}
          thresholdHint="Higher is generally better · Context is sector-dependent"
        />
        <ShareCountCard trend={qualitative.shareCountTrend} metric={qualitative.shareCountChange5y} />
        <div className="hidden xl:block" />
      </PillarSection>
    </div>
  );
}
