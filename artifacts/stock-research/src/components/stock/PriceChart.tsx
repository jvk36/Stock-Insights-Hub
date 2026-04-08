import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetStockChart, getGetStockChartQueryKey } from "@workspace/api-client-react";
import type { GetStockChartRange } from "@workspace/api-client-react";

export default function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<GetStockChartRange>("1y");

  const { data, isLoading } = useGetStockChart(symbol, { range }, {
    query: {
      enabled: !!symbol,
      queryKey: getGetStockChartQueryKey(symbol, { range })
    }
  });

  const ranges: { label: string, value: GetStockChartRange }[] = [
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

  // Determine if the trend is positive or negative for coloring
  const isPositive = data?.data && data.data.length >= 2 
    ? (data.data[data.data.length - 1].close || 0) >= (data.data[0].close || 0)
    : true;
    
  const strokeColor = isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))";
  const fillColor = isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))";

  return (
    <Card className="bg-card border-border w-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">Price History</CardTitle>
        <div className="flex gap-1 flex-wrap justify-end">
          {ranges.map((r) => (
            <Button
              key={r.value}
              variant={range === r.value ? "default" : "ghost"}
              size="sm"
              className={`h-7 px-2 text-xs font-mono ${range === r.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full mt-4">
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground font-mono">Loading chart data...</div>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground font-mono">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={fillColor} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={fillColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    if (range === "1d" || range === "5d") {
                      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }
                    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: range === 'max' ? 'numeric' : undefined });
                  }}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickMargin={10}
                  minTickGap={30}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  domain={['auto', 'auto']} 
                  tickFormatter={(val) => `$${val}`}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickMargin={10}
                  axisLine={false}
                  tickLine={false}
                  orientation="right"
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: strokeColor }}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Close']}
                  labelFormatter={(label) => new Date(label).toLocaleString()}
                />
                <Area 
                  type="monotone" 
                  dataKey="close" 
                  stroke={strokeColor} 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorClose)" 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
