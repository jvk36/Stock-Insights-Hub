import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetMacroSeriesObservations,
  getGetMacroSeriesObservationsQueryKey,
} from "@workspace/api-client-react";
import type { GetMacroSeriesObservationsUnits } from "@workspace/api-client-react";

interface IndicatorChartModalProps {
  open: boolean;
  onClose: () => void;
  seriesId: string;
  title: string;
  chartUnits: string;
  unitsLabel: string;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

function formatValue(v: number | null | undefined, unitsLabel: string): string {
  if (v == null) return "N/A";
  if (unitsLabel.includes("$M") || unitsLabel.includes("K")) {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}B` : v.toFixed(0);
  }
  return `${v.toFixed(2)}`;
}

export default function IndicatorChartModal({
  open,
  onClose,
  seriesId,
  title,
  chartUnits,
  unitsLabel,
}: IndicatorChartModalProps) {
  const { data, isLoading, isError } = useGetMacroSeriesObservations(
    seriesId,
    { units: chartUnits as GetMacroSeriesObservationsUnits, limit: 240 },
    {
      query: {
        enabled: open && !!seriesId,
        queryKey: getGetMacroSeriesObservationsQueryKey(seriesId, {
          units: chartUnits as GetMacroSeriesObservationsUnits,
          limit: 240,
        }),
        staleTime: 10 * 60 * 1000,
      },
    }
  );

  const chartData = useMemo(() => {
    if (!data?.observations) return [];
    return data.observations
      .filter((o) => o.value != null)
      .map((o) => ({
        date: o.date,
        value: o.value,
        label: formatDate(o.date),
      }));
  }, [data?.observations]);

  const yMin = useMemo(() => {
    const vals = chartData.map((d) => d.value as number);
    if (!vals.length) return "auto";
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const padding = (max - min) * 0.1;
    return parseFloat((min - padding).toFixed(2));
  }, [chartData]);

  const yMax = useMemo(() => {
    const vals = chartData.map((d) => d.value as number);
    if (!vals.length) return "auto";
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const padding = (max - min) * 0.1;
    return parseFloat((max + padding).toFixed(2));
  }, [chartData]);

  const ticks = useMemo(() => {
    if (chartData.length < 2) return [];
    const step = Math.max(1, Math.floor(chartData.length / 8));
    return chartData
      .filter((_, i) => i % step === 0 || i === chartData.length - 1)
      .map((d) => d.date);
  }, [chartData]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">Units: {unitsLabel} · FRED Series: {seriesId}</p>
        </DialogHeader>

        <div className="mt-2 h-72">
          {isLoading && (
            <div className="space-y-2 pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}
          {isError && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Failed to load chart data
            </div>
          )}
          {!isLoading && !isError && chartData.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No data available
            </div>
          )}
          {!isLoading && !isError && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="macroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  ticks={ticks}
                  tickFormatter={formatDate}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatValue(v, unitsLabel)}
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelFormatter={(label) => formatDate(String(label))}
                  formatter={(value) => [
                    `${(value as number).toFixed(2)} ${unitsLabel}`,
                    title,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  fill="url(#macroGrad)"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
