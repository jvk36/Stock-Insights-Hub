import { useState, useMemo } from "react";
import {
  useGetInsiderTransactions,
  getGetInsiderTransactionsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatDate } from "@/lib/format";

type FilterMode = "all" | "open-market" | "buys" | "sells";

function formatNumber(n: number | null | undefined, compact = false): string {
  if (n == null) return "—";
  if (compact && Math.abs(n) >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(1)}M`;
  if (compact && Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatPrice(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return `$${n.toFixed(2)}`;
}

function SignalBadge({ level, code }: { level: string; code: string }) {
  if (level === "high") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
        <TrendingUp className="w-3.5 h-3.5" />
        Buy
      </span>
    );
  }
  if (level === "moderate") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400">
        <TrendingDown className="w-3.5 h-3.5" />
        Sale
      </span>
    );
  }
  if (level === "low") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
        <Minus className="w-3 h-3" />
        {code === "M" || code === "O" || code === "X" ? "Option" : code}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">{code || "—"}</span>
  );
}

export default function InsiderTransactions({ symbol }: { symbol: string }) {
  const [filter, setFilter] = useState<FilterMode>("open-market");

  const { data, isLoading } = useGetInsiderTransactions(symbol, {
    query: {
      enabled: !!symbol,
      queryKey: getGetInsiderTransactionsQueryKey(symbol),
    },
  });

  const filtered = useMemo(() => {
    if (!data?.transactions) return [];
    let txs = data.transactions;
    if (filter === "open-market") {
      txs = txs.filter((t) => t.signalLevel === "high" || t.signalLevel === "moderate");
    } else if (filter === "buys") {
      txs = txs.filter((t) => t.signalLevel === "high");
    } else if (filter === "sells") {
      txs = txs.filter((t) => t.signalLevel === "moderate");
    }
    return txs;
  }, [data, filter]);

  const filterButtons: Array<{ id: FilterMode; label: string }> = [
    { id: "open-market", label: "Open Market" },
    { id: "buys", label: "Buys Only" },
    { id: "sells", label: "Sells Only" },
    { id: "all", label: "All Transactions" },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pb-3">
        <div className="flex-1">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Insider Transactions (Form 4)
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Source: SEC EDGAR · 10% passive owners excluded
          </p>
        </div>
        {data?.cik && (
          <a
            href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${data.cik}&type=4&dateb=&owner=include&count=40`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors shrink-0"
          >
            All Filings <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </CardHeader>

      {/* Filter Buttons */}
      <div className="px-6 pb-4 flex flex-wrap gap-2">
        {filterButtons.map((btn) => (
          <Button
            key={btn.id}
            variant={filter === btn.id ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(btn.id)}
            className="h-7 text-xs"
          >
            {btn.label}
          </Button>
        ))}
      </div>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {data?.transactions && data.transactions.length > 0
              ? "No transactions match the current filter."
              : "No insider transactions found."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="w-[100px] whitespace-nowrap">Date</TableHead>
                  <TableHead>Insider</TableHead>
                  <TableHead className="hidden md:table-cell">Title</TableHead>
                  <TableHead className="w-[90px]">Signal</TableHead>
                  <TableHead className="hidden sm:table-cell w-[160px]">Type</TableHead>
                  <TableHead className="text-right w-[100px]">Shares</TableHead>
                  <TableHead className="hidden lg:table-cell text-right w-[90px]">Price</TableHead>
                  <TableHead className="text-right w-[100px]">Value</TableHead>
                  <TableHead className="hidden md:table-cell w-[40px] text-right">
                    <ExternalLink className="w-3.5 h-3.5 inline" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx) => {
                  const rowBg =
                    tx.signalLevel === "high"
                      ? "hover:bg-emerald-950/20"
                      : tx.signalLevel === "moderate"
                      ? "hover:bg-rose-950/20"
                      : "hover:bg-muted/20";

                  return (
                    <TableRow key={tx.id} className={`border-border ${rowBg}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {tx.date ? formatDate(tx.date) : "—"}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium leading-tight capitalize">
                            {tx.insiderName.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {tx.isDirector && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 text-blue-400 border-blue-400/30">
                                Dir
                              </Badge>
                            )}
                            {tx.isOfficer && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 text-violet-400 border-violet-400/30">
                                Officer
                              </Badge>
                            )}
                            {tx.isTenPercentOwner && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 text-amber-400 border-amber-400/30">
                                10%
                              </Badge>
                            )}
                            {tx.is10b51Plan && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 text-muted-foreground border-muted-foreground/30">
                                10b5-1
                              </Badge>
                            )}
                            {tx.ownership === "I" && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 text-orange-400 border-orange-400/30">
                                {tx.natureOfOwnership ? tx.natureOfOwnership.slice(0, 12) : "Indirect"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[180px] truncate">
                        {tx.title ?? "—"}
                      </TableCell>

                      <TableCell>
                        <SignalBadge level={tx.signalLevel} code={tx.transactionCode} />
                      </TableCell>

                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {tx.transactionType}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs">
                        {tx.shares != null ? tx.shares.toLocaleString() : "—"}
                      </TableCell>

                      <TableCell className="hidden lg:table-cell text-right font-mono text-xs">
                        {formatPrice(tx.pricePerShare)}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs">
                        {tx.totalValue != null
                          ? formatNumber(tx.totalValue, true)
                          : "—"}
                      </TableCell>

                      <TableCell className="hidden md:table-cell text-right">
                        <a
                          href={tx.formUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary transition-colors inline-flex"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && data?.transactions && (
          <div className="px-6 py-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {filtered.length} of {data.transactions.length} transactions
            </span>
            <span className="text-xs text-muted-foreground">
              Signal: <span className="text-emerald-400">P=Buy</span> ·{" "}
              <span className="text-rose-400">S=Sale</span> ·{" "}
              <span className="text-amber-400">M=Option</span> ·{" "}
              <span>A/G/F=Non-market</span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
