import { useState, useMemo } from "react";
import {
  useGetInsiderTransactions,
  getGetInsiderTransactionsQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, ExternalLink, Filter, Search, Info, Landmark, Settings, ShieldAlert } from "lucide-react";
import { formatDate } from "@/lib/format";

type FilterMode = "relevant" | "all" | "open-market-buys" | "open-market-sells" | "10b51" | "compensation";

function formatShares(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

function formatPrice(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function formatValueCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function titleCaseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function InsiderActivityTab({ symbol }: { symbol: string }) {
  const [filter, setFilter] = useState<FilterMode>("relevant");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useGetInsiderTransactions(symbol, {
    query: {
      enabled: !!symbol,
      queryKey: getGetInsiderTransactionsQueryKey(symbol),
    },
  });

  const filteredData = useMemo(() => {
    if (!data?.transactions) return [];
    let txs = data.transactions;

    if (search.trim()) {
      const q = search.toLowerCase();
      txs = txs.filter((t) =>
        t.beneficialOwner.toLowerCase().includes(q) ||
        t.insiderName.toLowerCase().includes(q) ||
        t.title?.toLowerCase().includes(q),
      );
    }

    switch (filter) {
      case "relevant":
        txs = txs.filter(
          (t) =>
            t.signalLevel === "high" ||
            t.signalLevel === "moderate" ||
            t.is10b51Plan ||
            t.isCompensationRelated,
        );
        break;
      case "open-market-buys":
        txs = txs.filter((t) => t.signalLevel === "high" && !t.is10b51Plan && !t.isCompensationRelated);
        break;
      case "open-market-sells":
        txs = txs.filter((t) => t.signalLevel === "moderate" && !t.is10b51Plan && !t.isCompensationRelated);
        break;
      case "10b51":
        txs = txs.filter((t) => t.is10b51Plan);
        break;
      case "compensation":
        txs = txs.filter((t) => t.isCompensationRelated);
        break;
    }

    return txs;
  }, [data, filter, search]);

  if (isError) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mb-4 text-destructive" />
          <p>Failed to load insider transactions for {symbol}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full min-w-0 overflow-hidden border-border" data-testid="card-insider-activity">
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <CardTitle>Insider Activity (Form 4)</CardTitle>
            <CardDescription className="mt-1">
              Recent SEC filings from executives, directors, and 10% owners.
            </CardDescription>
          </div>
          {data?.cik && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-8 text-xs font-mono"
              asChild
              data-testid="link-all-filings"
            >
              <a
                href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${data.cik}&type=4&dateb=&owner=include&count=40`}
                target="_blank"
                rel="noopener noreferrer"
              >
                SEC EDGAR Search
                <ExternalLink className="w-3.5 h-3.5 ml-2" />
              </a>
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-6">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search insider name or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm w-full bg-background"
              data-testid="input-insider-search"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar" data-testid="group-insider-filters">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0 ml-1 mr-1" />
            <Button
              variant={filter === "relevant" ? "default" : "secondary"}
              size="sm"
              onClick={() => setFilter("relevant")}
              className="h-8 text-xs whitespace-nowrap"
              data-testid="button-filter-relevant"
            >
              Relevant Activity
            </Button>
            <Button
              variant={filter === "all" ? "default" : "secondary"}
              size="sm"
              onClick={() => setFilter("all")}
              className="h-8 text-xs whitespace-nowrap"
              data-testid="btn-filter-all"
            >
              All Activity
            </Button>
            <Button
              variant={filter === "open-market-buys" ? "default" : "secondary"}
              size="sm"
              onClick={() => setFilter("open-market-buys")}
              className="h-8 text-xs whitespace-nowrap"
              data-testid="btn-filter-buys"
            >
              Open Market Buys
            </Button>
            <Button
              variant={filter === "open-market-sells" ? "default" : "secondary"}
              size="sm"
              onClick={() => setFilter("open-market-sells")}
              className="h-8 text-xs whitespace-nowrap"
              data-testid="btn-filter-sells"
            >
              Open Market Sells
            </Button>
            <Button
              variant={filter === "10b51" ? "default" : "secondary"}
              size="sm"
              onClick={() => setFilter("10b51")}
              className="h-8 text-xs whitespace-nowrap"
              data-testid="btn-filter-10b51"
            >
              10b5-1 Plans
            </Button>
            <Button
              variant={filter === "compensation" ? "default" : "secondary"}
              size="sm"
              onClick={() => setFilter("compensation")}
              className="h-8 text-xs whitespace-nowrap"
              data-testid="btn-filter-compensation"
            >
              Grants & Options
            </Button>
          </div>
        </div>
        <div
          className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs text-muted-foreground"
          data-testid="status-insider-context-note"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <p>
            Plan-based and compensation-related transactions are shown for context,
            but should not be read as standalone sentiment signals. Holdings and
            percentages reflect the beneficial owner's position reported in that filing.
          </p>
        </div>
        {data?.coverage.isPartial && (
          <div
            className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
            role="status"
            data-testid="status-insider-partial-coverage"
          >
            {data.coverage.source === "sec" ? (
              <>
                Showing {data.coverage.fetchedFilings} of{" "}
                {data.coverage.availableFilings} available recent filing records.
                {data.coverage.failedFilings > 0
                  ? ` ${data.coverage.failedFilings} requested filing${
                      data.coverage.failedFilings === 1 ? "" : "s"
                    } could not be loaded.`
                  : " Older filings are outside this view."}
              </>
            ) : (
              <>Limited fallback data is shown because SEC ownership records were unavailable.</>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3" data-testid="loading-insider-skeleton">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground" data-testid="empty-insider-state">
            <Info className="w-8 h-8 mb-4 mx-auto opacity-50" />
            <p>No transactions match the current filters.</p>
            {filter !== "all" && (
              <Button variant="link" onClick={() => setFilter("all")} className="mt-2 text-primary h-auto p-0">
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[400px]">
            <Table data-testid="table-insider-transactions">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-y border-border">
                  <TableHead className="w-[100px] whitespace-nowrap text-xs">Date</TableHead>
                  <TableHead className="min-w-[200px] text-xs">Beneficial Owner</TableHead>
                  <TableHead className="min-w-[200px] text-xs">Transaction Details</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-xs">Shares</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-xs hidden lg:table-cell">Price</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-xs">Value</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-xs hidden md:table-cell">Post-Tx Holdings</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((tx) => {
                  const isHighSignalBuy = tx.signalLevel === "high" && !tx.is10b51Plan && !tx.isCompensationRelated;
                  const isHighSignalSell = tx.signalLevel === "moderate" && !tx.is10b51Plan && !tx.isCompensationRelated;
                  
                  const rowBg = isHighSignalBuy
                    ? "bg-emerald-500/5 hover:bg-emerald-500/10 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15"
                    : isHighSignalSell
                    ? "bg-rose-500/5 hover:bg-rose-500/10 dark:bg-rose-500/10 dark:hover:bg-rose-500/15"
                    : "hover:bg-muted/30";

                  return (
                    <TableRow key={tx.id} className={`border-b border-border ${rowBg}`} data-testid={`row-insider-${tx.id}`}>
                      <TableCell className="align-top py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {tx.date ? formatDate(tx.date) : "—"}
                      </TableCell>

                      <TableCell className="align-top py-3">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-sm font-semibold leading-none text-foreground capitalize">
                             {titleCaseName(tx.beneficialOwner)}
                          </span>
                          {tx.title && (
                            <span className="text-xs text-muted-foreground leading-tight line-clamp-1" title={tx.title}>
                              {tx.title}
                            </span>
                          )}
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {tx.isDirector && (
                              <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 py-0 font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
                                Director
                              </Badge>
                            )}
                            {tx.isOfficer && (
                              <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 py-0 font-medium bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
                                Officer
                              </Badge>
                            )}
                            {tx.isTenPercentOwner && (
                              <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 py-0 font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
                                10% Owner
                              </Badge>
                            )}
                            {tx.ownership === "I" && (
                              <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 py-0 font-medium bg-muted text-muted-foreground border-border flex items-center gap-1">
                                <Landmark className="w-2.5 h-2.5" />
                                {tx.natureOfOwnership ? tx.natureOfOwnership.slice(0, 15) + (tx.natureOfOwnership.length > 15 ? '...' : '') : "Indirect"}
                              </Badge>
                            )}
                          </div>
                           <div className="mt-1 text-[11px] text-muted-foreground md:hidden">
                             Holds {formatShares(tx.holdingSharesAfter)}
                             {tx.activityPctOfHoldings != null
                               ? ` · ${tx.activityPctOfHoldings.toFixed(1)}% of prior holding`
                               : ""}
                           </div>
                        </div>
                      </TableCell>

                      <TableCell className="align-top py-3">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium leading-none">
                              {tx.transactionType}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              ({tx.transactionCode})
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {tx.is10b51Plan && (
                              <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5 py-0 bg-muted/60 text-muted-foreground flex items-center gap-1">
                                <Settings className="w-2.5 h-2.5" />
                                10b5-1 Auto
                              </Badge>
                            )}
                            {tx.isCompensationRelated && (
                              <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5 py-0 bg-muted/60 text-muted-foreground">
                                {tx.compensationReason || "Compensation"}
                              </Badge>
                            )}
                            {tx.contextFlags
                              ?.filter(
                                (flag) =>
                                  !flag.toLowerCase().includes("10b5-1") &&
                                  flag !== tx.compensationReason,
                              )
                              .map((flag, idx) => (
                              <Badge key={idx} variant="secondary" className="text-[10px] h-[18px] px-1.5 py-0 bg-muted/60 text-muted-foreground">
                                {flag}
                              </Badge>
                              ))}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="align-top py-3 text-right">
                        <div className="flex flex-col items-end">
                           <span className={`font-mono text-sm font-medium ${["P", "A", "M"].includes(tx.transactionCode) ? "text-emerald-600 dark:text-emerald-400" : ["S", "F", "D"].includes(tx.transactionCode) ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                             {formatShares(tx.shares)}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="align-top py-3 text-right hidden lg:table-cell">
                        <span className="font-mono text-sm text-muted-foreground">
                          {formatPrice(tx.pricePerShare)}
                        </span>
                      </TableCell>

                      <TableCell className="align-top py-3 text-right">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {formatValueCompact(tx.totalValue)}
                        </span>
                      </TableCell>

                      <TableCell className="align-top py-3 text-right hidden md:table-cell">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono text-sm text-muted-foreground">
                            {formatShares(tx.holdingSharesAfter)}
                          </span>
                          {tx.activityPctOfHoldings != null && tx.activityPctOfHoldings !== 0 && (
                            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted/40 rounded-sm inline-block">
                               {(tx.activityPctOfHoldings).toFixed(1)}% of prior holding
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="align-top py-3 text-right">
                        <a
                          href={tx.formUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-md transition-colors"
                          aria-label="View Form 4 filing"
                          title="View SEC filing"
                          data-testid={`link-form4-${tx.id}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && filteredData.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground flex flex-col sm:flex-row justify-between items-center gap-2">
            <span>
              Showing <span className="font-medium text-foreground">{filteredData.length}</span> transaction{filteredData.length !== 1 ? 's' : ''}
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1 justify-center">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Open Market Buy
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> Open Market Sell
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-muted border border-border"></span> Auto / Comp
              </span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}