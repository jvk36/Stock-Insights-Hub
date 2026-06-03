import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Search, TrendingUp } from "lucide-react";
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
  const { symbol } = useParams();
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setLocation(`/stock/${searchInput.trim().toUpperCase()}`);
      setSearchInput("");
    }
  };

  const { data: quote, isLoading: isLoadingQuote } = useGetStockQuote(symbol!, {
    query: {
      enabled: !!symbol,
      queryKey: getGetStockQuoteQueryKey(symbol!)
    }
  });

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
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none">
              Stock Analysis
            </span>
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
