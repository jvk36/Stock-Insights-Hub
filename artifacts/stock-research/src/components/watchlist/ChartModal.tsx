import { useState, useMemo } from "react";
import {
  useGetWatchlistStockHistory,
  getGetWatchlistStockHistoryQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y"] as const;
type Period = (typeof PERIODS)[number];

interface CrossEvent {
  date: string;
  type: "golden" | "death";
}

interface ChartModalProps {
  ticker: string | null;
  companyName?: string | null;
  onClose: () => void;
}

function detectCrosses(
  dataPoints: Array<{ date: string; ma50?: number | null; ma200?: number | null }>
): CrossEvent[] {
  const crosses: CrossEvent[] = [];
  for (let i = 1; i < dataPoints.length; i++) {
    const prev = dataPoints[i - 1];
    const curr = dataPoints[i];
    if (
      prev.ma50 == null || prev.ma200 == null ||
      curr.ma50 == null || curr.ma200 == null
    ) continue;

    const prevAbove = prev.ma50 > prev.ma200;
    const currAbove = curr.ma50 > curr.ma200;

    if (!prevAbove && currAbove) {
      crosses.push({ date: curr.date, type: "golden" });
    } else if (prevAbove && !currAbove) {
      crosses.push({ date: curr.date, type: "death" });
    }
  }
  return crosses;
}

// Chart colors tuned for light green background
const CHART = {
  grid:         "hsl(130 18% 80%)",
  axis:         "hsl(140 15% 42%)",
  axisLine:     "hsl(130 18% 72%)",
  tooltipBg:    "hsl(120 25% 98%)",
  tooltipBorder:"hsl(130 18% 74%)",
  tooltipText:  "hsl(150 40% 10%)",
  price:        "hsl(210 75% 40%)",
  ma50:         "hsl(25 88% 48%)",
  ma200:        "hsl(142 55% 28%)",
  rsi:          "hsl(280 60% 48%)",
  rsiFill:      "hsl(280 60% 48% / 0.15)",
  legendText:   "hsl(140 15% 30%)",
};

const GOLDEN_COLOR = "hsl(40 90% 38%)";
const DEATH_COLOR  = "hsl(0 72% 48%)";

export function ChartModal({ ticker, companyName, onClose }: ChartModalProps) {
  const [period, setPeriod] = useState<Period>("6mo");

  const { data: history, isLoading } = useGetWatchlistStockHistory(
    ticker ?? "",
    { period }, { query: { enabled: !!ticker, queryKey: getGetWatchlistStockHistoryQueryKey(ticker ?? "", { period }) } }
  );

  const dataPoints = history?.dataPoints ?? [];

  const crosses = useMemo(() => detectCrosses(dataPoints), [dataPoints]);

  const currentCrossState = useMemo(() => {
    for (let i = dataPoints.length - 1; i >= 0; i--) {
      const d = dataPoints[i];
      if (d.ma50 != null && d.ma200 != null) {
        return d.ma50 > d.ma200 ? "golden" : "death";
      }
    }
    return null;
  }, [dataPoints]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatDateLong = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

  const priceMin = dataPoints.length
    ? Math.floor(
        Math.min(
          ...dataPoints.flatMap((d: any) =>
            [d.price, d.ma50, d.ma200].filter((v): v is number => v != null)
          )
        ) * 0.97
      )
    : undefined;

  const priceMax = dataPoints.length
    ? Math.ceil(
        Math.max(
          ...dataPoints.flatMap((d: any) =>
            [d.price, d.ma50, d.ma200].filter((v): v is number => v != null)
          )
        ) * 1.03
      )
    : undefined;

  const tooltipStyle = {
    backgroundColor: CHART.tooltipBg,
    border: `1px solid ${CHART.tooltipBorder}`,
    borderRadius: "6px",
    fontSize: "12px",
    fontFamily: "monospace",
    color: CHART.tooltipText,
  };

  return (
    <Dialog open={!!ticker} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg text-foreground flex items-center gap-3 flex-wrap">
            <span>{ticker}</span>
            {companyName && (
              <span className="text-sm font-sans font-normal text-muted-foreground">
                {companyName}
              </span>
            )}
            {currentCrossState === "golden" && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded border"
                style={{ color: GOLDEN_COLOR, borderColor: GOLDEN_COLOR, background: "hsl(45 90% 90%)" }}
              >
                ★ GOLDEN CROSS ACTIVE
              </span>
            )}
            {currentCrossState === "death" && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded border"
                style={{ color: DEATH_COLOR, borderColor: DEATH_COLOR, background: "hsl(0 70% 94%)" }}
              >
                ✕ DEATH CROSS ACTIVE
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              data-testid={`period-${p}`}
              className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[220px] w-full bg-muted" />
            <Skeleton className="h-[120px] w-full bg-muted" />
          </div>
        ) : dataPoints.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground font-mono text-sm">
            No historical data available for {ticker}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground font-mono mb-2 uppercase tracking-wider">
                Price / Moving Averages
              </p>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={dataPoints} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fill: CHART.axis, fontSize: 10, fontFamily: "monospace" }}
                    axisLine={{ stroke: CHART.axisLine }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[priceMin ?? "auto", priceMax ?? "auto"]}
                    tick={{ fill: CHART.axis, fontSize: 10, fontFamily: "monospace" }}
                    axisLine={{ stroke: CHART.axisLine }}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: CHART.tooltipText }}
                    labelFormatter={(l) => formatDateLong(l)}
                    formatter={(value: number, name: string) => [`$${value?.toFixed(2)}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "monospace", color: CHART.legendText }} />

                  {crosses.map((cross) => (
                    <ReferenceLine
                      key={`${cross.type}-${cross.date}`}
                      x={cross.date}
                      stroke={cross.type === "golden" ? GOLDEN_COLOR : DEATH_COLOR}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      label={{
                        value: cross.type === "golden" ? "☀" : "✕",
                        position: "top",
                        fill: cross.type === "golden" ? GOLDEN_COLOR : DEATH_COLOR,
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}
                    />
                  ))}

                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={CHART.price}
                    strokeWidth={2}
                    dot={false}
                    name="Price"
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ma50"
                    stroke={CHART.ma50}
                    strokeWidth={1.5}
                    dot={false}
                    name="MA 50"
                    strokeDasharray="5 3"
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ma200"
                    stroke={CHART.ma200}
                    strokeWidth={1.5}
                    dot={false}
                    name="MA 200"
                    strokeDasharray="8 4"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>

              {/* Cross legend */}
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono border border-border rounded-md p-3 bg-muted/40">
                <div className="flex gap-2">
                  <span style={{ color: GOLDEN_COLOR }} className="font-bold shrink-0">☀ Golden Cross</span>
                  <span className="text-muted-foreground">MA 50 crosses <em>above</em> MA 200 — bullish long-term signal; historically precedes sustained rallies</span>
                </div>
                <div className="flex gap-2">
                  <span style={{ color: DEATH_COLOR }} className="font-bold shrink-0">✕ Death Cross</span>
                  <span className="text-muted-foreground">MA 50 crosses <em>below</em> MA 200 — bearish long-term signal; historically precedes extended downtrends</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-mono mb-2 uppercase tracking-wider">
                RSI (14)
              </p>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={dataPoints} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fill: CHART.axis, fontSize: 10, fontFamily: "monospace" }}
                    axisLine={{ stroke: CHART.axisLine }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 30, 50, 70, 100]}
                    tick={{ fill: CHART.axis, fontSize: 10, fontFamily: "monospace" }}
                    axisLine={{ stroke: CHART.axisLine }}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: CHART.tooltipText }}
                    labelFormatter={(l) => formatDateLong(l)}
                    formatter={(value: number) => [value?.toFixed(1), "RSI"]}
                  />
                  <ReferenceLine y={70} stroke="hsl(0 72% 48%)" strokeDasharray="4 3" strokeWidth={1} />
                  <ReferenceLine y={30} stroke="hsl(142 55% 28%)" strokeDasharray="4 3" strokeWidth={1} />
                  <Area
                    type="monotone"
                    dataKey="rsi"
                    stroke={CHART.rsi}
                    fill={CHART.rsiFill}
                    strokeWidth={1.5}
                    dot={false}
                    name="RSI"
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1 px-10">
                <span style={{ color: "hsl(142 55% 28%)" }}>Oversold &lt;30</span>
                <span style={{ color: "hsl(35 80% 40%)" }}>Neutral 30–70</span>
                <span style={{ color: "hsl(0 72% 48%)" }}>Overbought &gt;70</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
