import { useState } from "react";
import { useLocation } from "wouter";
import { Search, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetMacroIndicators,
  getGetMacroIndicatorsQueryKey,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";

import MacroOverviewTab from "@/components/macro/MacroOverviewTab";
import MacroGdpTab from "@/components/macro/MacroGdpTab";
import MacroInflationTab from "@/components/macro/MacroInflationTab";
import MacroLaborTab from "@/components/macro/MacroLaborTab";
import MacroFinancialConditionsTab from "@/components/macro/MacroFinancialConditionsTab";
import MacroGlobalTab from "@/components/macro/MacroGlobalTab";
import MacroDiyGuideTab from "@/components/macro/MacroDiyGuideTab";

export default function MacroSummary() {
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setLocation(`/stock/${searchInput.trim().toUpperCase()}`);
      setSearchInput("");
    }
  };

  const { data, isLoading, isError } = useGetMacroIndicators({
    query: {
      queryKey: getGetMacroIndicatorsQueryKey(),
      staleTime: 5 * 60 * 1000,
    },
  });

  const indicators = data?.indicators ?? [];
  const marketCycle = data?.marketCycle ?? { phase: "Unknown", confidence: 0 };

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
            <button
              onClick={() => setLocation("/stock/AAPL")}
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
            >
              Stock Insights
            </button>
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none">
              Macro Summary
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
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-1"
        >
          <h1 className="text-3xl font-bold tracking-tight">Macro Summary</h1>
          <p className="text-sm text-muted-foreground">
            Key macroeconomic indicators — live data from FRED (Federal Reserve Bank of St. Louis)
            {data?.fetchedAt && (
              <span className="ml-2">
                · Updated {new Date(data.fetchedAt).toLocaleTimeString()}
              </span>
            )}
          </p>
        </motion.div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
            <p className="text-destructive font-medium">Failed to load macro data</p>
            <p className="text-sm text-muted-foreground mt-1">
              Check your connection and FRED API availability.
            </p>
          </div>
        )}

        {/* Main content */}
        {!isLoading && !isError && (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-card border border-border h-auto p-1 flex flex-wrap gap-0.5 w-full lg:w-auto lg:inline-flex lg:flex-nowrap overflow-x-auto">
              <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Overview</TabsTrigger>
              <TabsTrigger value="gdp" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">GDP</TabsTrigger>
              <TabsTrigger value="inflation" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Inflation</TabsTrigger>
              <TabsTrigger value="labor" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Labor</TabsTrigger>
              <TabsTrigger value="financial" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Financial Conditions</TabsTrigger>
              <TabsTrigger value="global" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Global</TabsTrigger>
              <TabsTrigger value="diy" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">DIY Investor Guide</TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="overview" className="mt-0">
                <MacroOverviewTab indicators={indicators} marketCycle={marketCycle} />
              </TabsContent>

              <TabsContent value="gdp" className="mt-0">
                <MacroGdpTab indicators={indicators} />
              </TabsContent>

              <TabsContent value="inflation" className="mt-0">
                <MacroInflationTab indicators={indicators} />
              </TabsContent>

              <TabsContent value="labor" className="mt-0">
                <MacroLaborTab indicators={indicators} />
              </TabsContent>

              <TabsContent value="financial" className="mt-0">
                <MacroFinancialConditionsTab indicators={indicators} />
              </TabsContent>

              <TabsContent value="global" className="mt-0">
                <MacroGlobalTab indicators={indicators} />
              </TabsContent>

              <TabsContent value="diy" className="mt-0">
                <MacroDiyGuideTab />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </main>
    </div>
  );
}
