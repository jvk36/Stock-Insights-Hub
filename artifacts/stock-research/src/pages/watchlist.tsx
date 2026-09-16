import React, { useState } from "react";
import { 
  useListWatchlist, 
  useGetWatchlistMetrics, 
  useRemoveFromWatchlist, 
  useAddToWatchlist,
  getListWatchlistQueryKey,
  getGetWatchlistMetricsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChartModal } from "../components/watchlist/ChartModal";
import { Link } from "wouter";
import { TrendingUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Plus, Loader2 } from "lucide-react";
import {
  getPeColor, getEpsGrowthColor, getDebtEquityColor, getMaColor,
  getRsiColor, getShortInterestColor, getPutCallColor,
  formatNum, formatPct, formatCurrency
} from "@/lib/color-utils";

const COL_COUNT = 13;

export default function Watchlist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [newTicker, setNewTicker] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<{ticker: string, name?: string | null} | null>(null);

  const { data: watchlist, isLoading: loadingWatchlist } = useListWatchlist();
  const { data: metrics, isLoading: loadingMetrics } = useGetWatchlistMetrics({ query: { queryKey: getGetWatchlistMetricsQueryKey(), refetchInterval: 20 * 60 * 1000 } });

  const addMutation = useAddToWatchlist({
    mutation: {
      onSuccess: () => {
        setNewTicker("");
        queryClient.invalidateQueries({ queryKey: getListWatchlistQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetWatchlistMetricsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to add ticker", description: (err as any)?.message || String(err), variant: "destructive" });
      }
    }
  });

  const removeMutation = useRemoveFromWatchlist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWatchlistQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetWatchlistMetricsQueryKey() });
      }
    }
  });

  const handleAdd = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTicker.trim()) return;
    addMutation.mutate({ data: { ticker: newTicker.toUpperCase() } });
  };

  const isLoading = loadingWatchlist || loadingMetrics;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 min-h-14 py-2 flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground tracking-tight">Terminal</span>
          </div>

          <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto md:order-none md:w-auto">
            <Link
              href="/macro"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap"
            >
              Macro Summary
            </Link>
            <Link
              href="/13f"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap"
            >
              Top Hedge Funds - Insights
            </Link>
            <Link
              href="/indexes"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap"
            >
              Stock Screens
            </Link>
            <Link
              href="/stock"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap"
            >
              Stock Insights
            </Link>
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none whitespace-nowrap">
              Stock Watch
            </span>
          </nav>

          <div className="hidden flex-1 md:block" />

          <form onSubmit={handleAdd} className="relative ml-auto w-36 md:w-44 flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              placeholder="Add Ticker..."
              className="w-full pl-9 bg-background border-border font-mono h-9 uppercase text-sm pr-10"
              data-testid="input-ticker"
            />
            <button 
              type="submit" 
              disabled={addMutation.isPending || !newTicker.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              data-testid="button-add"
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono uppercase">
            Stock Watchlist <span className="text-primary">Supercharger</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Professional high-density terminal view</p>
        </div>


        <main className="bg-card border border-border rounded-md shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse whitespace-nowrap">
              <thead className="text-xs uppercase bg-muted/50 text-muted-foreground font-mono">
                <tr>
                  <th className="px-4 py-3 font-semibold border-b border-border sticky left-0 z-10 bg-card">Ticker</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">Price</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">P/E (Fwd)</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">EPS Gr (YoY)</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">Debt/Eq</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">200d MA</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">50d MA</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">RSI</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">Short Int</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">Put/Call</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">Beta</th>
                  <th className="px-4 py-3 font-semibold border-b border-border">IV</th>
                  <th className="px-4 py-3 font-semibold border-b border-border text-center">Act</th>
                </tr>
              </thead>
              <tbody className="font-mono divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: COL_COUNT }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full bg-muted" /></td>
                      ))}
                    </tr>
                  ))
                ) : !watchlist || watchlist.length === 0 ? (
                  <tr>
                    <td colSpan={COL_COUNT} className="px-4 py-12 text-center text-muted-foreground">
                      <p>No stocks in your watchlist.</p>
                      <p className="text-xs mt-1">Add your first stock ticker above to get started.</p>
                    </td>
                  </tr>
                ) : (
                  watchlist.map((entry) => {
                    const m = metrics?.find(m => m.ticker === entry.ticker);
                    if (!m) return (
                      <tr key={entry.id} data-testid={`row-stock-${entry.ticker}`}>
                        <td className="px-4 py-2 sticky left-0 z-10 bg-card border-r border-border font-bold">{entry.ticker}</td>
                        <td colSpan={COL_COUNT - 2} className="px-4 py-2 text-muted-foreground text-xs"><Skeleton className="h-5 w-24 bg-muted" /></td>
                        <td className="px-4 py-2 text-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => removeMutation.mutate({ id: entry.id })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );

                    return (
                      <tr key={entry.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-stock-${entry.ticker}`}>
                        <td className="px-4 py-2 sticky left-0 z-10 bg-card border-r border-border transition-colors group-hover:bg-muted/20">
                          <button 
                            className="text-primary font-bold hover:underline cursor-pointer flex flex-col text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                            onClick={() => setSelectedTicker({ ticker: m.ticker, name: m.companyName })}
                            data-testid={`cell-ticker-${entry.ticker}`}
                          >
                            <span>{m.ticker}</span>
                            {m.companyName && <span className="text-[10px] text-muted-foreground font-sans font-normal truncate max-w-[120px]">{m.companyName}</span>}
                          </button>
                        </td>
                        <td className="px-4 py-2">{formatCurrency(m.currentPrice)}</td>
                        <td className={`px-4 py-2 text-right ${getPeColor(m.peRatioForward)}`}>{formatNum(m.peRatioForward)}</td>
                        <td className={`px-4 py-2 text-right ${getEpsGrowthColor(m.epsGrowthYoy)}`}>{formatPct(m.epsGrowthYoy)}</td>
                        <td className={`px-4 py-2 text-right ${getDebtEquityColor(m.debtToEquity)}`}>{formatNum(m.debtToEquity)}</td>
                        <td className={`px-4 py-2 text-right ${getMaColor(m.currentPrice, m.ma200)}`}>{formatNum(m.ma200)}</td>
                        <td className={`px-4 py-2 text-right ${getMaColor(m.currentPrice, m.ma50)}`}>{formatNum(m.ma50)}</td>
                        <td className={`px-4 py-2 text-right ${getRsiColor(m.rsi)}`}>{formatNum(m.rsi, 1)}</td>
                        <td className={`px-4 py-2 text-right ${getShortInterestColor(m.shortInterestPct)}`}>{formatPct(m.shortInterestPct)}</td>
                        <td className={`px-4 py-2 text-right ${getPutCallColor(m.putCallRatio)}`}>{formatNum(m.putCallRatio)}</td>
                        <td className="px-4 py-2 text-right">{formatNum(m.beta)}</td>
                        <td className="px-4 py-2 text-right">{m.impliedVolatility != null ? formatPct(m.impliedVolatility) : "N/A"}</td>
                        <td className="px-4 py-2 text-center">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeMutation.mutate({ id: entry.id })}
                            disabled={removeMutation.isPending}
                            data-testid={`button-delete-${entry.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove {entry.ticker}</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>

        <div className="space-y-4 pt-3 border-t border-border text-xs font-mono text-muted-foreground">

          {/* Color key + per-column thresholds */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">Color Key</p>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(142,76%,36%)] rounded-sm shrink-0"></span> Bullish / Healthy</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(45,93%,47%)] rounded-sm shrink-0"></span> Neutral / Warning</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(0,84%,60%)] rounded-sm shrink-0"></span> Bearish / Danger</div>
            </div>

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">P/E (Fwd)</p>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(142,76%,36%)] rounded-sm shrink-0"></span> 1 – 19 — value territory</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(45,93%,47%)] rounded-sm shrink-0"></span> 20 – 40 — fairly valued</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(0,84%,60%)] rounded-sm shrink-0"></span> &gt; 40 — expensive / speculative</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(0,84%,60%)] rounded-sm shrink-0"></span> &le; 0 — negative earnings</div>
            </div>

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">EPS Gr (YoY)</p>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(142,76%,36%)] rounded-sm shrink-0"></span> &gt; 15% — strong growth</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(45,93%,47%)] rounded-sm shrink-0"></span> 5 – 15% — moderate growth</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(0,84%,60%)] rounded-sm shrink-0"></span> &lt; 5% — slow / declining</div>
            </div>

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">Debt / Equity</p>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(142,76%,36%)] rounded-sm shrink-0"></span> &lt; 0.5 — low leverage</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(45,93%,47%)] rounded-sm shrink-0"></span> 0.5 – 1.5 — moderate leverage</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(0,84%,60%)] rounded-sm shrink-0"></span> &gt; 1.5 — high leverage</div>
            </div>

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">200d MA / 50d MA</p>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(142,76%,36%)] rounded-sm shrink-0"></span> Price above MA — uptrend</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(45,93%,47%)] rounded-sm shrink-0"></span> Price below MA — downtrend</div>
            </div>

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">RSI (14)</p>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(142,76%,36%)] rounded-sm shrink-0"></span> &lt; 30 — oversold / buy signal</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(45,93%,47%)] rounded-sm shrink-0"></span> 30 – 70 — neutral momentum</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(0,84%,60%)] rounded-sm shrink-0"></span> &gt; 70 — overbought / sell signal</div>
            </div>

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">Short Interest</p>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(142,76%,36%)] rounded-sm shrink-0"></span> &lt; 3% — low short pressure</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(45,93%,47%)] rounded-sm shrink-0"></span> 3 – 5% — moderate short interest</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(0,84%,60%)] rounded-sm shrink-0"></span> &gt; 5% — heavily shorted</div>
            </div>

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">Put / Call Ratio</p>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(142,76%,36%)] rounded-sm shrink-0"></span> &lt; 0.7 — bullish sentiment</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(45,93%,47%)] rounded-sm shrink-0"></span> 0.7 – 1.0 — neutral sentiment</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-[hsl(0,84%,60%)] rounded-sm shrink-0"></span> &gt; 1.0 — bearish / hedging activity</div>
            </div>

          </div>

          {/* No-color columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">Beta <span className="text-muted-foreground font-normal normal-case tracking-normal">(no color coding)</span></p>
              <div>= 1.0 &nbsp;— moves in tandem with the market</div>
              <div>&lt; 1.0 &nbsp;— low beta, less volatile than the market</div>
              <div>&gt; 1.0 &nbsp;— high beta, more volatile than the market</div>
              <div>= 0 &nbsp;&nbsp;&nbsp;— independent of the market (like cash)</div>
              <div>&lt; 0 &nbsp;&nbsp;&nbsp;— moves inversely to the market</div>
            </div>

            <div className="space-y-1 bg-muted/20 rounded-md p-3 border border-border">
              <p className="font-bold text-foreground uppercase tracking-wider mb-2">Implied Volatility (IV) <span className="text-muted-foreground font-normal normal-case tracking-normal">(no color coding)</span></p>
              <div>Expected annualized % move in the stock price:</div>
              <div>&lt; 30% &nbsp;&nbsp;— low, cheap options</div>
              <div>30 – 50% — moderate</div>
              <div>&gt; 50% &nbsp;&nbsp;— high, expensive options</div>
            </div>

          </div>

        </div>

      </div>

      <ChartModal 
        ticker={selectedTicker?.ticker || null} 
        companyName={selectedTicker?.name} 
        onClose={() => setSelectedTicker(null)} 
      />
    </div>
  );
}
