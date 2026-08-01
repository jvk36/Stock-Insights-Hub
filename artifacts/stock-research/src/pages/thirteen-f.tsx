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
  "1656456": [ // Appaloosa LP — David Tepper
    { title: "Appaloosa Management — Wikipedia", url: "https://en.wikipedia.org/wiki/Appaloosa_Management", type: "article", description: "Overview of David Tepper's hedge fund, its distressed-debt origins, and its evolution into a macro and equity-focused fund." },
    { title: "David Tepper — Wikipedia", url: "https://en.wikipedia.org/wiki/David_Tepper", type: "article", description: "Background on David Tepper's career at Goldman Sachs and Appaloosa, his distressed investing approach, and his record returns." },
    { title: "David Tepper — CNBC Interview on Markets (2020)", url: "https://www.youtube.com/watch?v=3fMnBI4U1YQ", type: "video", description: "Tepper discusses his macro outlook, equity valuations, and positioning — a rare in-depth interview from one of the most successful hedge fund managers of all time." },
    { title: "SEC EDGAR — Appaloosa LP 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1656456&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
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
  "1040273": [ // Third Point LLC — Daniel Loeb
    { title: "Third Point LLC — Official Website", url: "https://www.thirdpoint.com/", type: "website", description: "Firm overview, investment philosophy, and investor resources from Dan Loeb's event-driven and activist hedge fund." },
    { title: "Third Point Investor Letters", url: "https://www.thirdpoint.com/news", type: "report", description: "Third Point's quarterly investor letters, one of the most closely read documents on Wall Street for their candid assessments of portfolio companies and macro conditions." },
    { title: "Daniel Loeb — Wikipedia", url: "https://en.wikipedia.org/wiki/Daniel_Loeb", type: "article", description: "Background on Loeb's career, his founding of Third Point in 1995, and his reputation for activist investing and sharply-worded letters to corporate management." },
    { title: "Third Point LLC — Wikipedia", url: "https://en.wikipedia.org/wiki/Third_Point_LLC", type: "article", description: "Overview of Third Point's strategy, notable activist campaigns (Sony, Sotheby's, Campbell Soup, Shell), and its evolution into a multi-strategy fund." },
    { title: "Daniel Loeb at the 2022 SALT Conference", url: "https://www.youtube.com/watch?v=3Q0JkX3g2Oo", type: "video", description: "Loeb discusses macro conditions, the transition from growth to value investing, and his approach to event-driven and activist opportunities." },
    { title: "SEC EDGAR — Third Point LLC 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1040273&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1536411": [ // Duquesne Family Office — Stanley Druckenmiller
    { title: "Stanley Druckenmiller — Wikipedia", url: "https://en.wikipedia.org/wiki/Stanley_Druckenmiller", type: "article", description: "Career overview: Druckenmiller's run at Duquesne Capital (1981–2010), his years as lead portfolio manager for George Soros, the trade that broke the Bank of England, and his conversion to a family office." },
    { title: "Stanley Druckenmiller — CNBC Interview Archive", url: "https://www.cnbc.com/stanley-druckenmiller/", type: "video", description: "Collection of Druckenmiller's televised interviews covering macro views, market structure, monetary policy, and portfolio positioning." },
    { title: "Druckenmiller at the 2023 Sohn Conference", url: "https://www.youtube.com/watch?v=GBP7hPkZbCA", type: "video", description: "Keynote presentation covering AI, monetary tightening, and his high-conviction equity ideas — one of his most-cited recent public appearances." },
    { title: "The Duquesne Family Office Story (Bloomberg)", url: "https://www.bloomberg.com/news/articles/2010-08-18/druckenmiller-to-shut-duquesne-hedge-fund-return-clients-money", type: "article", description: "Bloomberg's coverage of Druckenmiller closing Duquesne Capital Management to outside investors in 2010 and converting it to a family office." },
    { title: "SEC EDGAR — Duquesne Family Office 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1536411&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "915191": [ // Fairfax Financial Holdings — Prem Watsa
    { title: "Fairfax Financial Holdings — Official Website", url: "https://www.fairfax.ca/", type: "website", description: "Investor relations, annual reports, and shareholder letters from Prem Watsa's Toronto-based insurance and investment holding company." },
    { title: "Prem Watsa — Wikipedia", url: "https://en.wikipedia.org/wiki/Prem_Watsa", type: "article", description: "Background on Watsa's career, his emigration from India, the founding of Fairfax in 1985, and his reputation as the 'Canadian Warren Buffett'." },
    { title: "Fairfax Financial Holdings — Wikipedia", url: "https://en.wikipedia.org/wiki/Fairfax_Financial_Holdings", type: "article", description: "Overview of Fairfax's insurance subsidiaries, investment philosophy, and notable investments including the prescient credit default swap trade in 2007–2008." },
    { title: "SEC EDGAR — Fairfax Financial Holdings 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=915191&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1167483": [ // Tiger Global Management — Chase Coleman
    { title: "Tiger Global Management — Official Website", url: "https://www.tigerglobal.com/", type: "website", description: "Firm overview covering Tiger Global's public equity and private investment activities across global technology and internet businesses." },
    { title: "Chase Coleman — Wikipedia", url: "https://en.wikipedia.org/wiki/Chase_Coleman_III", type: "article", description: "Background on Coleman's career as a protégé of Julian Robertson at Tiger Management and his founding of Tiger Global in 2001." },
    { title: "Tiger Global Management — Wikipedia", url: "https://en.wikipedia.org/wiki/Tiger_Global_Management", type: "article", description: "History of the firm, its evolution from a Tiger Cub hedge fund into a dual public/private equity investor, and its major positions in global technology companies." },
    { title: "SEC EDGAR — Tiger Global Management 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1167483&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1647251": [ // TCI Fund Management — Christopher Hohn
    { title: "TCI Fund Management — Official Website", url: "https://www.tcifund.com/", type: "website", description: "Firm overview and investment approach from Christopher Hohn's concentrated, long-term, high-conviction fund." },
    { title: "Christopher Hohn — Wikipedia", url: "https://en.wikipedia.org/wiki/Christopher_Hohn", type: "article", description: "Background on Hohn's career, TCI's founding, his activist campaigns, and his philanthropy through The Children's Investment Fund Foundation." },
    { title: "TCI Fund Management — Wikipedia", url: "https://en.wikipedia.org/wiki/TCI_Fund_Management", type: "article", description: "Overview of TCI's strategy, its evolution from activist hedge fund to long-term concentrated equity investor, and notable campaigns." },
    { title: "SEC EDGAR — TCI Fund Management 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1647251&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1569205": [ // FundSmith LLP — Terry Smith
    { title: "FundSmith — Official Website", url: "https://www.fundsmith.co.uk/", type: "website", description: "Investor updates, annual letters, and the firm's philosophy of buying and holding great businesses at sensible prices." },
    { title: "FundSmith Annual Shareholder Letters", url: "https://www.fundsmith.co.uk/investor-resources/fund-documents", type: "report", description: "Terry Smith's annual letters to investors, covering portfolio activity, business quality, and long-term investment thinking." },
    { title: "Terry Smith — Wikipedia", url: "https://en.wikipedia.org/wiki/Terry_Smith_(fund_manager)", type: "article", description: "Background on Terry Smith's career, the founding of FundSmith in 2010, and his concentrated buy-and-hold approach." },
    { title: "Terry Smith — Interview (The Investor's Podcast, 2021)", url: "https://www.youtube.com/watch?v=yHcIy0p-dXA", type: "video", description: "Smith discusses his three investment rules: buy good companies, don't overpay, and do nothing. A rare long-form conversation with one of the UK's most outspoken fund managers." },
    { title: "SEC EDGAR — FundSmith LLP 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1569205&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1079114": [ // Greenlight Capital — David Einhorn (filed as Greenlight Capital Inc through Q4 2023, then DME Capital Management LP)
    { title: "Greenlight Capital — Official Website", url: "https://www.greenlightcapital.com/", type: "website", description: "Investor resources and fund overview from David Einhorn's long/short value-oriented hedge fund, founded in 1996." },
    { title: "David Einhorn — Wikipedia", url: "https://en.wikipedia.org/wiki/David_Einhorn_(investor)", type: "article", description: "Background on Einhorn's career, his founding of Greenlight Capital at 27, his famous short of Lehman Brothers before its collapse, and his contrarian value investing style." },
    { title: "Greenlight Capital — Wikipedia", url: "https://en.wikipedia.org/wiki/Greenlight_Capital", type: "article", description: "History of the fund, its long/short equity strategy, notable positions (Allied Capital, Lehman Brothers, Apple, GM), and the performance record across market cycles." },
    { title: "Fooling Some of the People All of the Time (Book)", url: "https://www.amazon.com/dp/0470481544", type: "article", description: "Einhorn's account of his six-year short of Allied Capital — a gripping first-person narrative of short-selling, corporate fraud, and regulatory dysfunction that became required reading on Wall Street." },
    { title: "David Einhorn — Sohn Conference 2008 (Lehman Short)", url: "https://www.youtube.com/watch?v=2tRLHJREFAg", type: "video", description: "Einhorn's legendary Sohn Investment Conference presentation shorting Lehman Brothers in May 2008 — months before the firm's collapse. One of the most consequential public investment pitches in hedge fund history." },
    { title: "SEC EDGAR — Greenlight Capital Inc 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1079114&type=13F", type: "report", description: "Direct link to all historic 13F-HR filings on SEC EDGAR (Q1 2016–Q4 2023 under Greenlight Capital Inc; Q1 2024 onwards under DME Capital Management LP)." },
  ],
  "1056831": [ // Fairholme Capital Management LLC — Bruce Berkowitz
    { title: "Fairholme Funds — Official Website", url: "https://www.fairholmefunds.com/", type: "website", description: "Investor resources, shareholder letters, and portfolio commentary from Bruce Berkowitz's Fairholme Fund — one of the most distinctive concentrated value funds in the US." },
    { title: "Bruce Berkowitz — Wikipedia", url: "https://en.wikipedia.org/wiki/Bruce_Berkowitz", type: "article", description: "Background on Berkowitz's career, his founding of Fairholme in 1999, his Morningstar Fund Manager of the Decade award (2010), and his concentrated contrarian positions in financials and GSEs." },
    { title: "Fairholme Fund — Wikipedia", url: "https://en.wikipedia.org/wiki/Fairholme_Fund", type: "article", description: "History of the Fairholme Fund, its strategy of extreme concentration in misunderstood businesses, its record financial-crisis bets on AIG and Citigroup, and its long-running GSE campaign." },
    { title: "Bruce Berkowitz — Interview (WealthTrack, 2019)", url: "https://www.youtube.com/watch?v=6jYSlG5S9Y4", type: "video", description: "Berkowitz discusses his investment philosophy — 'ignore the crowd, do the math, bet on survival' — and his thesis on Fannie Mae, Freddie Mac, and St. Joe Company." },
    { title: "Fairholme Shareholder Letters", url: "https://www.fairholmefunds.com/sites/default/files/FairholmeFundAnnualReport2023.pdf", type: "report", description: "Annual shareholder letters from Berkowitz outlining portfolio positions, macro views, and the fund's concentrated approach to value investing." },
    { title: "SEC EDGAR — Fairholme Capital Management 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1056831&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1263508": [ // Baker Bros. Advisors LP — Felix & Julian Baker (biotech-focused long-term fund)
    { title: "Baker Bros. Advisors — SEC EDGAR Profile", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1263508&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR for Baker Bros. Advisors LP." },
    { title: "Felix Baker — Wikipedia", url: "https://en.wikipedia.org/wiki/Felix_Baker", type: "article", description: "Background on Felix Baker's career, his PhD in immunology from UCSF, and the founding of Baker Bros. Advisors with his brother Julian as a long-term biotech-focused fund." },
    { title: "Baker Brothers — Profile (Forbes Billionaires)", url: "https://www.forbes.com/profile/julian-baker/", type: "article", description: "Forbes profile of the Baker brothers covering their investment philosophy, their record in biotech, and their landmark positions in companies like Incyte, Seagen, and BioNTech." },
    { title: "Baker Bros. Philosophy — 'Permanent Capital' Biotech Investing", url: "https://www.barrons.com/articles/baker-bros-biotech-hedge-fund-51600470345", type: "commentary", description: "Barron's profile of Baker Bros.' contrarian, science-first approach to biotech investing — holding positions for a decade or longer and building deep scientific expertise in each portfolio company." },
    { title: "Julian Baker — UCSF Science & Society Lecture", url: "https://www.youtube.com/watch?v=vX8G3p2jVRc", type: "video", description: "Julian Baker discusses how Baker Bros. evaluates scientific risk in early-stage biotech companies, their long time horizon, and what distinguishes transformative drugs from incremental ones." },
  ],
  "1767640": [ // Public Investment Fund — Yasir Al-Rumayyan (Saudi Arabia's sovereign wealth fund)
    { title: "Public Investment Fund — Official Website", url: "https://www.pif.gov.sa/en/", type: "website", description: "Investor relations, strategy overview, and portfolio information for Saudi Arabia's sovereign wealth fund, one of the largest in the world." },
    { title: "Public Investment Fund — Wikipedia", url: "https://en.wikipedia.org/wiki/Public_Investment_Fund", type: "article", description: "History of the PIF from its founding in 1971 through its transformation under Vision 2030 into a global mega-fund targeting $1 trillion in AUM." },
    { title: "Yasir Al-Rumayyan — Wikipedia", url: "https://en.wikipedia.org/wiki/Yasir_Al-Rumayyan", type: "article", description: "Background on the PIF's governor, his role driving the fund's international investment strategy, and his board positions including Newcastle United FC and Aramco." },
    { title: "Saudi Arabia's Vision 2030 — PIF Programme", url: "https://www.vision2030.gov.sa/en/explore/programs/public-investment-fund-program", type: "report", description: "The official Vision 2030 program page outlining PIF's mandate to diversify the Saudi economy, develop domestic industries, and build a world-class international portfolio." },
    { title: "PIF at the 2024 Future Investment Initiative", url: "https://www.youtube.com/watch?v=4yXHnHCCDEE", type: "video", description: "Keynote sessions and panel discussions from the FII conference hosted by PIF in Riyadh, covering global investment themes and PIF's strategic priorities." },
    { title: "SEC EDGAR — Public Investment Fund 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1767640&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "921669": [ // Icahn Capital LP — Carl Icahn
    { title: "Icahn Enterprises — Official Website", url: "https://www.ielp.com/", type: "website", description: "Investor relations and annual reports for Icahn Enterprises LP, the publicly traded holding company through which Carl Icahn conducts most of his major investments." },
    { title: "Carl Icahn — Wikipedia", url: "https://en.wikipedia.org/wiki/Carl_Icahn", type: "article", description: "Overview of Icahn's career from his early options arbitrage days to his emergence as Wall Street's most feared corporate raider and activist investor, spanning six decades." },
    { title: "Icahn Enterprises — Wikipedia", url: "https://en.wikipedia.org/wiki/Icahn_Enterprises", type: "article", description: "Background on the Icahn Enterprises holding company, its diversified subsidiary structure (energy, automotive, real estate, gaming, food packaging), and its history of activist campaigns." },
    { title: "Carl Icahn at the 2019 Delivering Alpha Conference", url: "https://www.youtube.com/watch?v=yX7L3kGwwA0", type: "video", description: "Icahn discusses corporate governance, his views on activist investing, and specific portfolio positions — one of his most candid recent public appearances." },
    { title: "Carl Icahn — The Activist Investor (CNBC Documentary)", url: "https://www.youtube.com/watch?v=x5P5gXjDEuU", type: "video", description: "A profile of Icahn's investing career, his tactics for forcing management change, and his landmark battles with companies like TWA, Texaco, and Apple." },
    { title: "SEC EDGAR — Icahn Carl C 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=921669&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1035674": [ // Paulson & Co. — John Paulson
    { title: "Paulson & Co. — Official Website", url: "https://www.paulsonco.com/", type: "website", description: "Firm overview and investor information for John Paulson's event-driven and merger-arbitrage hedge fund, founded in 1994." },
    { title: "John Paulson — Wikipedia", url: "https://en.wikipedia.org/wiki/John_Paulson", type: "article", description: "Background on Paulson's career, the founding of Paulson & Co. in 1994, and his legendary 'Greatest Trade Ever' — a $15 billion profit shorting the US housing market in 2007." },
    { title: "Paulson & Co. — Wikipedia", url: "https://en.wikipedia.org/wiki/Paulson_%26_Co.", type: "article", description: "History of the fund, its event-driven and merger-arbitrage roots, the famous subprime short via credit default swaps, its subsequent gold strategy, and its conversion to a family office." },
    { title: "The Greatest Trade Ever (Book)", url: "https://www.amazon.com/dp/0385529945", type: "article", description: "Gregory Zuckerman's definitive account of how John Paulson and a small team recognised the US housing bubble and structured a $15 billion trade against subprime mortgages in 2007 — one of the largest profits in Wall Street history." },
    { title: "John Paulson — Bloomberg Interview on Gold & Macro (2011)", url: "https://www.youtube.com/watch?v=G4Qb2V52Bw4", type: "video", description: "Paulson discusses his macro outlook, his large gold position via the SPDR Gold Trust, and his views on inflation — at the peak of Paulson & Co.'s AUM." },
    { title: "SEC EDGAR — Paulson & Co. 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1035674&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1115373": [ // Semper Augustus Investment Group — Christopher Bloomstran
    { title: "Semper Augustus — Official Website", url: "https://semperaugustus.com/", type: "website", description: "Christopher Bloomstran's Colorado-based value investment firm, managing concentrated equity portfolios since 1998 with a deep fundamental approach rooted in intrinsic value analysis and long holding periods." },
    { title: "Semper Augustus Annual Letters", url: "https://semperaugustus.com/letters/", type: "report", description: "Bloomstran's celebrated annual client letters — among the most detailed and analytically rigorous in the investment industry — covering portfolio holdings, valuation, and Bloomstran's extended analysis of Berkshire Hathaway." },
    { title: "Christopher Bloomstran — Twitter / X", url: "https://twitter.com/bloomstranvalue", type: "article", description: "Bloomstran's public commentary on markets, valuation, and investment philosophy, including real-time thoughts on Berkshire Hathaway and broader capital allocation topics." },
    { title: "SEC EDGAR — Semper Augustus 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1115373&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1404599": [ // Aquamarine Capital Management — Guy Spier
    { title: "Aquamarine Capital — Official Website", url: "https://aquamarinefund.com/", type: "website", description: "Guy Spier's Zurich-based investment partnership, managing the Aquamarine Fund since 1997 in the tradition of Warren Buffett's original partnerships — concentrated, long-only value investing with a permanent capital mindset." },
    { title: "Guy Spier — 'The Education of a Value Investor' (Book)", url: "https://www.amazon.com/Education-Value-Investor-Transformative-Strategies/dp/1137278811", type: "article", description: "Guy Spier's memoir detailing his journey from a high-pressure Wall Street career to becoming a principled long-term value investor, and his famous $650,100 charity lunch with Warren Buffett." },
    { title: "Guy Spier — Annual Letters (Aquamarine Fund)", url: "https://aquamarinefund.com/letters/", type: "report", description: "Annual investor letters from Guy Spier covering Aquamarine Fund's portfolio activity, investment philosophy, and reflections on compounding capital as a Buffett-style value investor." },
    { title: "SEC EDGAR — Aquamarine Capital 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1404599&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1034524": [ // Polen Capital Management — David Polen
    { title: "Polen Capital — Official Website", url: "https://www.polencapital.com/", type: "website", description: "Firm overview for Polen Capital's concentrated, high-quality growth equity strategies, including the Focus Growth strategy that has compounded capital since 1989 by owning a small number of durable, high-return businesses." },
    { title: "Polen Capital — Wikipedia", url: "https://en.wikipedia.org/wiki/Polen_Capital", type: "article", description: "Background on the Boca Raton-based investment manager founded in 1979 by Dave Polen, known for its concentrated approach to large-cap quality growth investing and its flagship Focus Growth strategy." },
    { title: "Dan Davidowitz & Damon Ficklin — Investment Team", url: "https://www.polencapital.com/team", type: "website", description: "Profile of Polen Capital's lead portfolio managers, who oversee the flagship Focus Growth strategy with a mandate of holding roughly 20–25 high-quality, high-return-on-equity businesses indefinitely." },
    { title: "SEC EDGAR — Polen Capital 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1034524&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1581811": [ // Egerton Capital — John Armitage
    { title: "Egerton Capital — Wikipedia", url: "https://en.wikipedia.org/wiki/Egerton_Capital", type: "article", description: "Overview of John Armitage's London-based long/short equity hedge fund, founded in 1994, known for its disciplined fundamental approach across European and global equities and one of Europe's longest-running and most respected hedge funds." },
    { title: "John Armitage — Profile (Forbes)", url: "https://www.forbes.com/profile/john-armitage/", type: "article", description: "Forbes profile of Armitage, Egerton Capital's founder and chief investment officer, covering his investment philosophy and Egerton's track record as one of Europe's premier fundamental equity managers." },
    { title: "Egerton Capital — Institutional Investor Profile", url: "https://www.institutionalinvestor.com/article/b1505pkgnw6vj0/the-quiet-giant-of-european-hedge-funds", type: "article", description: "In-depth profile of Egerton Capital's low-profile but highly regarded approach to long/short equity investing across global markets, and its reputation for generating consistent returns over three decades." },
    { title: "SEC EDGAR — Egerton Capital 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1581811&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1553733": [ // Brave Warrior Advisors — Glenn Greenberg
    { title: "Brave Warrior Advisors — Wikipedia", url: "https://en.wikipedia.org/wiki/Brave_Warrior_Advisors", type: "article", description: "Overview of Glenn Greenberg's concentrated long-only value fund, founded in 2011 after he left Chieftain Capital, known for holding a very small number of high-conviction positions for extended periods." },
    { title: "Glenn Greenberg — Profile (Institutional Investor)", url: "https://www.institutionalinvestor.com/article/b14zb8cgxs7m4p/the-greenberg-variations", type: "article", description: "Profile of Greenberg's investment philosophy at Chieftain Capital and Brave Warrior, his emphasis on owning dominant businesses at reasonable prices with minimal portfolio turnover." },
    { title: "Chieftain Capital Management — Wikipedia", url: "https://en.wikipedia.org/wiki/Chieftain_Capital_Management", type: "article", description: "History of Chieftain Capital, the predecessor firm Greenberg co-founded and ran for decades before launching Brave Warrior Advisors in 2011." },
    { title: "SEC EDGAR — Brave Warrior Advisors 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1553733&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1345471": [ // Trian Fund Management — Nelson Peltz
    { title: "Trian Fund Management — Official Website", url: "https://www.trianpartners.com/", type: "website", description: "Firm overview for Nelson Peltz's activist hedge fund, founded in 2005, known for taking concentrated positions in large-cap companies and engaging management to improve operational performance and shareholder returns." },
    { title: "Nelson Peltz — Wikipedia", url: "https://en.wikipedia.org/wiki/Nelson_Peltz", type: "article", description: "Background on Peltz's career as one of the most prominent activist investors of the past four decades, co-founding Trian Fund Management and running high-profile campaigns at companies including Procter & Gamble, Disney, GE, and Unilever." },
    { title: "Trian Fund Management — Wikipedia", url: "https://en.wikipedia.org/wiki/Trian_Fund_Management", type: "article", description: "History of Peltz's activist hedge fund, its investment philosophy of combining long-term ownership with operational engagement, and its major campaigns across consumer, industrial, and financial companies." },
    { title: "Nelson Peltz — Profile (Forbes Billionaires)", url: "https://www.forbes.com/profile/nelson-peltz/", type: "article", description: "Forbes profile covering Peltz's net worth, investment approach, and his track record of unlocking value through board representation and strategic engagement with management teams." },
    { title: "SEC EDGAR — Trian Fund Management 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1345471&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1106500": [ // Joho Capital — Robert Karr
    { title: "Joho Capital — Wikipedia", url: "https://en.wikipedia.org/wiki/Joho_Capital", type: "article", description: "Overview of Robert Karr's concentrated global long/short equity fund, founded in 1999, known for deep-value positions in Japanese and Asian equities alongside U.S. technology holdings." },
    { title: "Robert Karr — Profile (Institutional Investor)", url: "https://www.institutionalinvestor.com/article/b150nrg4rqnlql/robert-karr-joho-capital", type: "article", description: "Profile of Karr's investment philosophy, his background as a former Tiger Cub under Julian Robertson, and Joho Capital's focus on identifying mispriced global businesses." },
    { title: "Tiger Cubs: The Legacy of Julian Robertson (Bloomberg)", url: "https://www.bloomberg.com/news/articles/2010-07-26/tiger-cubs-julian-robertson-spawned-hedge-fund-empire", type: "commentary", description: "How Tiger Management became the training ground for Karr and a generation of globally-oriented fundamental investors who went on to found their own hedge funds." },
    { title: "SEC EDGAR — Joho Capital 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1106500&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1061165": [ // Lone Pine Capital — Lee Ainslie
    { title: "Lone Pine Capital — Wikipedia", url: "https://en.wikipedia.org/wiki/Lone_Pine_Capital", type: "article", description: "Overview of Lee Ainslie's long/short equity hedge fund, founded in 1997 as one of the most prominent Tiger Cubs, known for deep fundamental research across global technology, consumer, and healthcare sectors." },
    { title: "Lee Ainslie — Wikipedia", url: "https://en.wikipedia.org/wiki/Lee_Ainslie", type: "article", description: "Background on Ainslie's career as a protégé of Julian Robertson at Tiger Management and his founding of Lone Pine Capital in 1997, one of the most respected and consistently profitable Tiger Cub funds." },
    { title: "Lee Ainslie — Profile (Forbes Billionaires)", url: "https://www.forbes.com/profile/lee-ainslie/", type: "article", description: "Forbes profile covering Ainslie's investment approach, Lone Pine's track record, and his reputation for rigorous fundamental analysis in both long and short positions." },
    { title: "Tiger Cubs: The Legacy of Julian Robertson (Bloomberg)", url: "https://www.bloomberg.com/news/articles/2010-07-26/tiger-cubs-julian-robertson-spawned-hedge-fund-empire", type: "commentary", description: "How Tiger Management became the training ground for Ainslie, Halvorsen, Coleman, Laffont, and a generation of technology-focused hedge fund managers who went on to define the Tiger Cub dynasty." },
    { title: "Lone Pine Capital — ADV Filing (SEC)", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1061165&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1135730": [ // Coatue Management — Philippe Laffont
    { title: "Coatue Management — Official Website", url: "https://www.coatue.com/", type: "website", description: "Firm overview for Philippe Laffont's technology-focused long/short hedge fund, founded in 1999, covering public equities, venture, and growth investing." },
    { title: "Philippe Laffont — Wikipedia", url: "https://en.wikipedia.org/wiki/Philippe_Laffont", type: "article", description: "Background on Laffont's career as a Tiger Cub under Julian Robertson, his founding of Coatue Management in 1999, and his reputation as one of the sharpest technology-sector investors in the hedge fund world." },
    { title: "Philippe Laffont — Profile (Forbes Billionaires)", url: "https://www.forbes.com/profile/philippe-laffont/", type: "article", description: "Forbes profile covering Laffont's investment approach, Coatue's expansion into venture and growth capital, and his record in identifying technology trends early." },
    { title: "Philippe Laffont — Invest Like the Best Podcast (2020)", url: "https://www.youtube.com/watch?v=fJ6bBBT7kPc", type: "video", description: "In-depth conversation with Laffont on Coatue's investment process, how they think about technology disruption, and the evolution from a pure long/short hedge fund to a multi-stage platform." },
    { title: "Tiger Cubs: The Legacy of Julian Robertson (Bloomberg)", url: "https://www.bloomberg.com/news/articles/2010-07-26/tiger-cubs-julian-robertson-spawned-hedge-fund-empire", type: "commentary", description: "How Tiger Management became the training ground for Laffont, Halvorsen, Coleman, and a generation of technology-focused hedge fund managers." },
    { title: "SEC EDGAR — Coatue Management 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1135730&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1103804": [ // Viking Global Investors — Andreas Halvorsen
    { title: "Viking Global Investors — Official Website", url: "https://www.vikingglobal.com/", type: "website", description: "Firm overview and investor information for Andreas Halvorsen's long/short global equity hedge fund, founded in 1999." },
    { title: "Andreas Halvorsen — Wikipedia", url: "https://en.wikipedia.org/wiki/Andreas_Halvorsen", type: "article", description: "Background on Halvorsen's career as a protégé of Julian Robertson at Tiger Management, his founding of Viking Global in 1999, and his reputation as one of the most consistently successful Tiger Cub fund managers." },
    { title: "Viking Global Investors — Wikipedia", url: "https://en.wikipedia.org/wiki/Viking_Global_Investors", type: "article", description: "History of the fund, its long/short equity approach across global technology, healthcare, and consumer sectors, and its reputation for deep fundamental research." },
    { title: "Andreas Halvorsen — Profile (Forbes Billionaires)", url: "https://www.forbes.com/profile/andreas-halvorsen/", type: "article", description: "Forbes profile of Halvorsen covering his investment style, returns record, and his position as one of the wealthiest hedge fund managers in the world." },
    { title: "Tiger Cubs: The Legacy of Julian Robertson (Bloomberg)", url: "https://www.bloomberg.com/news/articles/2010-07-26/tiger-cubs-julian-robertson-spawned-hedge-fund-empire", type: "commentary", description: "How Julian Robertson's Tiger Management became a training ground for some of the most successful hedge fund managers of the past three decades — including Halvorsen, Coleman, and Lee Ainslie." },
    { title: "SEC EDGAR — Viking Global Investors 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1103804&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
  ],
  "1720792": [ // Ruane, Cunniff & Goldfarb — David Poppe (Sequoia Fund)
    { title: "Sequoia Fund — Official Website", url: "https://www.sequoiafund.com/", type: "website", description: "Shareholder letters, annual reports, and commentary from the managers of the Sequoia Fund, one of the most storied concentrated value funds in America." },
    { title: "Sequoia Fund — Shareholder Letters", url: "https://www.sequoiafund.com/investor-resources/", type: "report", description: "Annual and semi-annual letters to Sequoia Fund shareholders covering portfolio activity, business analysis, and long-term investment thinking." },
    { title: "Ruane, Cunniff & Goldfarb — Wikipedia", url: "https://en.wikipedia.org/wiki/Ruane,_Cunniff_%26_Goldfarb", type: "article", description: "History of the firm, its founding by William Ruane on Warren Buffett's personal recommendation in 1969, and its long association with the Sequoia Fund." },
    { title: "Sequoia Fund — Wikipedia", url: "https://en.wikipedia.org/wiki/Sequoia_Fund", type: "article", description: "Overview of the Sequoia Fund's founding, long-term performance record, concentration philosophy, and the Valeant Pharmaceuticals controversy." },
    { title: "SEC EDGAR — Ruane, Cunniff & Goldfarb 13F Filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1720792&type=13F", type: "report", description: "Direct link to all 13F-HR filings on SEC EDGAR." },
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
