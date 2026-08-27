import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { ArrowRight, Search, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetStockQuote, getGetStockQuoteQueryKey } from "@workspace/api-client-react";
import { motion } from "framer-motion";

import PriceChart from "@/components/stock/PriceChart";
import SummaryStats from "@/components/stock/SummaryStats";
import NewsSection from "@/components/stock/NewsSection";
import CompanyProfile from "@/components/stock/CompanyProfile";
import SecFilings from "@/components/stock/SecFilings";
import Financials from "@/components/stock/Financials";
import InsiderTransactions from "@/components/stock/InsiderTransactions";
import FundamentalSummary from "@/components/stock/FundamentalSummary";
import ScreenerRatings from "@/components/stock/ScreenerRatings";
import AnalysisTab from "@/components/stock/AnalysisTab";
import ModelsTab from "@/components/stock/ModelsTab";

function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 pt-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
        {children}
      </h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function StockDetail() {
  const { symbol } = useParams<{ symbol?: string }>();
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setLocation(`/stock/${searchInput.trim().toUpperCase()}`);
      setSearchInput("");
    }
  };

  const { data: quote, isLoading: isLoadingQuote } = useGetStockQuote(symbol ?? "", {
    query: {
      enabled: !!symbol,
      queryKey: getGetStockQuoteQueryKey(symbol ?? "")
    }
  });

  if (!symbol) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="border-b border-border bg-card sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
            <div className="flex items-center gap-2 shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span className="font-bold text-foreground tracking-tight">Terminal</span>
            </div>

            <nav className="flex items-center gap-1">
              <Link
                href="/13f"
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                Top Hedge Funds - Insights
              </Link>
              <Link
                href="/indexes"
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                Stock Screens
              </Link>
              <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none">
                Stock Insights
              </span>
              <Link
                href="/macro"
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                Macro Summary
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl text-center"
          >
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Search className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Stock Insights
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              Find your next insight
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground">
              Enter a ticker symbol to explore price history, financials, news,
              fundamentals, analyst ratings, and more.
            </p>

            <form onSubmit={handleSearch} className="mt-8">
              <label htmlFor="stock-search" className="sr-only">
                Ticker symbol
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="stock-search"
                    autoFocus
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                    placeholder="Enter a ticker, e.g. AAPL"
                    className="h-14 w-full border-2 border-primary/30 bg-card pl-12 font-mono text-lg uppercase shadow-sm focus-visible:border-primary focus-visible:ring-primary/20"
                    aria-label="Ticker symbol"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  View insights
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </form>

            <p className="mt-4 text-xs text-muted-foreground">
              Type a ticker symbol and press Enter to continue
            </p>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Ribbon */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground tracking-tight">Terminal</span>
          </div>

          {/* Nav menu */}
          <nav className="flex items-center gap-1">
            <Link
              href="/13f"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Top Hedge Funds - Insights
            </Link>
            <Link
              href="/indexes"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Stock Screens
            </Link>
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none">
              Stock Insights
            </span>
            <Link
              href="/macro"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Macro Summary
            </Link>
          </nav>

          <div className="flex-1" />

          {/* Symbol search */}
          <form onSubmit={handleSearch} className="relative w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="Symbol…"
              className="w-full pl-9 bg-background border-border font-mono h-9 uppercase text-sm"
            />
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Top Section: Title & Price */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
        >
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-4xl font-bold tracking-tight">{symbol}</h1>
              <span className="text-xl text-muted-foreground truncate max-w-[300px] md:max-w-md">
                {isLoadingQuote ? "Loading..." : quote?.shortName || quote?.longName}
              </span>
            </div>
            {!isLoadingQuote && quote?.exchange && (
              <div className="text-sm text-muted-foreground mt-1 font-mono">
                {quote.exchange} • {quote.currency}
              </div>
            )}
          </div>

          {!isLoadingQuote && quote && (
            <div className="text-right">
              <div className="text-4xl font-bold tracking-tight font-mono">
                {quote.currentPrice?.toFixed(2)}
              </div>
              <div className={`text-lg font-mono flex items-center justify-end gap-2 ${quote.change && quote.change >= 0 ? 'text-success' : 'text-destructive'}`}>
                <span>{quote.change && quote.change > 0 ? "+" : ""}{quote.change?.toFixed(2)}</span>
                <span>({quote.changePercent && quote.changePercent > 0 ? "+" : ""}{quote.changePercent?.toFixed(2)}%)</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-card border border-border h-auto p-1 flex flex-wrap gap-0.5 w-full lg:w-auto lg:inline-flex lg:flex-nowrap overflow-x-auto">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Overview</TabsTrigger>
            <TabsTrigger value="indicators" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Indicators</TabsTrigger>
            <TabsTrigger value="screener" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Ratings</TabsTrigger>
            <TabsTrigger value="analysis" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Analysis</TabsTrigger>
            <TabsTrigger value="models" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Models</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {/* Overview: chart + stats + all detail sections */}
            <TabsContent value="overview" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <PriceChart symbol={symbol!} />
                </div>
                <div className="space-y-6">
                  <SummaryStats symbol={symbol!} quote={quote} isLoading={isLoadingQuote} />
                </div>
              </div>

              <SectionDivider>Financials</SectionDivider>
              <Financials symbol={symbol!} />

              <SectionDivider>News</SectionDivider>
              <NewsSection symbol={symbol!} />

              <SectionDivider>Company Profile</SectionDivider>
              <CompanyProfile symbol={symbol!} />

              <SectionDivider>SEC Filings</SectionDivider>
              <SecFilings symbol={symbol!} />

              <SectionDivider>Insider Transactions</SectionDivider>
              <InsiderTransactions symbol={symbol!} />
            </TabsContent>

            <TabsContent value="indicators" className="mt-0">
              <FundamentalSummary symbol={symbol!} />
            </TabsContent>

            <TabsContent value="screener" className="mt-0">
              <ScreenerRatings symbol={symbol!} />
            </TabsContent>

            <TabsContent value="analysis" className="mt-0">
              <AnalysisTab symbol={symbol!} />
            </TabsContent>

            <TabsContent value="models" className="mt-0">
              <ModelsTab symbol={symbol!} />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
