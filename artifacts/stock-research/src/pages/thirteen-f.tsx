import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, TrendingUp, ChevronLeft, ChevronRight, Building2, ArrowLeft, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import {
  useList13fFunds,
  getList13fFundsQueryKey,
  useGet13fFundQuarters,
  getGet13fFundQuartersQueryKey,
  useGet13fFundHoldings,
  getGet13fFundHoldingsQueryKey,
  useGet13fPriceInfo,
  getGet13fPriceInfoQueryKey,
  type ThirteenFHoldingRow,
  type HedgeFund,
} from "@workspace/api-client-react";

// ─── Static fund metadata ─────────────────────────────────────────────────────

type FundLink = {
  title: string;
  url: string;
  type: "report" | "article" | "commentary" | "website" | "video" | "data";
  description?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// LINK POLICY: Do NOT link to competing 13F / portfolio-tracker products
// (e.g. Dataroma, WhaleWisdom, GuruFocus, Whalewatcher, TipRanks portfolio
// tracker, Simply Wall St, etc.).  Acceptable sources: official fund/firm
// websites, SEC EDGAR filings, Wikipedia, books, interviews, news articles,
// and general financial data providers (Bloomberg, Reuters, Morningstar fund
// pages, etc.) that are not primarily 13F trackers.
// ─────────────────────────────────────────────────────────────────────────────
const FUND_LINKS: Record<string, FundLink[]> = {
  "1067983": [ // Berkshire Hathaway — Warren Buffett
    { title: "Annual Shareholder Letters (1977–present)", url: "https://www.berkshirehathaway.com/letters/letters.html", type: "report", description: "Buffett's letters to Berkshire shareholders, widely considered essential reading on long-term investing." },
    { title: "Berkshire Hathaway — Official Website", url: "https://www.berkshirehathaway.com/", type: "website", description: "Annual reports, proxy statements, and SEC filings." },
    { title: "The Buffett Archive (CNBC)", url: "https://buffett.cnbc.com/", type: "commentary", description: "Archive of Berkshire AGM video, CNBC interviews, and shareholder Q&A sessions going back decades." },
    { title: "Warren Buffett — Wikipedia", url: "https://en.wikipedia.org/wiki/Warren_Buffett", type: "article" },
    { title: "Berkshire Hathaway — Wikipedia", url: "https://en.wikipedia.org/wiki/Berkshire_Hathaway", type: "article" },
  ],
  "1336528": [ // Pershing Square Capital Mgmt — Bill Ackman
    { title: "Pershing Square Holdings — Investor Site", url: "https://www.pershingsquareholdings.com/", type: "website", description: "NAV updates, annual reports, investor letters, and shareholder presentations." },
    { title: "Pershing Square Capital Management — Wikipedia", url: "https://en.wikipedia.org/wiki/Pershing_Square_Capital_Management", type: "article" },
    { title: "Bill Ackman — Wikipedia", url: "https://en.wikipedia.org/wiki/Bill_Ackman", type: "article" },
  ],
  "1709323": [ // Himalaya Capital Management — Li Lu
    { title: "Li Lu — Wikipedia", url: "https://en.wikipedia.org/wiki/Li_Lu_(investor)", type: "article", description: "Background on Li Lu's history, investment philosophy, and connection to Charlie Munger." },
    { title: "SEC EDGAR — Himalaya Capital 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1709323&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1766596": [ // RV Capital AG — Robert Vinall
    { title: "RV Capital — Official Website", url: "https://www.rv-capital.com/", type: "website", description: "Annual \"Business Owner\" shareholder letters and portfolio commentary by Robert Vinall." },
    { title: "SEC EDGAR — RV Capital 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1766596&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1697591": [ // CAS Investment Partners — Clifford Sosin
    { title: "SEC EDGAR — CAS Investment Partners 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1697591&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
    { title: "Clifford Sosin — Interview (MOI Global)", url: "https://moiglobal.com/clifford-sosin/", type: "commentary", description: "Interviews and investment commentary by Clifford Sosin." },
  ],
  "905567": [ // Yacktman Asset Management — Donald Yacktman
    { title: "Yacktman Asset Management — Official Website", url: "https://www.yacktman.com/", type: "website", description: "Fund overview, philosophy, and investor resources from the Yacktman team." },
    { title: "Donald Yacktman — Wikipedia", url: "https://en.wikipedia.org/wiki/Donald_Yacktman", type: "article", description: "Background on Donald Yacktman, his investment approach, and the history of the firm." },
    { title: "SEC EDGAR — Yacktman Asset Management 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=905567&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
    { title: "Yacktman Fund — Morningstar Profile", url: "https://www.morningstar.com/funds/xnas/yackx/quote", type: "commentary", description: "Performance, holdings, and ratings for the Yacktman Fund (YACKX)." },
  ],
  "1112520": [ // Akre Capital Management — Chuck Akre
    { title: "Akre Capital Management — Official Website", url: "https://www.akrekapital.com/", type: "website", description: "Firm overview and investment philosophy from Chuck Akre's concentrated, long-term compounding-focused fund." },
    { title: "Chuck Akre — Acquirers Multiple Interview (2019)", url: "https://www.youtube.com/watch?v=LZsGSAsdxmc", type: "video", description: "Akre explains his three-legged stool framework: exceptional business, skilled management team, and reinvestment opportunity." },
    { title: "Chuck Akre — Wikipedia", url: "https://en.wikipedia.org/wiki/Chuck_Akre", type: "article", description: "Background on Chuck Akre's career, his focus on compounders, and the founding of Akre Capital Management." },
    { title: "SEC EDGAR — Akre Capital Management 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1112520&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1375534": [ // Generation Investment Management — Al Gore / David Blood
    { title: "Generation Investment Management — Official Website", url: "https://www.generationim.com/", type: "website", description: "Firm overview, investment philosophy, and sustainability research from Al Gore and David Blood's long-term, ESG-integrated fund." },
    { title: "Generation Investment Management — Wikipedia", url: "https://en.wikipedia.org/wiki/Generation_Investment_Management", type: "article", description: "Overview of the firm's founding, philosophy, and its case that sustainable investing produces superior long-run returns." },
    { title: "Al Gore — TED Talk: The Case for Optimism on Climate Change (2016)", url: "https://www.ted.com/talks/al_gore_the_case_for_optimism_on_climate_change", type: "video", description: "Gore makes the investment and policy case for renewable energy and sustainable capitalism, the intellectual foundation behind Generation's strategy." },
    { title: "Al Gore — Wikipedia", url: "https://en.wikipedia.org/wiki/Al_Gore", type: "article", description: "Background on Al Gore's career and his role co-founding Generation Investment Management with David Blood." },
    { title: "SEC EDGAR — Generation Investment Mgmt 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1375534&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1061768": [ // Baupost Group — Seth Klarman
    { title: "Baupost Group — Official Website", url: "https://www.baupost.com/", type: "website", description: "Firm overview and investment philosophy from one of the world's largest value-oriented hedge funds." },
    { title: "Margin of Safety (1991) — Seth Klarman", url: "https://en.wikipedia.org/wiki/Margin_of_Safety_(book)", type: "article", description: "Klarman's out-of-print classic on risk-averse value investing, widely regarded as one of the most important investment books ever written." },
    { title: "Seth Klarman — Wikipedia", url: "https://en.wikipedia.org/wiki/Seth_Klarman", type: "article", description: "Background on Seth Klarman's career at Baupost Group, his investment philosophy, and his influence on value investing." },
    { title: "Seth Klarman — Talks at Google (2010)", url: "https://www.youtube.com/watch?v=FBpUiUO89ac", type: "video", description: "Klarman discusses margin of safety, value investing discipline, and navigating uncertain markets." },
    { title: "SEC EDGAR — Baupost Group 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1061768&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1358706": [ // Abrams Capital Management — David Abrams
    { title: "Abrams Capital — Official Website", url: "https://www.abramscapital.com/", type: "website", description: "Firm overview and contact information for Abrams Capital Management." },
    { title: "SEC EDGAR — Abrams Capital 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1358706&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1036325": [ // Davis Selected Advisers — Christopher Davis
    { title: "Davis Advisors — Official Website", url: "https://www.davisadvisors.com/", type: "website", description: "Fund overviews, investor letters, and the firm's research-driven investment philosophy." },
    { title: "Davis Advisors — Shareholder Letters", url: "https://www.davisadvisors.com/resources/shareholder-letters", type: "report", description: "Annual letters to shareholders from Christopher Davis covering portfolio activity and long-term investment thinking." },
    { title: "Christopher Davis — Wikipedia", url: "https://en.wikipedia.org/wiki/Christopher_Davis_(investor)", type: "article", description: "Background on the Davis family's multi-generational investment tradition and Christopher Davis's approach." },
    { title: "SEC EDGAR — Davis Selected Advisers 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1036325&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "732905": [ // Tweedy Browne Co LLC — William Browne
    { title: "Tweedy Browne — Official Website", url: "https://www.tweedy.com/", type: "website", description: "Fund overviews, performance data, and the firm's storied history as a value-investing institution." },
    { title: "Tweedy Browne — Shareholder Letters & Commentary", url: "https://www.tweedy.com/resources/library_docs/letters/index.html", type: "report", description: "Annual and semi-annual letters to shareholders from the managing directors, covering portfolio activity and investment philosophy." },
    { title: "What Has Worked In Investing (1992)", url: "https://www.tweedy.com/resources/library_docs/papers/WhatHasWorkedFinal.pdf", type: "article", description: "Tweedy Browne's landmark research compendium documenting the empirical evidence for value investing across dozens of academic studies." },
    { title: "Tweedy Browne — Wikipedia", url: "https://en.wikipedia.org/wiki/Tweedy,_Browne", type: "article", description: "History of the firm, its origins as Benjamin Graham's brokerage, and evolution into a global value fund." },
    { title: "SEC EDGAR — Tweedy Browne 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=732905&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1671657": [ // Dorsey Asset Management — Pat Dorsey
    { title: "Dorsey Asset Management — Official Website", url: "https://www.dorseyasset.com/", type: "website", description: "Firm overview, investment philosophy, and investor resources from Pat Dorsey's concentrated, moat-focused fund." },
    { title: "The Little Book That Builds Wealth", url: "https://www.amazon.com/dp/047022651X", type: "article", description: "Pat Dorsey's book on economic moats — the theoretical foundation behind the fund's stock selection approach." },
    { title: "Pat Dorsey — Interview (Focused Compounding)", url: "https://focusedcompounding.com/pat-dorsey/", type: "commentary", description: "In-depth interviews with Pat Dorsey on moat investing, portfolio concentration, and stock analysis." },
    { title: "SEC EDGAR — Dorsey Asset Management 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1671657&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
};

const LINK_TYPE_STYLES: Record<FundLink["type"], { label: string; cls: string }> = {
  report:      { label: "Report",      cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  article:     { label: "Article",     cls: "bg-slate-50 text-slate-600 dark:bg-slate-900/60 dark:text-slate-300 border-slate-200 dark:border-slate-700" },
  commentary:  { label: "Commentary",  cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
  website:     { label: "Website",     cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
  video:       { label: "Video",       cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800" },
  data:        { label: "Data",        cls: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-800" },
};

function FundLinksSection({ cik, proprietor }: { cik: string; proprietor: string | null | undefined }) {
  const links = FUND_LINKS[cik] ?? [];
  if (links.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Further Reading</h3>
        {proprietor && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Articles, reports, and commentaries about the fund and {proprietor}
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {links.map((link) => {
          const style = LINK_TYPE_STYLES[link.type];
          return (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-lg border border-border/60 bg-background hover:bg-muted hover:border-border transition-all p-3"
            >
              <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60 group-hover:text-primary transition-colors" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-snug">
                    {link.title}
                  </span>
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${style.cls}`}>
                    {style.label}
                  </span>
                </div>
                {link.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{link.description}</p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollars(val: number | null | undefined): string {
  if (val == null) return "—";
  return `$${Math.round(val).toLocaleString("en-US")}`;
}

/** Format a value stored in thousands of dollars into a full dollar amount. */
function fmtMktVal(thousands: number | null | undefined): string {
  if (thousands == null) return "—";
  return `$${(thousands * 1000).toLocaleString("en-US")}`;
}

function fmtShares(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString("en-US");
}

function fmtPct(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  return `${val.toFixed(decimals)}%`;
}

function fmtChange(val: number | null | undefined): string {
  if (val == null) return "New";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

const COLOR_CLASSES: Record<string, { cell: string; badge: string }> = {
  new:      { cell: "bg-green-50 dark:bg-green-950/30", badge: "text-green-700 dark:text-green-400 font-semibold" },
  increase: { cell: "bg-blue-50 dark:bg-blue-950/30",  badge: "text-blue-700 dark:text-blue-400 font-semibold" },
  decrease: { cell: "bg-red-50 dark:bg-red-950/30",    badge: "text-red-700 dark:text-red-400 font-semibold" },
  "":       { cell: "",                                 badge: "text-foreground" },
};

function cellBg(colorClass: string): string {
  return COLOR_CLASSES[colorClass]?.cell ?? "";
}
function badgeStyle(colorClass: string): string {
  return COLOR_CLASSES[colorClass]?.badge ?? "text-foreground";
}

// ─── Holdings table ───────────────────────────────────────────────────────────

function HoldingsTable({
  rows,
  currentQ,
  priorQ,
}: {
  rows: ThirteenFHoldingRow[];
  currentQ: string;
  priorQ: string | null | undefined;
}) {
  const [selectedRow, setSelectedRow] = useState<{
    name: string;
    ticker: string | null;
    colorClass: string;
    currentPctAllocation: number | null | undefined;
    priorPctAllocation: number | null | undefined;
    pctChangeShares: number | null | undefined;
  } | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card overflow-auto max-h-[calc(100vh-370px)]">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-20">
          <tr className="border-b border-border bg-muted/80 backdrop-blur-sm">
            <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/80 z-30 min-w-[180px]">
              Name (Ticker)
            </th>
            <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[160px]">
              Mkt Value<br /><span className="font-normal opacity-70">{currentQ}</span>
            </th>
            <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[120px]">
              Shares<br /><span className="font-normal opacity-70">{currentQ}</span>
            </th>
            <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">
              % Alloc<br /><span className="font-normal opacity-70">{currentQ}</span>
            </th>
            {priorQ && (
              <>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[160px]">
                  Mkt Value<br /><span className="font-normal opacity-70">{priorQ}</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[120px]">
                  Shares<br /><span className="font-normal opacity-70">{priorQ}</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">
                  % Alloc<br /><span className="font-normal opacity-70">{priorQ}</span>
                </th>
              </>
            )}
            <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">
              % Change<br /><span className="font-normal opacity-70">Shares</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const bg = cellBg(row.colorClass);
            const badge = badgeStyle(row.colorClass);
            return (
              <tr
                key={`${row.name}-${i}`}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setSelectedRow({
                  name: row.name,
                  ticker: row.ticker ?? null,
                  colorClass: row.colorClass,
                  currentPctAllocation: row.currentPctAllocation,
                  priorPctAllocation: row.priorPctAllocation,
                  pctChangeShares: row.pctChangeShares,
                })}
              >
                {/* Name (Ticker) — color-coded */}
                <td className={`px-3 py-2 sticky left-0 z-10 ${bg || "bg-card"}`}>
                  <span className={`font-medium ${badge}`}>
                    {row.name}
                    {row.ticker && (
                      <span className="ml-1 font-mono text-[10px] opacity-80">({row.ticker})</span>
                    )}
                  </span>
                </td>
                {/* Current Market Value */}
                <td className="px-3 py-2 text-right tabular-nums font-mono">
                  {fmtMktVal(row.currentMarketValue)}
                </td>
                {/* Current Shares */}
                <td className="px-3 py-2 text-right tabular-nums font-mono">
                  {fmtShares(row.currentShares)}
                </td>
                {/* Current % Allocation */}
                <td className="px-3 py-2 text-right tabular-nums font-mono">
                  {fmtPct(row.currentPctAllocation)}
                </td>
                {/* Prior quarter columns */}
                {priorQ && (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-muted-foreground">
                      {fmtMktVal(row.priorMarketValue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-muted-foreground">
                      {fmtShares(row.priorShares)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-muted-foreground">
                      {fmtPct(row.priorPctAllocation)}
                    </td>
                  </>
                )}
                {/* % Change — color-coded */}
                <td className={`px-3 py-2 text-right tabular-nums ${bg}`}>
                  <span className={badge}>
                    {row.colorClass === "new" ? "New" : fmtChange(row.pctChangeShares)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Price info popup */}
      {selectedRow && (
        <PriceInfoDialog
          open={!!selectedRow}
          onClose={() => setSelectedRow(null)}
          name={selectedRow.name}
          ticker={selectedRow.ticker}
          currentQ={currentQ}
          colorClass={selectedRow.colorClass}
          currentPctAllocation={selectedRow.currentPctAllocation}
          priorPctAllocation={selectedRow.priorPctAllocation}
          pctChangeShares={selectedRow.pctChangeShares}
        />
      )}
    </div>
  );
}

// ─── Price info popup ─────────────────────────────────────────────────────────

function activitySummary(
  colorClass: string,
  currentPct: number | null | undefined,
  priorPct: number | null | undefined,
  pctChangeShares: number | null | undefined,
  currentQ: string,
): { label: string; detail: string; kind: "new" | "increase" | "decrease" | "held" } {
  const cur = currentPct != null ? `${currentPct.toFixed(2)}%` : null;
  const prior = priorPct != null ? `${priorPct.toFixed(2)}%` : null;
  const chg = pctChangeShares != null ? Math.abs(pctChangeShares).toFixed(2) : null;

  if (colorClass === "new") {
    return {
      label: "New Position",
      detail: cur ? `New ${cur} of the portfolio position in ${currentQ}` : `Opened in ${currentQ}`,
      kind: "new",
    };
  }
  if (colorClass === "increase") {
    return {
      label: "Increased",
      detail: [
        cur ? `Increased the ${cur} position` : "Increased position",
        chg ? `by ${chg}%` : "",
        `in ${currentQ}`,
      ].filter(Boolean).join(" "),
      kind: "increase",
    };
  }
  if (colorClass === "decrease") {
    return {
      label: "Decreased",
      detail: [
        cur ? `Decreased the ${cur} position` : "Decreased position",
        chg ? `by ${chg}%` : "",
        `in ${currentQ}`,
      ].filter(Boolean).join(" "),
      kind: "decrease",
    };
  }
  return {
    label: "Held",
    detail: cur ? `Held the ${cur} position — no change in ${currentQ}` : `No change in ${currentQ}`,
    kind: "held",
  };
}

const ACTIVITY_STYLES = {
  new:      { icon: "✦", bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400", label: "bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-300" },
  increase: { icon: "▲", bg: "bg-blue-50 dark:bg-blue-950/40",  text: "text-blue-700 dark:text-blue-400",  label: "bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300"   },
  decrease: { icon: "▼", bg: "bg-red-50 dark:bg-red-950/40",    text: "text-red-700 dark:text-red-400",    label: "bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-300"     },
  held:     { icon: "●", bg: "bg-muted/50",                      text: "text-muted-foreground",             label: "bg-muted text-muted-foreground"                                     },
};

function PriceInfoDialog({
  open,
  onClose,
  name,
  ticker,
  currentQ,
  colorClass,
  currentPctAllocation,
  priorPctAllocation,
  pctChangeShares,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  ticker: string | null;
  currentQ: string;
  colorClass: string;
  currentPctAllocation: number | null | undefined;
  priorPctAllocation: number | null | undefined;
  pctChangeShares: number | null | undefined;
}) {
  const enabled = open && !!ticker;

  const { data, isLoading, isError } = useGet13fPriceInfo(
    { ticker: ticker ?? "", quarter: currentQ },
    {
      query: {
        queryKey: getGet13fPriceInfoQueryKey({ ticker: ticker ?? "", quarter: currentQ }),
        enabled,
        staleTime: 5 * 60 * 1000,
      },
    },
  );

  function fmtP(v: number | null | undefined): string {
    if (v == null) return "—";
    return `$${v.toFixed(2)}`;
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-xs sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <span className="truncate">{name}</span>
            {ticker && (
              <span className="shrink-0 font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {ticker}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Activity — always shown, derived from row data, no API call needed */}
        {(() => {
          const act = activitySummary(colorClass, currentPctAllocation, priorPctAllocation, pctChangeShares, currentQ);
          const s = ACTIVITY_STYLES[act.kind];
          return (
            <div className={`rounded-lg px-3 py-2.5 ${s.bg}`}>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1.5">
                Activity during {currentQ}
              </p>
              <div className="flex items-center gap-2">
                <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded ${s.label}`}>
                  {s.icon} {act.label}
                </span>
                <span className={`text-sm font-medium ${s.text}`}>
                  {act.detail.replace(` in ${currentQ}`, "")}
                </span>
              </div>
            </div>
          );
        })()}

        {!ticker ? (
          <p className="text-sm text-muted-foreground py-2 text-center">
            Ticker not yet resolved — price data unavailable.
          </p>
        ) : isLoading ? (
          <div className="space-y-3 pb-1">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-4 w-52" />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive py-2 text-center">
            Failed to load price data.
          </p>
        ) : data ? (
          <div className="space-y-4 pb-1">
            {/* Current price */}
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">
                Current Share Price ({ticker})
              </p>
              <p className="text-3xl font-bold tabular-nums tracking-tight">
                {fmtP(data.currentPrice)}
              </p>
            </div>

            {/* Quarterly range */}
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-2">
                Price Range ({ticker}) during {currentQ}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Low Price</p>
                  <p className="text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {fmtP(data.quarterLow)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground font-medium mb-0.5">High Price</p>
                  <p className="text-xl font-semibold tabular-nums text-green-600 dark:text-green-400">
                    {fmtP(data.quarterHigh)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Holdings view (fund selected) ───────────────────────────────────────────

function FundHoldingsView({
  cik,
  fundName,
  onBack,
}: {
  cik: string;
  fundName: string;
  onBack: () => void;
}) {
  const [quarterIndex, setQuarterIndex] = useState(0);

  const { data: quartersData, isLoading: quartersLoading } = useGet13fFundQuarters(cik, {
    query: {
      queryKey: getGet13fFundQuartersQueryKey(cik),
      enabled: !!cik,
      staleTime: 5 * 60 * 1000,
      // Poll every 10 s while the seed is still running so the UI updates automatically.
      // Uses the function form so we don't reference `quartersData` before it is initialised.
      refetchInterval: (query) =>
        (query.state.data as { seedingInProgress?: boolean } | undefined)?.seedingInProgress
          ? 10_000
          : false,
    },
  });

  const seedingInProgress = quartersData?.seedingInProgress ?? false;
  const quarters = quartersData?.quarters ?? [];
  const currentQ = quarters[quarterIndex] ?? undefined;
  const priorQ   = quarters[quarterIndex + 1] ?? undefined;

  const canGoOlder = quarterIndex + 1 < quarters.length; // there's at least one older quarter to navigate to
  const canGoNewer = quarterIndex > 0;

  const params = currentQ ? { currentQ, priorQ } : undefined;

  const { data: holdingsData, isLoading: holdingsLoading, isFetching } = useGet13fFundHoldings(
    cik,
    params,
    {
      query: {
        queryKey: getGet13fFundHoldingsQueryKey(cik, params),
        enabled: !!cik && !!currentQ,
        staleTime: 5 * 60 * 1000,
      },
    },
  );

  const isLoading = quartersLoading || (holdingsLoading && !holdingsData);

  return (
    <div className="space-y-4">
      {/* Back button + fund name */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Funds
        </button>
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold">
            {fundName}
            {holdingsData?.proprietor && (
              <span className="font-normal text-muted-foreground text-base"> ({holdingsData.proprietor})</span>
            )}
          </h2>
        </div>
      </div>

      {/* Quarter navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setQuarterIndex((i) => i + 1)}
          disabled={!canGoOlder || quartersLoading}
          className="p-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Older quarter"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="text-sm font-medium min-w-[180px] text-center">
          {quartersLoading ? (
            <Skeleton className="h-5 w-40 mx-auto" />
          ) : currentQ ? (
            <span>
              <span className="text-foreground">{currentQ}</span>
              {priorQ && (
                <span className="text-muted-foreground"> vs {priorQ}</span>
              )}
            </span>
          ) : seedingInProgress ? (
            <span className="text-muted-foreground animate-pulse">Syncing from SEC EDGAR…</span>
          ) : (
            <span className="text-muted-foreground">No data available</span>
          )}
        </div>

        <button
          onClick={() => setQuarterIndex((i) => Math.max(0, i - 1))}
          disabled={!canGoNewer || quartersLoading}
          className="p-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Newer quarter"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {holdingsData && !holdingsData.seedingInProgress && (
          <span className="text-xs text-muted-foreground ml-2">
            {holdingsData.holdings.length} positions
            {holdingsData.currentTotalValue > 0 && (
              <> · Portfolio: {fmtMktVal(holdingsData.currentTotalValue)}</>
            )}
          </span>
        )}

        {isFetching && !holdingsLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">Updating…</span>
        )}
      </div>

      {/* Holdings table */}
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      ) : seedingInProgress || holdingsData?.seedingInProgress ? (
        <div className="rounded-xl border border-border bg-card py-20 text-center">
          <Building2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Syncing 13F holdings from SEC EDGAR…</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            This takes a few minutes on first load. The page will update automatically.
          </p>
        </div>
      ) : holdingsData && holdingsData.holdings.length > 0 ? (
        <HoldingsTable
          rows={holdingsData.holdings}
          currentQ={holdingsData.currentQ ?? currentQ ?? ""}
          priorQ={holdingsData.priorQ}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card py-20 text-center">
          <p className="text-sm text-muted-foreground">No equity holdings found for this quarter.</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Color key:</span>
        {[
          { cls: "new",      label: "New position" },
          { cls: "increase", label: "Increase" },
          { cls: "decrease", label: "Decrease" },
        ].map(({ cls, label }) => (
          <span key={cls} className={`px-2 py-0.5 rounded border border-border ${cellBg(cls)} ${badgeStyle(cls)}`}>
            {label}
          </span>
        ))}
      </div>

      {/* External links */}
      <FundLinksSection cik={cik} proprietor={holdingsData?.proprietor} />
    </div>
  );
}

// ─── Fund list card ───────────────────────────────────────────────────────────

function FundListCard({ onSelectFund }: { onSelectFund: (cik: string, name: string, proprietor?: string | null) => void }) {
  const { data, isLoading, isError } = useList13fFunds({
    query: {
      queryKey: getList13fFundsQueryKey(),
      staleTime: 10 * 60 * 1000,
    },
  });

  const funds = data?.funds ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
        Top Hedge Funds
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Failed to load funds.</p>
      ) : funds.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No funds tracked yet.</p>
      ) : (
        <div className="space-y-1.5">
          {funds.map((fund: HedgeFund) => (
            <button
              key={fund.cik}
              onClick={() => onSelectFund(fund.cik, fund.name, fund.proprietor)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border/60 bg-background hover:bg-muted hover:border-border transition-all text-left group"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {fund.name}
                  {fund.proprietor && (
                    <span className="font-normal text-muted-foreground"> ({fund.proprietor})</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">CIK {fund.cik}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ThirteenFInsights() {
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [selectedFund, setSelectedFund] = useState<{ cik: string; name: string; proprietor?: string | null } | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setLocation(`/stock/${searchInput.trim().toUpperCase()}`);
      setSearchInput("");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Ribbon */}
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground tracking-tight">Terminal</span>
          </div>

          <nav className="flex items-center gap-1">
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md cursor-default select-none">
              Top Hedge Funds - Insights
            </span>
            <Link
              href="/indexes"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Stock Screens
            </Link>
            <Link
              href="/stock/AAPL"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Stock Insights
            </Link>
            <Link
              href="/macro"
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Macro Summary
            </Link>
          </nav>

          <div className="flex-1" />

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
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-1"
        >
          <h1 className="text-3xl font-bold tracking-tight">13F Insights</h1>
          <p className="text-sm text-muted-foreground">
            Institutional holdings from SEC 13F-HR filings — updated quarterly
          </p>
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList className="bg-card border border-border h-auto p-1">
            <TabsTrigger
              value="activity"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm"
            >
              Top Hedge Fund Activity
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="activity" className="mt-0">
              {selectedFund ? (
                <FundHoldingsView
                  cik={selectedFund.cik}
                  fundName={selectedFund.name}
                  onBack={() => setSelectedFund(null)}
                />
              ) : (
                <FundListCard
                  onSelectFund={(cik, name) => setSelectedFund({ cik, name })}
                />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
