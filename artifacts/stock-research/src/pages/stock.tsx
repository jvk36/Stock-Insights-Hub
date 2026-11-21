import { useParams, Link, useSearch, useLocation } from "wouter";
import { Lock, Search, TrendingUp } from "lucide-react";
import { useMembership } from "@/lib/membership";
import { isPremiumFeature } from "@workspace/api-zod/access-policy";
import { useState } from "react";
import Seo from "@/components/Seo";
import TickerSearch from "@/components/stock/TickerSearch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetStockQuote, getGetStockQuoteQueryKey } from "@workspace/api-client-react";
import { motion } from "framer-motion";

import PriceChart from "@/components/stock/PriceChart";
import SummaryStats from "@/components/stock/SummaryStats";
import NewsSection from "@/components/stock/NewsSection";
import CompanyProfile from "@/components/stock/CompanyProfile";
import SecFilings from "@/components/stock/SecFilings";
import Financials from "@/components/stock/Financials";
import InsiderActivityTab from "@/components/stock/InsiderActivityTab";
import FundamentalSummary from "@/components/stock/FundamentalSummary";
import ScreenerRatings from "@/components/stock/ScreenerRatings";
import BuybacksTab from "@/components/stock/BuybacksTab";
import AnalysisTab from "@/components/stock/AnalysisTab";
import ModelsTab from "@/components/stock/ModelsTab";
import BoardLeadershipTab from "@/components/stock/BoardLeadershipTab";
import IntrinsicValuation from "@/components/stock/IntrinsicValuation";
import PerformanceLab, { parsePerformanceView } from "@/components/stock/performance/PerformanceLab";
import type { PerformanceView } from "@/components/stock/performance/PerformanceLab";
import RiskLab from "@/components/stock/risk/RiskLab";
import { parseRiskView } from "@/components/stock/risk/risk-shared";
import type { RiskView } from "@/components/stock/risk/risk-shared";
import PortfolioTools from "@/components/stock/portfolio-tools/PortfolioTools";
import { parsePortfolioView } from "@/components/stock/portfolio-tools/portfolio-shared";
import type { PortfolioView } from "@/components/stock/portfolio-tools/portfolio-shared";

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

function PremiumStockContent({ children, feature = "Valuation & Fundamentals research", featureKey }: { children: React.ReactNode; feature?: string; featureKey?: string }) {
  const { membership, loading, authState } = useMembership();
  const key = featureKey ?? (feature === "Performance" ? "lab.performance" : feature === "Risk Analysis" ? "lab.risk" : feature === "Portfolio Tools" ? "lab.portfolio" : "lab.valuation");
  if (!isPremiumFeature(key)) return children;
  const description = feature === "Performance"
    ? "Explore a ticker’s annualized returns (CAGR), the historical growth of a $10,000 investment compared with the S&P 500 using SPY, monthly and annual return heat maps, and rolling returns across different investment horizons."
    : feature === "Risk Analysis"
    ? "Understand a ticker’s historical declines and recovery periods, compare its volatility with index ETFs, evaluate Sharpe, Sortino and Calmar ratios, and explore market beta relative to the S&P 500 using SPY plus correlation with another investment."
    : feature === "Portfolio Tools"
    ? "Combine 2 to 20 tickers with your own weights. The Portfolio Analyzer measures the combined portfolio's CAGR, volatility, maximum drawdown and Sharpe ratio; the Correlation Matrix shows a heat map of how each pair of holdings moves together; the Portfolio Backtester shows how the portfolio would have grown over different time frames with optional rebalancing; the Crisis Simulator replays the dot-com crash, calendar 2008, the 2020 COVID crash and the 2022 bear market; and Recovery Time lists every major drawdown with how long it took to regain the prior high."
    : null;
  if (loading || authState === "unknown") {
    return <p className="text-muted-foreground">Checking membership…</p>;
  }
  if (membership?.premium) return children;
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
      <Lock className="mx-auto h-6 w-6 text-primary" />
      <h2 className="text-xl font-semibold">Premium {feature}</h2>
      {description && <p className="mx-auto max-w-3xl text-muted-foreground" data-testid="text-premium-feature-description">{description}</p>}
      <p className="text-muted-foreground">{feature === "Valuation & Fundamentals research" ? "Overview is free. Upgrade to Premium to access this sub-tab." : `${feature} is available to Premium subscribers. Upgrade to access this sub-tab.`}</p>
      <Link href="/pricing" className="inline-flex rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">Explore Premium</Link>
    </div>
  );
}

type LabValue = "valuation" | "performance" | "risk" | "portfolio";

function LabTabs({ value, onChange, performance, risk, portfolio, children }: { value: LabValue; onChange: (v: LabValue) => void; performance: React.ReactNode; risk: React.ReactNode; portfolio: React.ReactNode; children: React.ReactNode }) {
  const trig = "rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as LabValue)} className="w-full">
      <div className="mb-4 border-b border-border">
        <p className="pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary" data-testid="text-lab-title">Risk & Returns Lab</p>
        <TabsList className="mt-1 h-auto max-w-full flex-wrap justify-start bg-transparent p-0">
          <TabsTrigger value="valuation" data-testid="tab-valuation-fundamentals" className={trig}>Valuation & Fundamentals</TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-performance" className={trig}>Performance {isPremiumFeature("lab.performance") && <Lock className="ml-1.5 h-3 w-3" aria-label="Premium" />}</TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk-analysis" className={trig}>Risk Analysis {isPremiumFeature("lab.risk") && <Lock className="ml-1.5 h-3 w-3" aria-label="Premium" />}</TabsTrigger>
          <TabsTrigger value="portfolio" data-testid="tab-portfolio-tools" className={trig}>Portfolio Tools {isPremiumFeature("lab.portfolio") && <Lock className="ml-1.5 h-3 w-3" aria-label="Premium" />}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="valuation" className="mt-0">{children}</TabsContent>
      <TabsContent value="performance" className="mt-0">{value === "performance" && <PremiumStockContent feature="Performance">{performance}</PremiumStockContent>}</TabsContent>
      <TabsContent value="risk" className="mt-0">{value === "risk" && <PremiumStockContent feature="Risk Analysis">{risk}</PremiumStockContent>}</TabsContent>
      <TabsContent value="portfolio" className="mt-0">{value === "portfolio" && <PremiumStockContent feature="Portfolio Tools">{portfolio}</PremiumStockContent>}</TabsContent>
    </Tabs>
  );
}

export default function StockDetail() {
  const { symbol } = useParams<{ symbol?: string }>();
  // Bumped on every View Insights submit so re-submitting the same ticker still resets to Overview.
  const [resetNonce, setResetNonce] = useState(0);
  const bump = () => setResetNonce((n) => n + 1);
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const labParam = params.get("lab");
  const lab: LabValue = labParam === "performance" ? "performance" : labParam === "risk" ? "risk" : labParam === "portfolio" ? "portfolio" : "valuation";
  const riskView = parseRiskView(params.get("risk"));
  const riskHref = (sym: string | undefined, v: RiskView) =>
    `${sym ? `/stock/${encodeURIComponent(sym)}` : "/stock"}?lab=risk&risk=${v}`;
  const portfolioView = parsePortfolioView(params.get("portfolio"));
  const portfolioHref = (sym: string | undefined, v: PortfolioView) =>
    `${sym ? `/stock/${encodeURIComponent(sym)}` : "/stock"}?lab=portfolio&portfolio=${v}`;
  const perfView = parsePerformanceView(params.get("performance"));
  const base = symbol ? `/stock/${encodeURIComponent(symbol)}` : "/stock";
  const perfHref = (sym: string | undefined, v: PerformanceView) =>
    `${sym ? `/stock/${encodeURIComponent(sym)}` : "/stock"}?lab=performance&performance=${v}`;
  const setLab = (v: LabValue) => setLocation(v === "performance" ? perfHref(symbol, perfView) : v === "risk" ? riskHref(symbol, riskView) : v === "portfolio" ? portfolioHref(symbol, portfolioView) : base);
  const risk = (
    <RiskLab
      symbol={symbol}
      view={riskView}
      onViewChange={(v) => setLocation(riskHref(symbol, v), { replace: true })}
      onTickerChange={(s) => setLocation(riskHref(s, riskView))}
    />
  );
  const portfolio = (
    <PortfolioTools
      symbol={symbol}
      view={portfolioView}
      onViewChange={(v) => setLocation(portfolioHref(symbol, v), { replace: true })}
    />
  );
  const performance = (
    <PerformanceLab
      symbol={symbol}
      view={perfView}
      onViewChange={(v) => setLocation(perfHref(symbol, v), { replace: true })}
      onTickerChange={(s) => setLocation(perfHref(s, perfView))}
    />
  );
  const seo = (
    <Seo
      title={lab === "portfolio" ? (symbol ? `${symbol} Portfolio Tools | Risk & Returns Lab` : "Risk & Returns Lab: Portfolio Tools") : lab === "risk" ? (symbol ? `${symbol} Risk Analysis | Risk & Returns Lab` : "Risk & Returns Lab: Risk Analysis") : lab === "performance" ? (symbol ? `${symbol} Performance | Risk & Returns Lab` : "Risk & Returns Lab: Performance") : symbol ? `${symbol} Valuation & Fundamentals | Risk & Returns Lab` : "Risk & Returns Lab: Valuation & Fundamentals"}
      description={lab === "portfolio"
        ? "Build a multi-ticker portfolio with custom weights: analyze CAGR, volatility, max drawdown and Sharpe, view a correlation matrix heat map, backtest growth with optional rebalancing, simulate historical crises, and measure drawdown recovery times."
        : lab === "risk"
        ? `Analyze ${symbol ?? "any ticker"} risk: historical drawdowns and recovery times, volatility vs index ETFs, Sharpe, Sortino and Calmar ratios, beta to the S&P 500 and correlation.`
        : lab === "performance"
        ? `Analyze ${symbol ?? "any ticker"} with annualized returns, historical investment growth, monthly and annual return heat maps, and rolling returns.`
        : symbol
        ? `Research ${symbol} valuation and fundamentals: price history, financials, intrinsic value, ratings, buybacks, insider activity and SEC filings.`
        : "Compare fundamental value and risk for any ticker: price history, financials, intrinsic valuation, ratings, buybacks, insider activity and SEC filings."}
      path={symbol ? `/stock/${encodeURIComponent(symbol)}` : "/stock"}
    />
  );

  const { data: quote, isLoading: isLoadingQuote } = useGetStockQuote(symbol ?? "", {
    query: {
      enabled: !!symbol && lab === "valuation",
      queryKey: getGetStockQuoteQueryKey(symbol ?? "")
    }
  });

  if (!symbol) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {seo}
        <header className="border-b border-border bg-card sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 min-h-14 py-2 flex flex-wrap items-center gap-2 md:gap-6">
            <div className="flex items-center gap-2 shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span className="font-bold text-foreground tracking-tight">Terminal</span>
            </div>

            <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto md:order-none md:w-auto">
              <Link
                href="/13f"
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                Hedge Fund Blueprint
              </Link>
              <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none whitespace-nowrap">Risk & Returns Lab</span>
              <Link
                href="/indexes"
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              >
                Stock Screens
              </Link>
              <Link href="/model-portfolios" data-testid="link-nav-model-portfolios" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap shrink-0">Algo-Portfolios</Link>
              <Link href="/watchlist" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap">Stock Watch</Link>
              <Link href="/macro" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap">Macro Summary</Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
          <LabTabs key={`lab-${symbol ?? ""}-${resetNonce}`} value={lab} onChange={setLab} performance={performance} risk={risk} portfolio={portfolio}>
          <div className="flex items-center justify-center py-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl text-center"
          >
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Search className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Risk & Returns Lab
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              Valuation & Fundamentals
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground">
              Enter a ticker symbol to explore price history, financials, news,
              fundamentals, analyst ratings, and more.
            </p>

            <div className="mt-8"><TickerSearch autoFocus onNavigate={bump} /></div>

            <p className="mt-4 text-xs text-muted-foreground">
              Pick a suggestion or type any ticker and press Enter
            </p>
          </motion.div>
          </div>
          </LabTabs>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
        {seo}
      {/* Ribbon */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 min-h-14 py-2 flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground tracking-tight">Terminal</span>
          </div>

          {/* Nav menu */}
          <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto md:order-none md:w-auto">
            <Link
              href="/13f"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Hedge Fund Blueprint
            </Link>
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none whitespace-nowrap">Risk & Returns Lab</span>
            <Link
              href="/indexes"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Stock Screens
            </Link>
            <Link href="/model-portfolios" data-testid="link-nav-model-portfolios" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap shrink-0">Algo-Portfolios</Link>
            <Link href="/watchlist" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap">Stock Watch</Link>
            <Link href="/macro" className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors whitespace-nowrap">Macro Summary</Link>
          </nav>

          <div className="hidden flex-1 md:block" />

        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <LabTabs key={`lab-${symbol ?? ""}-${resetNonce}`} value={lab} onChange={setLab} performance={performance} risk={risk} portfolio={portfolio}>
        <div className="space-y-6">
        <div className="max-w-2xl"><TickerSearch size="sm" onNavigate={bump} /></div>
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
        <Tabs key={`${symbol}-${resetNonce}`} defaultValue="overview" className="w-full">
          <TabsList className="bg-card border border-border h-auto p-1 flex flex-wrap gap-0.5 w-full lg:w-auto lg:inline-flex lg:flex-nowrap overflow-x-auto">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Overview</TabsTrigger>
            <TabsTrigger value="intrinsic-valuation" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Intrinsic Valuation</TabsTrigger>
            <TabsTrigger value="indicators" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Indicators</TabsTrigger>
            <TabsTrigger value="screener" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Ratings</TabsTrigger>
            <TabsTrigger value="board-leadership" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Board & Leadership</TabsTrigger>
            <TabsTrigger value="buybacks" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Buybacks</TabsTrigger>
            <TabsTrigger value="insider-activity" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Insider Activity</TabsTrigger>
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

            </TabsContent>

            <TabsContent value="intrinsic-valuation" className="mt-0">
              <PremiumStockContent featureKey="lab.valuation.intrinsic-valuation"><IntrinsicValuation symbol={symbol!} /></PremiumStockContent>
            </TabsContent>

            <TabsContent value="indicators" className="mt-0">
              <PremiumStockContent featureKey="lab.valuation.indicators"><FundamentalSummary symbol={symbol!} /></PremiumStockContent>
            </TabsContent>

            <TabsContent value="screener" className="mt-0">
              <PremiumStockContent featureKey="lab.valuation.ratings"><ScreenerRatings symbol={symbol!} /></PremiumStockContent>
            </TabsContent>

            <TabsContent value="board-leadership" className="mt-0">
              <PremiumStockContent featureKey="lab.valuation.board-leadership"><BoardLeadershipTab symbol={symbol!} /></PremiumStockContent>
            </TabsContent>

            <TabsContent value="buybacks" className="mt-0">
              <PremiumStockContent featureKey="lab.valuation.buybacks"><BuybacksTab symbol={symbol!} /></PremiumStockContent>
            </TabsContent>

            <TabsContent value="insider-activity" className="mt-0">
              <PremiumStockContent featureKey="lab.valuation.insider-activity"><InsiderActivityTab symbol={symbol!} /></PremiumStockContent>
            </TabsContent>

            <TabsContent value="analysis" className="mt-0">
              <PremiumStockContent featureKey="lab.valuation.analysis"><AnalysisTab symbol={symbol!} /></PremiumStockContent>
            </TabsContent>

            <TabsContent value="models" className="mt-0">
              <PremiumStockContent featureKey="lab.valuation.models"><ModelsTab symbol={symbol!} /></PremiumStockContent>
            </TabsContent>
          </div>
        </Tabs>
        </div>
        </LabTabs>
      </main>
    </div>
  );
}
