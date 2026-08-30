import { useMemo } from "react";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  useGetBuybackHistory,
  getGetBuybackHistoryQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Info } from "lucide-react";

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatShares(value: number | null | undefined): string {
  if (value === null || value === undefined) return "--";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e9) return (value / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (value / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (value / 1e3).toFixed(2) + "k";
  return value.toString();
}

function formatCurrency(
  value: number | null | undefined,
  currency = "USD",
): string {
  if (value === null || value === undefined) return "--";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

const COLORS = {
  outstanding: "hsl(var(--chart-1))",
  price: "hsl(var(--chart-3))",
  repurchased: "hsl(var(--success))",
  issued: "hsl(var(--destructive))",
  split: "hsl(38 92% 50%)",
};

const BuybacksTooltip = ({
  active,
  label,
  data,
  currency,
  splitMarkers,
}: any) => {
  if (!active || !label) return null;
  const pt = data.find((d: any) => d.date === label);
  if (!pt) return null;
  const splits = splitMarkers.filter(
    (split: any) => split.chartDate === label,
  );

  return (
    <div className="bg-popover border border-border text-popover-foreground rounded-md shadow-md p-3 text-xs font-mono min-w-[200px]">
      <div className="font-semibold mb-2 text-sm">
        {format(parseLocalDate(label), "MMM d, yyyy")}
      </div>
      <div className="space-y-2">
        {splits.map((split: any) => (
          <div
            key={`${split.date}-${split.label}`}
            className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-700 dark:text-amber-300"
          >
            <div className="font-semibold">{split.label}</div>
            <div className="text-[10px]">
              Effective {format(parseLocalDate(split.date), "MMM d, yyyy")}
            </div>
          </div>
        ))}
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-[1px]"
              style={{ backgroundColor: COLORS.outstanding }}
            />
            Outstanding
          </span>
          <span className="font-medium">
            {pt.sharesOutstanding != null
              ? formatShares(pt.sharesOutstanding)
              : "--"}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-[1px]"
              style={{ backgroundColor: COLORS.price }}
            />
            Price
          </span>
          <span className="font-medium">
            {pt.pricePerShare != null
              ? formatCurrency(pt.pricePerShare, currency)
              : "--"}
          </span>
        </div>

        <div className="h-px bg-border my-2" />

        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-[1px]"
              style={{ backgroundColor: COLORS.repurchased }}
            />
            Repurchased
          </span>
          <span className="font-medium">
            {pt.repurchasedShares != null
              ? formatShares(pt.repurchasedShares)
              : "--"}
          </span>
        </div>
        {pt.repurchaseQuality && pt.repurchaseQuality !== "unavailable" && (
          <div className="text-[10px] text-muted-foreground pl-3.5 -mt-1 uppercase tracking-wider">
            {pt.repurchaseQuality}
          </div>
        )}

        <div className="flex justify-between gap-4 mt-1">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-[1px]"
              style={{ backgroundColor: COLORS.issued }}
            />
            Issued
          </span>
          <span className="font-medium">
            {pt.issuedShares != null ? formatShares(pt.issuedShares) : "--"}
          </span>
        </div>
        {pt.issuanceQuality && pt.issuanceQuality !== "unavailable" && (
          <div className="text-[10px] text-muted-foreground pl-3.5 -mt-1 uppercase tracking-wider">
            {pt.issuanceQuality}
          </div>
        )}
      </div>
    </div>
  );
};

export default function BuybacksTab({ symbol }: { symbol: string }) {
  const { data, isLoading, isFetching, isError } = useGetBuybackHistory(
    symbol,
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetBuybackHistoryQueryKey(symbol),
      },
    }
  );

  const chartData = useMemo(() => {
    if (!data?.history) return [];
    return [...data.history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        negativeRepurchased: d.repurchasedShares ? -d.repurchasedShares : 0,
      }));
  }, [data]);

  const splitMarkers = useMemo(() => {
    if (!data?.stockSplits || chartData.length === 0) return [];
    return data.stockSplits
      .map((split) => {
        const chartDate =
          chartData.find((point) => point.date >= split.date)?.date ??
          chartData.at(-1)?.date;
        return chartDate ? { ...split, chartDate } : null;
      })
      .filter((split): split is NonNullable<typeof split> => split !== null);
  }, [data?.stockSplits, chartData]);

  const hasQuarterlyActivity = useMemo(
    () =>
      chartData.some(
        (point) =>
          point.repurchasedShares != null || point.issuedShares != null,
      ),
    [chartData],
  );

  const isLoadingState = isLoading || isFetching;

  if (isLoadingState) {
    return (
      <Card className="border-border">
        <CardHeader>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="w-full h-[300px]" />
            <Skeleton className="w-full h-[200px]" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mb-4 text-destructive" />
          <p>Failed to load capital returns history for {symbol}</p>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Info className="w-8 h-8 mb-4 opacity-50" />
          <p>No buyback or issuance history available for {symbol}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full min-w-0 overflow-hidden border-border">
      <CardHeader className="pb-4">
        <CardTitle>Capital Returns & Dilution</CardTitle>
        <div className="flex flex-col gap-2">
          <CardDescription>
            Quarterly track record of share repurchases and stock issuance, compared against total shares outstanding.
          </CardDescription>
          {data.coverage?.note && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded inline-flex w-fit items-center gap-1.5 border border-border mt-1">
              <Info className="w-3.5 h-3.5" />
              {data.coverage.note}
            </span>
          )}
          {splitMarkers.length > 0 && (
            <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-1 rounded inline-flex w-fit items-center gap-1.5 border border-amber-500/30">
              <Info className="w-3.5 h-3.5" />
              Split markers show when historical share counts were rebased.
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-3 sm:px-6">
        <div className="mb-5 flex flex-wrap gap-2 text-xs font-mono text-muted-foreground">
          <span className="rounded border border-border bg-muted/40 px-2 py-1">
            {data.coverage.quarterCount} quarters
          </span>
          {data.coverage.startDate && data.coverage.endDate && (
            <span className="rounded border border-border bg-muted/40 px-2 py-1">
              {format(parseLocalDate(data.coverage.startDate), "MMM yyyy")}–{format(parseLocalDate(data.coverage.endDate), "MMM yyyy")}
            </span>
          )}
          {data.coverage.estimatedQuarterCount > 0 && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
              {data.coverage.estimatedQuarterCount} quarters include estimates
            </span>
          )}
          {splitMarkers.length > 0 && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
              {splitMarkers.length} stock {splitMarkers.length === 1 ? "split" : "splits"}
            </span>
          )}
        </div>

        {/* Custom Legend */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs mb-6 px-2">
          <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
            <div
              className="w-3 h-3 rounded-[2px] opacity-80"
              style={{ backgroundColor: COLORS.outstanding }}
            />
            <span>Shares Outstanding (Level)</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
            <div
              className="w-3 h-3 rounded-[2px]"
              style={{ backgroundColor: COLORS.price }}
            />
            <span>Price (Right Axis)</span>
          </div>
          {hasQuarterlyActivity && (
            <>
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                <div
                  className="w-3 h-3 rounded-[2px]"
                  style={{ backgroundColor: COLORS.repurchased }}
                />
                <span>Repurchased (Quarterly)</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                <div
                  className="w-3 h-3 rounded-[2px]"
                  style={{ backgroundColor: COLORS.issued }}
                />
                <span>Issued (Quarterly)</span>
              </div>
            </>
          )}
          {splitMarkers.length > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
              <div
                className="h-4 border-l border-dashed"
                style={{ borderColor: COLORS.split }}
              />
              <span>Stock Split</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* Top Chart: Outstanding & Price */}
          <div
            className="h-[280px] w-full min-w-0 overflow-hidden"
            role="img"
            aria-label={`${symbol} shares outstanding and price per share by quarter${splitMarkers.length > 0 ? `, with ${splitMarkers.length} stock split marker${splitMarkers.length === 1 ? "" : "s"}` : ""}`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={0}>
              <ComposedChart
                data={chartData}
                syncId="buybacks"
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorOutstanding" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.outstanding} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={COLORS.outstanding} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.4}
                />
                <XAxis dataKey="date" hide={true} />
                <YAxis
                  yAxisId="left"
                  width={65}
                  tickFormatter={(v) => formatShares(v)}
                  domain={["auto", "auto"]}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  width={65}
                  tickFormatter={(v) => `$${v}`}
                  domain={["auto", "auto"]}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <Tooltip
                  content={
                    <BuybacksTooltip
                      data={chartData}
                      currency={data.currency ?? "USD"}
                      splitMarkers={splitMarkers}
                    />
                  }
                  isAnimationActive={false}
                  cursor={{ fill: "rgba(0,0,0,0.05)" }}
                />
                {splitMarkers.map((split) => (
                  <ReferenceLine
                    key={`${split.date}-outstanding`}
                    yAxisId="left"
                    x={split.chartDate}
                    stroke={COLORS.split}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{
                      value: split.label,
                      position: "insideTopRight",
                      fill: COLORS.split,
                      fontSize: 10,
                    }}
                  />
                ))}
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="sharesOutstanding"
                  fill="url(#colorOutstanding)"
                  stroke={COLORS.outstanding}
                  strokeWidth={2}
                  isAnimationActive={false}
                  fillOpacity={1}
                  connectNulls={true}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pricePerShare"
                  stroke={COLORS.price}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={true}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom Chart: Quarterly Activity (Bars) */}
          {hasQuarterlyActivity ? (
            <div
              className="h-[200px] w-full min-w-0 overflow-hidden"
              role="img"
              aria-label={`${symbol} shares issued and repurchased by quarter${splitMarkers.length > 0 ? `, with stock split periods identified` : ""}`}
            >
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={0}>
              <BarChart
                data={chartData}
                syncId="buybacks"
                margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                stackOffset="sign"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => format(parseLocalDate(v), "MMM ''yy")}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  minTickGap={30}
                />
                <YAxis
                  yAxisId="left"
                  width={65}
                  tickFormatter={(v) => formatShares(Math.abs(v))}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  width={65}
                  tick={false}
                  axisLine={false}
                />
                <Tooltip
                  content={
                    <BuybacksTooltip
                      data={chartData}
                      currency={data.currency ?? "USD"}
                      splitMarkers={splitMarkers}
                    />
                  }
                  isAnimationActive={false}
                  cursor={{ fill: "rgba(0,0,0,0.05)" }}
                />
                <ReferenceLine yAxisId="left" y={0} stroke="hsl(var(--border))" />
                {splitMarkers.map((split) => (
                  <ReferenceLine
                    key={`${split.date}-activity`}
                    yAxisId="left"
                    x={split.chartDate}
                    stroke={COLORS.split}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                  />
                ))}
                <Bar
                  yAxisId="left"
                  dataKey="issuedShares"
                  fill={COLORS.issued}
                  stackId="stack"
                  isAnimationActive={false}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  yAxisId="left"
                  dataKey="negativeRepurchased"
                  fill={COLORS.repurchased}
                  stackId="stack"
                  isAnimationActive={false}
                  radius={[0, 0, 2, 2]}
                />
              </BarChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <div
              className="flex h-[160px] w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-6 text-center text-muted-foreground"
              role="status"
            >
              <Info className="mb-3 h-6 w-6 opacity-60" />
              <p className="text-sm font-medium">
                Quarterly repurchase and issuance quantities are not available
              </p>
              <p className="mt-1 max-w-xl text-xs">
                The shares outstanding and price history above still reflects
                the available SEC filings for {symbol}.
              </p>
            </div>
          )}
        </div>

        <details className="mt-6 rounded-md border border-border bg-muted/20">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            View accessible quarterly data table
          </summary>
          <div className="max-h-[420px] overflow-auto border-t border-border">
            <table className="w-full min-w-[820px] text-left text-xs">
              <caption className="sr-only">
                Quarterly shares outstanding, price, repurchases, issuance, and stock split events for {symbol}
              </caption>
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Quarter</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Outstanding</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Repurchased</th>
                  <th scope="col" className="px-3 py-2 font-medium">Repurchase source</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Issued</th>
                  <th scope="col" className="px-3 py-2 font-medium">Issuance source</th>
                  <th scope="col" className="px-3 py-2 font-medium">Stock split</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...chartData].reverse().map((point) => {
                  const rowSplits = splitMarkers.filter(
                    (split) => split.chartDate === point.date,
                  );
                  return (
                  <tr key={point.date}>
                    <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium">
                      {format(parseLocalDate(point.date), "MMM d, yyyy")}
                    </th>
                    <td className="px-3 py-2 text-right font-mono">{formatShares(point.sharesOutstanding)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatCurrency(point.pricePerShare, data.currency ?? "USD")}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatShares(point.repurchasedShares)}</td>
                    <td className="px-3 py-2 capitalize">{point.repurchaseQuality}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatShares(point.issuedShares)}</td>
                    <td className="px-3 py-2 capitalize">{point.issuanceQuality}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {rowSplits.length > 0
                        ? rowSplits
                            .map(
                              (split) =>
                                `${split.label} (${format(parseLocalDate(split.date), "MMM d, yyyy")})`,
                            )
                            .join(", ")
                        : "--"}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
