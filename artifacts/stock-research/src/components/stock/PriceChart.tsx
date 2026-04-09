import { useState, useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useGetStockChart,
  getGetStockChartQueryKey,
  useGetEarningsHistory,
  getGetEarningsHistoryQueryKey,
} from "@workspace/api-client-react";
import type { GetStockChartRange } from "@workspace/api-client-react";

const RANGE_OPTIONS: { label: string; value: GetStockChartRange }[] = [
  { label: "1D", value: "1d" },
  { label: "5D", value: "5d" },
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "2Y", value: "2y" },
  { label: "5Y", value: "5y" },
  { label: "MAX", value: "max" },
];

const PE_PRESETS = [10, 15, 20, 25, 30];

interface ChartPoint {
  date: string;
  close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  fairValue: number | null;
}

export default function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<GetStockChartRange>("1y");
  const [showEarnings, setShowEarnings] = useState(true);
  const [peMultiple, setPeMultiple] = useState(15);

  const { data: chartData, isLoading: isLoadingChart } = useGetStockChart(
    symbol,
    { range },
    { query: { enabled: !!symbol, queryKey: getGetStockChartQueryKey(symbol, { range }) } }
  );

  const { data: earningsData, isLoading: isLoadingEarnings } = useGetEarningsHistory(
    symbol,
    { query: { enabled: !!symbol, queryKey: getGetEarningsHistoryQueryKey(symbol) } }
  );

  const mergedData = useMemo<ChartPoint[]>(() => {
    if (!chartData?.data) return [];

    const earnings = earningsData?.history ?? [];
    // Sort earnings by date ascending
    const sortedEarnings = [...earnings].sort((a, b) => a.date.localeCompare(b.date));

    return chartData.data.map((point) => {
      let fairValue: number | null = null;

      if (showEarnings && sortedEarnings.length > 0) {
        // Step-interpolate: find the most recent earnings quarter whose date <= point.date
        let latestTtmEps: number | null = null;
        for (const e of sortedEarnings) {
          if (e.date <= point.date) {
            latestTtmEps = e.ttmEps ?? null;
          } else {
            break;
          }
        }
        // Only show fair value if TTM EPS is positive (negative EPS doesn't map to fair value meaningfully)
        if (latestTtmEps != null && latestTtmEps > 0) {
          fairValue = parseFloat((latestTtmEps * peMultiple).toFixed(2));
        }
      }

      return { ...point, fairValue };
    });
  }, [chartData, earningsData, showEarnings, peMultiple]);

  const isPositive =
    mergedData.length >= 2
      ? (mergedData[mergedData.length - 1].close ?? 0) >= (mergedData[0].close ?? 0)
      : true;

  const priceColor = isPositive ? "#22c55e" : "#ef4444";
  const earningsLineColor = "#f59e0b";

  const hasFairValueData = mergedData.some((p) => p.fairValue !== null);

  // Chart renders as soon as price data is ready; earnings overlay loads separately
  const isLoading = isLoadingChart;

  return (
    <Card className="bg-card border-border w-full">
      <CardHeader className="pb-2 space-y-3">
        <div className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Price History
          </CardTitle>
          <div className="flex gap-1 flex-wrap justify-end">
            {RANGE_OPTIONS.map((r) => (
              <Button
                key={r.value}
                variant={range === r.value ? "default" : "ghost"}
                size="sm"
                className={`h-7 px-2 text-xs font-mono ${
                  range === r.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setRange(r.value)}
                data-testid={`range-btn-${r.value}`}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Earnings overlay controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button
            size="sm"
            variant={showEarnings ? "default" : "outline"}
            className={`h-6 px-2 text-xs font-mono gap-1.5 ${
              showEarnings
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30"
                : "text-muted-foreground"
            }`}
            onClick={() => setShowEarnings((v) => !v)}
            data-testid="toggle-earnings-overlay"
          >
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: earningsLineColor }}
            />
            Earnings Fair Value
          </Button>

          {showEarnings && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground font-mono">P/E:</span>
              {PE_PRESETS.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={peMultiple === p ? "default" : "ghost"}
                  className={`h-6 px-2 text-xs font-mono ${
                    peMultiple === p
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setPeMultiple(p)}
                  data-testid={`pe-btn-${p}`}
                >
                  {p}x
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-[400px] w-full mt-2">
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
              Loading chart data...
            </div>
          ) : !mergedData.length ? (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
              No data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={mergedData}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={priceColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={priceColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.4}
                />

                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    if (range === "1d" || range === "5d") {
                      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    }
                    return d.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: range === "max" || range === "5y" ? "2-digit" : undefined,
                    });
                  }}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickMargin={10}
                  minTickGap={40}
                  axisLine={false}
                  tickLine={false}
                />

                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(val) => `$${val}`}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickMargin={8}
                  axisLine={false}
                  tickLine={false}
                  orientation="right"
                  width={55}
                />

                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    borderColor: "hsl(var(--border))",
                    color: "hsl(var(--foreground))",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    borderRadius: "6px",
                  }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "6px", fontFamily: "monospace" }}
                  labelFormatter={(label) => {
                    const d = new Date(label);
                    if (range === "1d" || range === "5d") {
                      return d.toLocaleString([], {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      });
                    }
                    return d.toLocaleDateString([], {
                      month: "short", day: "numeric", year: "numeric",
                    });
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === "close") return [`$${value.toFixed(2)}`, "Price"];
                    if (name === "fairValue")
                      return [`$${value.toFixed(2)}`, `Fair Value (${peMultiple}x P/E)`];
                    return [value, name];
                  }}
                  itemStyle={{ padding: "1px 0" }}
                />

                {showEarnings && hasFairValueData && (
                  <Legend
                    verticalAlign="top"
                    align="left"
                    iconType="line"
                    wrapperStyle={{ paddingBottom: "8px", fontSize: "11px", fontFamily: "monospace" }}
                    formatter={(value) => {
                      if (value === "close") return "Price";
                      if (value === "fairValue") return `Fair Value (${peMultiple}x P/E)`;
                      return value;
                    }}
                  />
                )}

                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={priceColor}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorClose)"
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0, fill: priceColor }}
                />

                {showEarnings && (
                  <Line
                    type="stepAfter"
                    dataKey="fairValue"
                    stroke={earningsLineColor}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                    activeDot={{ r: 4, fill: earningsLineColor, strokeWidth: 0 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {showEarnings && hasFairValueData && (
          <p className="text-xs text-muted-foreground font-mono mt-2 pl-1">
            Amber line = TTM EPS × {peMultiple}x P/E fair value. Price above line = potentially overvalued; below = potentially undervalued.
          </p>
        )}
        {showEarnings && !hasFairValueData && !isLoading && (
          <p className="text-xs text-muted-foreground font-mono mt-2 pl-1">
            Earnings fair value line unavailable for this symbol or time range.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
