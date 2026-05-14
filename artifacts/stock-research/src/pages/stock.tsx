import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Search, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
      {/* Header / Nav */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="shrink-0 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <form onSubmit={handleSearch} className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="Search symbol..."
              className="w-full pl-9 bg-background border-border font-mono h-9 uppercase"
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
            <TabsTrigger value="fundamentals" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Fundamentals</TabsTrigger>
            <TabsTrigger value="analysis" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Analysis</TabsTrigger>
            <TabsTrigger value="models" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Models</TabsTrigger>
            <TabsTrigger value="financials" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Financials</TabsTrigger>
            <TabsTrigger value="news" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">News</TabsTrigger>
            <TabsTrigger value="profile" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Profile</TabsTrigger>
            <TabsTrigger value="filings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Filings</TabsTrigger>
            <TabsTrigger value="insiders" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Insiders</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="overview" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <PriceChart symbol={symbol!} />
                </div>
                <div className="space-y-6">
                  <SummaryStats symbol={symbol!} quote={quote} isLoading={isLoadingQuote} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="fundamentals" className="mt-0">
              <FundamentalSummary symbol={symbol!} />
            </TabsContent>

            <TabsContent value="analysis" className="mt-0">
              <AnalysisTab symbol={symbol!} />
            </TabsContent>

            <TabsContent value="models" className="mt-0">
              <ModelsTab symbol={symbol!} />
            </TabsContent>

            <TabsContent value="financials" className="mt-0">
              <Financials symbol={symbol!} />
            </TabsContent>

            <TabsContent value="news" className="mt-0">
              <NewsSection symbol={symbol!} />
            </TabsContent>

            <TabsContent value="profile" className="mt-0">
              <CompanyProfile symbol={symbol!} />
            </TabsContent>

            <TabsContent value="filings" className="mt-0">
              <SecFilings symbol={symbol!} />
            </TabsContent>

            <TabsContent value="insiders" className="mt-0">
              <InsiderTransactions symbol={symbol!} />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
