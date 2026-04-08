import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatCurrency } from "@/lib/format";
import type { StockQuote } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function SummaryStats({ symbol, quote, isLoading }: { symbol: string, quote?: StockQuote, isLoading: boolean }) {
  const StatItem = ({ label, value }: { label: string, value: React.ReactNode }) => (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-medium text-right">{value}</span>
    </div>
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Key Statistics</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 pb-6">
            <StatItem label="Previous Close" value={formatCurrency(quote?.previousClose)} />
            <StatItem label="Open" value={formatCurrency(quote?.open)} />
            <StatItem label="Day's Range" value={`${formatCurrency(quote?.dayLow)} - ${formatCurrency(quote?.dayHigh)}`} />
            <StatItem label="52 Week Range" value={`${formatCurrency(quote?.fiftyTwoWeekLow)} - ${formatCurrency(quote?.fiftyTwoWeekHigh)}`} />
            <StatItem label="Volume" value={formatNumber(quote?.volume)} />
            <StatItem label="Avg. Volume" value={formatNumber(quote?.averageVolume)} />
            <StatItem label="Market Cap" value={formatNumber(quote?.marketCap)} />
            <StatItem label="Enterprise Value" value={formatNumber(quote?.enterpriseValue)} />
            <StatItem label="P/E Ratio (TTM)" value={quote?.trailingPE?.toFixed(2) || "-"} />
            <StatItem label="P/E Ratio (Fwd)" value={quote?.forwardPE?.toFixed(2) || "-"} />
            <StatItem label="Dividend Yield" value={quote?.dividendYield ? `${(quote.dividendYield * 100).toFixed(2)}%` : "-"} />
            <StatItem label="Beta" value={quote?.beta?.toFixed(2) || "-"} />
            <StatItem label="Profit Margins" value={quote?.profitMargins ? `${(quote.profitMargins * 100).toFixed(2)}%` : "-"} />
            <StatItem label="Price to Book" value={quote?.priceToBook?.toFixed(2) || "-"} />
            <StatItem label="Net Debt" value={formatNumber(quote?.netDebt)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
