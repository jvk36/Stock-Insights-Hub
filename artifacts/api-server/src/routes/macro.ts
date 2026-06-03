import { Router, type IRouter } from "express";
import { GetMacroSeriesObservationsParams, GetMacroSeriesObservationsQueryParams } from "@workspace/api-zod";
import YahooFinance from "yahoo-finance2";

const router: IRouter = Router();
const yf = new YahooFinance();

const FRED_API_KEY = process.env.FRED_API_KEY ?? "d742093f0888fd32b5c9d8743aa1b772";
const FRED_BASE = "https://api.stlouisfed.org/fred";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FredObsResponse {
  observations?: Array<{ date: string; value: string }>;
  seriess?: Array<{ title: string; units: string; units_short: string }>;
}

interface IndicatorDef {
  id: string;
  seriesId: string;
  title: string;
  unitsLabel: string;
  chartUnits: string;
  source: string;
  frequency: string;
  category: string;
  type?: string;
  whyItMatters?: string;
}

// ─── FRED series definitions ──────────────────────────────────────────────────

const INDICATORS: IndicatorDef[] = [
  // Overview - Key Readings
  { id: "gdp_growth",       seriesId: "A191RL1Q225SBEA", title: "GDP Growth (Annualized)",       unitsLabel: "% QoQ ann.", chartUnits: "lin", source: "BEA",           frequency: "Quarterly", category: "overview" },
  { id: "cpi_yoy",          seriesId: "CPIAUCSL",         title: "CPI (YoY)",                    unitsLabel: "% YoY",      chartUnits: "pc1", source: "BLS",           frequency: "Monthly",   category: "overview" },
  { id: "unemployment",     seriesId: "UNRATE",           title: "Unemployment Rate",             unitsLabel: "%",          chartUnits: "lin", source: "BLS",           frequency: "Monthly",   category: "overview" },
  { id: "fed_funds",        seriesId: "FEDFUNDS",         title: "Fed Funds Rate",                unitsLabel: "%",          chartUnits: "lin", source: "Federal Reserve", frequency: "Monthly", category: "overview" },
  { id: "t10y",             seriesId: "DGS10",            title: "10-Year Treasury Yield",        unitsLabel: "%",          chartUnits: "lin", source: "Federal Reserve", frequency: "Daily",   category: "overview" },
  { id: "indpro_yoy",       seriesId: "INDPRO",           title: "Industrial Production (YoY)",   unitsLabel: "% YoY",      chartUnits: "pc1", source: "Federal Reserve", frequency: "Monthly", category: "overview" },
  // Overview - Signal Dashboard
  { id: "yield_curve",      seriesId: "T10Y2Y",           title: "Yield Curve (2s10s)",           unitsLabel: "%",          chartUnits: "lin", source: "Federal Reserve", frequency: "Daily",   category: "overview" },
  { id: "hy_oas",           seriesId: "BAMLH0A0HYM2",    title: "Credit Spreads (HY OAS)",        unitsLabel: "bps",        chartUnits: "lin", source: "ICE BofA",      frequency: "Daily",    category: "overview" },
  { id: "nfp_mom",          seriesId: "PAYEMS",           title: "Labor Market (NFP MoM)",         unitsLabel: "K",          chartUnits: "ch1", source: "BLS",           frequency: "Monthly",   category: "overview" },
  { id: "recession_prob",   seriesId: "RECPROUSM156N",    title: "Recession Probability",          unitsLabel: "%",          chartUnits: "lin", source: "Federal Reserve", frequency: "Monthly", category: "overview" },
  // GDP tab
  { id: "real_gdp",         seriesId: "A191RL1Q225SBEA", title: "Real GDP (Annualized)",          unitsLabel: "% QoQ ann.", chartUnits: "lin", source: "BEA",           frequency: "Quarterly",   category: "gdp",  type: "Lagging" },
  { id: "gdpnow",           seriesId: "GDPNOW",           title: "Atlanta Fed GDPNow",             unitsLabel: "% ann.",     chartUnits: "lin", source: "Atlanta Fed",   frequency: "Updates vary", category: "gdp", type: "Real-Time" },
  { id: "cfnai",            seriesId: "CFNAI",            title: "Chicago Fed CFNAI",              unitsLabel: "Index",      chartUnits: "lin", source: "Chicago Fed",   frequency: "Monthly",     category: "gdp",  type: "Coincident" },
  { id: "indpro",           seriesId: "INDPRO",           title: "Industrial Production",          unitsLabel: "% YoY",      chartUnits: "pc1", source: "Federal Reserve", frequency: "Monthly",  category: "gdp",  type: "Coincident" },
  { id: "retail_ex_auto",   seriesId: "RSXFS",            title: "Retail Sales (ex-auto)",         unitsLabel: "% YoY",      chartUnits: "pc1", source: "Census Bureau", frequency: "Monthly",    category: "gdp",  type: "Coincident" },
  { id: "durable_goods",    seriesId: "DGORDER",          title: "Durable Goods Orders",           unitsLabel: "% YoY",      chartUnits: "pc1", source: "Census Bureau", frequency: "Monthly",    category: "gdp",  type: "Leading" },
  { id: "building_permits", seriesId: "PERMIT",           title: "Building Permits",               unitsLabel: "K",          chartUnits: "lin", source: "Census Bureau", frequency: "Monthly",    category: "gdp",  type: "Leading" },
  // Inflation - Headline Cards
  { id: "core_cpi_yoy",     seriesId: "CPILFESL",         title: "Core CPI (YoY)",                unitsLabel: "% YoY",      chartUnits: "pc1", source: "BLS",           frequency: "Monthly",   category: "inflation" },
  { id: "pce_yoy",          seriesId: "PCEPI",            title: "PCE Deflator (YoY)",            unitsLabel: "% YoY",      chartUnits: "pc1", source: "BEA",           frequency: "Monthly",   category: "inflation" },
  { id: "core_pce_yoy",     seriesId: "PCEPILFE",         title: "Core PCE (YoY)",                unitsLabel: "% YoY",      chartUnits: "pc1", source: "BEA",           frequency: "Monthly",   category: "inflation" },
  // Inflation - CPI Components
  { id: "shelter_oer",      seriesId: "CUSR0000SEHC",    title: "Shelter / OER",                  unitsLabel: "% YoY",      chartUnits: "pc1", source: "BLS",           frequency: "Monthly",   category: "inflation" },
  { id: "supercore",        seriesId: "CUSR0000SASLE",   title: "Supercore (Services ex-Energy)", unitsLabel: "% YoY",      chartUnits: "pc1", source: "BLS",           frequency: "Monthly",   category: "inflation" },
  { id: "food_at_home",     seriesId: "CUUR0000SAF11",   title: "Food at Home",                   unitsLabel: "% YoY",      chartUnits: "pc1", source: "BLS",           frequency: "Monthly",   category: "inflation" },
  { id: "energy_cpi",       seriesId: "CUUR0000SA0E",    title: "Energy",                          unitsLabel: "% YoY",      chartUnits: "pc1", source: "BLS",           frequency: "Monthly",   category: "inflation" },
  { id: "new_vehicles",     seriesId: "CUUR0000SETA01",  title: "New Vehicles",                   unitsLabel: "% YoY",      chartUnits: "pc1", source: "BLS",           frequency: "Monthly",   category: "inflation" },
  // Inflation - Full Suite extras
  { id: "ppi",              seriesId: "PPIFIS",           title: "PPI (Final Demand)",             unitsLabel: "% YoY",      chartUnits: "pc1", source: "BLS",           frequency: "Monthly",   category: "inflation", whyItMatters: "Leading indicator of consumer inflation" },
  { id: "breakeven_5y5y",   seriesId: "T5YIFR",          title: "5Y5Y Breakeven Rate",            unitsLabel: "%",          chartUnits: "lin", source: "Federal Reserve", frequency: "Daily",   category: "inflation", whyItMatters: "Market-based 5y inflation expectations starting in 5y" },
  { id: "mich_infl_1y",     seriesId: "MICH",             title: "Michigan Inflation Exp. (1Y)",  unitsLabel: "%",          chartUnits: "lin", source: "U. of Michigan", frequency: "Monthly",  category: "inflation", whyItMatters: "Consumer inflation expectations drive wage negotiations" },
  // Labor - Health Cards
  { id: "avg_hrly_earn",    seriesId: "CES0500000003",   title: "Avg Hourly Earnings (YoY)",      unitsLabel: "% YoY",      chartUnits: "pc1", source: "BLS",           frequency: "Monthly",   category: "labor" },
  { id: "jolts",            seriesId: "JTSJOL",           title: "Job Openings (JOLTS)",           unitsLabel: "K",          chartUnits: "lin", source: "BLS",           frequency: "Monthly",   category: "labor" },
  // Labor - Full Suite extras
  { id: "u6_unemp",         seriesId: "U6RATE",           title: "U-6 Unemployment Rate",          unitsLabel: "%",          chartUnits: "lin", source: "BLS",           frequency: "Monthly",   category: "labor" },
  { id: "lfpr",             seriesId: "CIVPART",          title: "Labor Force Participation Rate", unitsLabel: "%",          chartUnits: "lin", source: "BLS",           frequency: "Monthly",   category: "labor" },
  { id: "prime_age_lfpr",   seriesId: "LNS11300060",     title: "Prime-Age LFPR (25-54)",         unitsLabel: "%",          chartUnits: "lin", source: "BLS",           frequency: "Monthly",   category: "labor" },
  { id: "quits_rate",       seriesId: "JTSQUR",           title: "Quits Rate",                    unitsLabel: "%",          chartUnits: "lin", source: "BLS",           frequency: "Monthly",   category: "labor" },
  { id: "jobless_claims",   seriesId: "ICSA",             title: "Initial Jobless Claims",         unitsLabel: "K",          chartUnits: "lin", source: "DOL",           frequency: "Weekly",    category: "labor" },
  { id: "cont_claims",      seriesId: "CCSA",             title: "Continuing Claims",              unitsLabel: "K",          chartUnits: "lin", source: "DOL",           frequency: "Weekly",    category: "labor" },
  { id: "avg_wkly_hrs",     seriesId: "AWHAETP",          title: "Average Weekly Hours",           unitsLabel: "Hrs",        chartUnits: "lin", source: "BLS",           frequency: "Monthly",   category: "labor" },
  // Financial Conditions - Cards
  { id: "t2y",              seriesId: "DGS2",             title: "2Y Treasury Yield",              unitsLabel: "%",          chartUnits: "lin", source: "Federal Reserve", frequency: "Daily",   category: "financial" },
  // Financial Conditions - Full Suite extras
  { id: "mortgage30",       seriesId: "MORTGAGE30US",    title: "30Y Mortgage Rate",              unitsLabel: "%",          chartUnits: "lin", source: "Freddie Mac",    frequency: "Weekly",    category: "financial" },
  { id: "ig_oas",           seriesId: "BAMLC0A0CM",      title: "IG Credit Spread (OAS)",         unitsLabel: "bps",        chartUnits: "lin", source: "ICE BofA",      frequency: "Daily",     category: "financial" },
  { id: "nfci",             seriesId: "NFCI",             title: "Chicago Fed NFCI",               unitsLabel: "Index",      chartUnits: "lin", source: "Chicago Fed",   frequency: "Weekly",    category: "financial" },
  { id: "vix",              seriesId: "VIXCLS",           title: "VIX (Implied Volatility)",       unitsLabel: "Index",      chartUnits: "lin", source: "CBOE",          frequency: "Daily",     category: "financial" },
  { id: "usd_index",        seriesId: "DTWEXBGS",        title: "USD Index (Broad)",              unitsLabel: "Index",      chartUnits: "lin", source: "Federal Reserve", frequency: "Daily",   category: "financial" },
  { id: "wti_crude",        seriesId: "DCOILWTICO",      title: "WTI Crude Oil",                  unitsLabel: "$/bbl",      chartUnits: "lin", source: "EIA",           frequency: "Daily",     category: "financial" },
  { id: "m2_yoy",           seriesId: "M2SL",             title: "M2 Money Supply (YoY)",          unitsLabel: "% YoY",      chartUnits: "pc1", source: "Federal Reserve", frequency: "Monthly", category: "financial" },
  // Global
  { id: "ecb_rate",         seriesId: "ECBDFR",           title: "ECB Deposit Rate",               unitsLabel: "%",          chartUnits: "lin", source: "ECB",            frequency: "Irregular", category: "global" },
  { id: "boe_rate",         seriesId: "IUDSONIA",         title: "BoE SONIA Rate",                 unitsLabel: "%",          chartUnits: "lin", source: "BoE",            frequency: "Daily",     category: "global" },
  { id: "ez_cpi_yoy",       seriesId: "CP0000EZ19M086NEST", title: "Eurozone CPI (YoY)",          unitsLabel: "% YoY",      chartUnits: "pc1", source: "Eurostat",       frequency: "Monthly",   category: "global" },
  { id: "jp_cpi_yoy",       seriesId: "JPNCPIALLMINMEI",  title: "Japan CPI (YoY)",               unitsLabel: "% YoY",      chartUnits: "pc1", source: "MIC Japan",      frequency: "Monthly",   category: "global" },
  { id: "uk_cpi_yoy",       seriesId: "GBRCPIALLMINMEI",  title: "UK CPI (YoY)",                  unitsLabel: "% YoY",      chartUnits: "pc1", source: "ONS",            frequency: "Monthly",   category: "global" },
  { id: "cn_cpi_yoy",       seriesId: "CHNCPIALLMINMEI",  title: "China CPI (YoY)",               unitsLabel: "% YoY",      chartUnits: "pc1", source: "NBS China",      frequency: "Monthly",   category: "global" },
  { id: "ez_unemp",         seriesId: "LRHUTTTTEZM156S",  title: "Eurozone Unemployment",          unitsLabel: "%",          chartUnits: "lin", source: "Eurostat",       frequency: "Monthly",   category: "global" },
  { id: "brent_crude",      seriesId: "DCOILBRENTEU",    title: "Brent Crude ($/bbl)",            unitsLabel: "$/bbl",      chartUnits: "lin", source: "EIA",            frequency: "Daily",     category: "global" },
  { id: "eurusd",           seriesId: "DEXUSEU",          title: "EUR/USD",                        unitsLabel: "Rate",       chartUnits: "lin", source: "Federal Reserve", frequency: "Daily",   category: "global" },
  { id: "usdjpy",           seriesId: "DEXJPUS",          title: "USD/JPY",                        unitsLabel: "Rate",       chartUnits: "lin", source: "Federal Reserve", frequency: "Daily",   category: "global" },
  { id: "usdcny",           seriesId: "DEXCHUS",          title: "USD/CNY",                        unitsLabel: "Rate",       chartUnits: "lin", source: "Federal Reserve/PBoC", frequency: "Daily", category: "global" },
];

// ─── Cache (stale-while-revalidate) ───────────────────────────────────────────

interface CacheEntry<T> { data: T; expires: number; refreshing?: boolean }
const cache = new Map<string, CacheEntry<unknown>>();

function fromCache<T>(key: string): { data: T; stale: boolean } | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  return { data: entry.data, stale: Date.now() > entry.expires };
}

function toCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

function isCacheRefreshing(key: string): boolean {
  return (cache.get(key) as CacheEntry<unknown> | undefined)?.refreshing === true;
}

function setCacheRefreshing(key: string, v: boolean): void {
  const e = cache.get(key);
  if (e) (e as CacheEntry<unknown>).refreshing = v;
}

// ─── Yahoo Finance helpers (market indicators — no rate limit issues) ─────────

// Indicators fetched from Yahoo Finance instead of FRED
const YAHOO_SYMBOLS: Partial<Record<string, string>> = {
  t10y:       "^TNX",       // 10-Year Treasury yield
  vix:        "^VIX",       // CBOE VIX
  wti_crude:  "CL=F",       // WTI Crude Oil
  brent_crude:"BZ=F",       // Brent Crude Oil
  usd_index:  "DX-Y.NYB",   // USD Index (DXY)
  eurusd:     "EURUSD=X",   // EUR/USD
  usdjpy:     "USDJPY=X",   // USD/JPY
  usdcny:     "USDCNY=X",   // USD/CNY
};

async function yahooLatest(symbol: string): Promise<{ value: number | null; date: string | null }> {
  try {
    const q = await yf.quote(symbol);
    const price = q.regularMarketPrice ?? null;
    if (price == null) return { value: null, date: null };
    const d = q.regularMarketTime
      ? new Date(q.regularMarketTime).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    return { value: price, date: d };
  } catch {
    return { value: null, date: null };
  }
}

// yield_curve is computed as 10Y (^TNX) minus 3M (^IRX) — an approximate proxy for the 10Y-2Y FRED spread
async function yahooYieldCurve(): Promise<{ value: number | null; date: string | null }> {
  try {
    const [q10y, q3m] = await Promise.all([
      yf.quote("^TNX"),
      yf.quote("^IRX"),
    ]);
    const v10 = q10y.regularMarketPrice;
    const v3m = q3m.regularMarketPrice;
    if (v10 != null && v3m != null) {
      return { value: parseFloat((v10 - v3m).toFixed(3)), date: new Date().toISOString().split("T")[0] };
    }
    return { value: null, date: null };
  } catch {
    return { value: null, date: null };
  }
}

// ─── FRED helpers ─────────────────────────────────────────────────────────────

const FRED_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; StockResearch/1.0; +https://replit.com)",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fredFetch(seriesId: string, units: string, limit: number): Promise<FredObsResponse> {
  const url = new URL(`${FRED_BASE}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", FRED_API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));
  if (units !== "lin") url.searchParams.set("units", units);

  // Single attempt — do not retry 403/429 (IP-level CDN blocks don't resolve on retry)
  const resp = await fetch(url.toString(), {
    headers: FRED_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`FRED ${seriesId}: HTTP ${resp.status}`);
  return resp.json() as Promise<FredObsResponse>;
}

async function fredLatest(def: IndicatorDef): Promise<{ value: number | null; date: string | null }> {
  try {
    // Fetch a few observations in case the most recent has "." (missing value)
    const data = await fredFetch(def.seriesId, def.chartUnits, 5);
    const obs = (data.observations ?? []).find((o) => o.value !== ".");
    if (!obs) return { value: null, date: null };
    const v = parseFloat(obs.value);
    return { value: isNaN(v) ? null : v, date: obs.date };
  } catch {
    return { value: null, date: null };
  }
}

// Serial execution with a fixed delay between each call to respect FRED rate limits
async function serialSettled<T>(
  fns: Array<() => Promise<T>>,
  delayBetweenMs: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < fns.length; i++) {
    if (i > 0) await delay(delayBetweenMs);
    try {
      results.push({ status: "fulfilled", value: await fns[i]() });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }
  return results;
}

// ─── Signal logic ─────────────────────────────────────────────────────────────

type Signal = "positive" | "negative" | "neutral" | "warning";

function getSignal(id: string, value: number | null): { signal: Signal; label: string; explanation: string } {
  if (value === null) return { signal: "neutral", label: "N/A", explanation: "Data unavailable" };

  switch (id) {
    case "gdp_growth": case "real_gdp":
      if (value >= 3) return { signal: "positive", label: "Strong", explanation: "GDP growth above 3% is robust" };
      if (value >= 1) return { signal: "neutral", label: "Moderate", explanation: "GDP growth is positive but below trend" };
      if (value >= 0) return { signal: "warning", label: "Weak", explanation: "Growth near stall speed" };
      return { signal: "negative", label: "Contraction", explanation: "Negative GDP growth indicates recession risk" };

    case "cpi_yoy": case "pce_yoy":
      if (value <= 2) return { signal: "positive", label: "At Target", explanation: "At or below the Fed's 2% target" };
      if (value <= 3) return { signal: "neutral", label: "Near Target", explanation: "Slightly above the 2% target" };
      if (value <= 5) return { signal: "warning", label: "Elevated", explanation: "Inflation is elevated above target" };
      return { signal: "negative", label: "High", explanation: "Inflation is significantly above target" };

    case "core_cpi_yoy": case "core_pce_yoy":
      if (value <= 2.5) return { signal: "positive", label: "Controlled", explanation: "Core inflation near target" };
      if (value <= 3.5) return { signal: "warning", label: "Sticky", explanation: "Core inflation still elevated" };
      return { signal: "negative", label: "Persistent", explanation: "Core inflation well above target — Fed remains hawkish" };

    case "unemployment":
      if (value <= 4) return { signal: "positive", label: "Tight", explanation: "Near full employment" };
      if (value <= 5) return { signal: "neutral", label: "Normal", explanation: "Labor market near natural unemployment" };
      return { signal: "negative", label: "Loose", explanation: "Unemployment elevated above full employment" };

    case "fed_funds":
      if (value >= 5) return { signal: "warning", label: "Restrictive", explanation: "Policy rate is well above neutral — restrictive stance" };
      if (value >= 3) return { signal: "warning", label: "Elevated", explanation: "Above neutral — moderately restrictive" };
      if (value >= 1) return { signal: "neutral", label: "Neutral", explanation: "Near neutral policy rate" };
      return { signal: "positive", label: "Accommodative", explanation: "Low rates support growth" };

    case "t10y": case "t2y":
      if (value >= 5) return { signal: "warning", label: "Very High", explanation: "High yields tighten financial conditions" };
      if (value >= 4) return { signal: "warning", label: "Elevated", explanation: "Yields are elevated, putting pressure on valuations" };
      if (value >= 2) return { signal: "neutral", label: "Normal", explanation: "Yields in a historically normal range" };
      return { signal: "positive", label: "Low", explanation: "Low yields are supportive for equities and borrowing" };

    case "yield_curve":
      if (value >= 0.5) return { signal: "positive", label: "Normal", explanation: "Positive slope indicates healthy growth expectations" };
      if (value >= 0) return { signal: "neutral", label: "Flat", explanation: "Near zero — watch for inversion" };
      if (value >= -0.5) return { signal: "warning", label: "Inverted", explanation: "Inversion historically signals recession risk" };
      return { signal: "negative", label: "Deeply Inverted", explanation: "Deep inversion is a strong recession signal" };

    case "hy_oas":
      if (value <= 300) return { signal: "positive", label: "Tight", explanation: "Tight spreads reflect risk appetite / low default risk" };
      if (value <= 500) return { signal: "neutral", label: "Normal", explanation: "Spreads in historical normal range" };
      if (value <= 700) return { signal: "warning", label: "Wide", explanation: "Widening spreads indicate rising credit stress" };
      return { signal: "negative", label: "Very Wide", explanation: "Stress levels seen near recessions" };

    case "ig_oas":
      if (value <= 100) return { signal: "positive", label: "Tight", explanation: "Tight IG spreads signal strong credit conditions" };
      if (value <= 150) return { signal: "neutral", label: "Normal", explanation: "Spreads in normal range" };
      return { signal: "warning", label: "Wide", explanation: "Widening spreads suggest financial stress" };

    case "nfp_mom":
      if (value >= 200) return { signal: "positive", label: "Strong", explanation: ">200K jobs is a strong labor market signal" };
      if (value >= 100) return { signal: "neutral", label: "Moderate", explanation: "Solid job growth but pace is moderating" };
      if (value >= 0) return { signal: "warning", label: "Weak", explanation: "Job growth is below trend" };
      return { signal: "negative", label: "Job Losses", explanation: "Net job losses — recession signal" };

    case "recession_prob":
      if (value <= 15) return { signal: "positive", label: "Low", explanation: "Recession probability is low" };
      if (value <= 30) return { signal: "neutral", label: "Moderate", explanation: "Elevated but not alarming recession odds" };
      if (value <= 50) return { signal: "warning", label: "Elevated", explanation: "High recession probability — caution warranted" };
      return { signal: "negative", label: "High", explanation: "Recession likely or already underway" };

    case "ism_mfg": case "ism_svcs":
      if (value >= 55) return { signal: "positive", label: "Expanding Fast", explanation: ">55 signals strong expansion" };
      if (value >= 50) return { signal: "positive", label: "Expanding", explanation: ">50 signals expansion in activity" };
      if (value >= 48) return { signal: "warning", label: "Slowing", explanation: "Near contraction territory" };
      return { signal: "negative", label: "Contracting", explanation: "<50 signals sector contraction" };

    case "vix":
      if (value <= 15) return { signal: "positive", label: "Complacent", explanation: "Low volatility — risk-on environment" };
      if (value <= 25) return { signal: "neutral", label: "Normal", explanation: "Volatility in typical range" };
      if (value <= 35) return { signal: "warning", label: "Elevated", explanation: "Rising fear — increased market uncertainty" };
      return { signal: "negative", label: "High Fear", explanation: "Extreme volatility — risk-off / crisis conditions" };

    case "nfci":
      if (value <= -0.5) return { signal: "positive", label: "Very Loose", explanation: "Very accommodative financial conditions" };
      if (value <= 0) return { signal: "positive", label: "Loose", explanation: "Accommodative — supportive of growth" };
      if (value <= 0.5) return { signal: "neutral", label: "Neutral", explanation: "Near neutral financial conditions" };
      return { signal: "warning", label: "Tight", explanation: "Tight financial conditions weigh on growth" };

    case "lfpr": case "prime_age_lfpr":
      return { signal: value >= 62 ? "positive" : "neutral", label: value >= 63 ? "Strong" : "Moderate", explanation: "Labor force participation reflects workforce engagement" };

    case "cfnai":
      if (value >= 0.2) return { signal: "positive", label: "Above Trend", explanation: "National activity above historical trend — growth broadening" };
      if (value >= -0.7) return { signal: "neutral", label: "Near Trend", explanation: "Economic activity near historical average" };
      return { signal: "warning", label: "Below Trend", explanation: "Activity below trend — recession risk elevated if sustained" };

    case "gdpnow":
      if (value >= 3) return { signal: "positive", label: "Strong", explanation: "GDPNow tracking above-trend growth" };
      if (value >= 1) return { signal: "neutral", label: "Moderate", explanation: "GDPNow tracking moderate growth" };
      if (value >= 0) return { signal: "warning", label: "Near Stall", explanation: "GDPNow near stall speed" };
      return { signal: "negative", label: "Contraction", explanation: "GDPNow tracking negative growth" };

    case "indpro":
      if (value >= 3) return { signal: "positive", label: "Strong", explanation: "Industrial output growing robustly above trend" };
      if (value >= 0) return { signal: "neutral", label: "Moderate", explanation: "Industrial production growing modestly" };
      if (value >= -2) return { signal: "warning", label: "Slowing", explanation: "Industrial production declining mildly" };
      return { signal: "negative", label: "Contracting", explanation: "Industrial production in sharp contraction" };

    case "retail_ex_auto":
      if (value >= 4) return { signal: "positive", label: "Strong", explanation: "Consumer spending showing robust growth" };
      if (value >= 1) return { signal: "neutral", label: "Moderate", explanation: "Retail sales growing at a moderate pace" };
      if (value >= -1) return { signal: "warning", label: "Slowing", explanation: "Consumer spending growth has stalled" };
      return { signal: "negative", label: "Declining", explanation: "Retail sales are contracting" };

    case "durable_goods":
      if (value >= 5) return { signal: "positive", label: "Strong", explanation: "Business investment and capex orders accelerating" };
      if (value >= 0) return { signal: "neutral", label: "Stable", explanation: "Durable goods orders holding steady" };
      return { signal: "warning", label: "Weak", explanation: "Durable goods declining — business caution on investment" };

    case "building_permits":
      if (value >= 1500) return { signal: "positive", label: "Strong", explanation: "Housing supply strong, supports economic growth" };
      if (value >= 1200) return { signal: "neutral", label: "Moderate", explanation: "Building permits at normal levels" };
      if (value >= 900) return { signal: "warning", label: "Slowing", explanation: "Housing construction momentum fading" };
      return { signal: "negative", label: "Weak", explanation: "Low permits signal housing downturn" };

    case "shelter_oer":
      if (value <= 3) return { signal: "positive", label: "Cooling", explanation: "Shelter inflation cooling toward 2% target" };
      if (value <= 5) return { signal: "warning", label: "Elevated", explanation: "Shelter is the largest CPI component — still elevated" };
      return { signal: "negative", label: "High", explanation: "High shelter costs keeping overall CPI elevated" };

    case "supercore":
      if (value <= 2.5) return { signal: "positive", label: "Controlled", explanation: "Services ex-energy near 2% target" };
      if (value <= 4) return { signal: "warning", label: "Elevated", explanation: "Fed's preferred gauge above target — core inflation sticky" };
      return { signal: "negative", label: "High", explanation: "High supercore — persistent services inflation" };

    case "food_at_home":
      if (value <= 2) return { signal: "positive", label: "Normal", explanation: "Grocery prices growing at normal pace" };
      if (value <= 4) return { signal: "warning", label: "Elevated", explanation: "Food inflation above historical average" };
      return { signal: "negative", label: "High", explanation: "High food inflation pressuring household budgets" };

    case "energy_cpi":
      if (value < -5) return { signal: "positive", label: "Deflationary", explanation: "Falling energy prices pulling CPI lower" };
      if (value < 0) return { signal: "positive", label: "Declining", explanation: "Energy prices providing CPI relief" };
      if (value < 5) return { signal: "neutral", label: "Moderate", explanation: "Energy prices adding modestly to headline CPI" };
      return { signal: "warning", label: "Elevated", explanation: "High energy prices boosting headline CPI" };

    case "new_vehicles":
      if (value < 0) return { signal: "positive", label: "Deflationary", explanation: "Vehicle prices declining — post-pandemic normalization" };
      if (value <= 2) return { signal: "neutral", label: "Normal", explanation: "Vehicle prices growing at a normal rate" };
      return { signal: "warning", label: "Elevated", explanation: "Vehicle prices adding to inflation pressure" };

    case "ppi":
      if (value <= 2) return { signal: "positive", label: "Normal", explanation: "Producer prices near target — benign pipeline" };
      if (value <= 4) return { signal: "warning", label: "Elevated", explanation: "PPI above target — potential pass-through to CPI" };
      return { signal: "negative", label: "High", explanation: "High PPI signals inflation pipeline risk" };

    case "breakeven_5y5y":
      if (value <= 2.3) return { signal: "positive", label: "Anchored", explanation: "Long-term inflation expectations well-anchored" };
      if (value <= 2.7) return { signal: "neutral", label: "Moderate", explanation: "Inflation expectations slightly above target" };
      return { signal: "warning", label: "Unanchored", explanation: "Long-term expectations drifting — Fed credibility at risk" };

    case "mich_infl_1y":
      if (value <= 3) return { signal: "positive", label: "Anchored", explanation: "Consumer near-term inflation expectations near target" };
      if (value <= 4) return { signal: "warning", label: "Elevated", explanation: "Consumers expect above-target inflation in the next year" };
      return { signal: "negative", label: "High", explanation: "High consumer expectations can become self-fulfilling" };

    case "avg_hrly_earn":
      if (value <= 3.5) return { signal: "positive", label: "Balanced", explanation: "Wage growth consistent with 2% inflation target" };
      if (value <= 5) return { signal: "warning", label: "Elevated", explanation: "Wage growth above trend — potential inflationary pressure" };
      return { signal: "negative", label: "High", explanation: "Rapid wage growth risks wage-price spiral" };

    case "jolts":
      if (value >= 8000) return { signal: "positive", label: "Very Tight", explanation: "Very high job openings — labor demand extremely strong" };
      if (value >= 6000) return { signal: "positive", label: "Tight", explanation: "High openings signal robust labor demand" };
      if (value >= 5000) return { signal: "neutral", label: "Normal", explanation: "Job openings at historically normal levels" };
      return { signal: "warning", label: "Cooling", explanation: "Declining openings signal labor market loosening" };

    case "u6_unemp":
      if (value <= 7.5) return { signal: "positive", label: "Low", explanation: "Broad unemployment (incl. underemployed) historically low" };
      if (value <= 9) return { signal: "neutral", label: "Normal", explanation: "Broad unemployment in typical range" };
      if (value <= 11) return { signal: "warning", label: "Elevated", explanation: "Rising slack — underemployment increasing" };
      return { signal: "negative", label: "High", explanation: "Broad labor market slack significantly elevated" };

    case "quits_rate":
      if (value >= 2.5) return { signal: "positive", label: "Strong", explanation: "High quits reflect worker confidence — tight labor market" };
      if (value >= 2) return { signal: "neutral", label: "Normal", explanation: "Quits rate at normal levels" };
      return { signal: "warning", label: "Low", explanation: "Workers less willing to quit — labor market softening" };

    case "jobless_claims":
      if (value <= 250) return { signal: "positive", label: "Low", explanation: "Low initial claims reflect strong labor market" };
      if (value <= 350) return { signal: "neutral", label: "Normal", explanation: "Jobless claims at historical average range" };
      if (value <= 450) return { signal: "warning", label: "Rising", explanation: "Elevated claims suggest labor market softening" };
      return { signal: "negative", label: "High", explanation: "High initial claims signal recession-level layoffs" };

    case "cont_claims":
      if (value <= 1800) return { signal: "positive", label: "Low", explanation: "Low continuing claims signal quick re-employment" };
      if (value <= 2200) return { signal: "neutral", label: "Normal", explanation: "Continuing claims at normal levels" };
      return { signal: "warning", label: "Elevated", explanation: "Rising continuing claims suggest harder to find new jobs" };

    case "avg_wkly_hrs":
      if (value >= 34.5) return { signal: "positive", label: "Strong", explanation: "Long average hours reflect strong labor demand" };
      if (value >= 33.5) return { signal: "neutral", label: "Normal", explanation: "Average workweek at typical levels" };
      return { signal: "warning", label: "Short", explanation: "Shorter workweek often precedes layoffs — leading indicator" };

    case "mortgage30":
      if (value <= 5) return { signal: "positive", label: "Low", explanation: "Low mortgage rates support housing and consumer spending" };
      if (value <= 6.5) return { signal: "warning", label: "Elevated", explanation: "High mortgage rates weigh on housing affordability" };
      return { signal: "negative", label: "High", explanation: "Very high rates severely restrict housing market" };

    case "usd_index":
      if (value <= 95) return { signal: "positive", label: "Weak USD", explanation: "Weak dollar boosts US exports and supports EM assets" };
      if (value <= 105) return { signal: "neutral", label: "Neutral", explanation: "USD in typical historical range" };
      if (value <= 115) return { signal: "warning", label: "Strong", explanation: "Strong USD tightens global conditions, weighs on EM" };
      return { signal: "negative", label: "Very Strong", explanation: "Very strong USD — global liquidity tightening risk" };

    case "wti_crude": case "brent_crude":
      if (value <= 60) return { signal: "positive", label: "Low", explanation: "Low oil prices reduce inflation and energy costs" };
      if (value <= 80) return { signal: "neutral", label: "Moderate", explanation: "Oil prices in a manageable range" };
      if (value <= 100) return { signal: "warning", label: "Elevated", explanation: "High oil prices add to inflation pressure" };
      return { signal: "negative", label: "High", explanation: "Very high oil — significant inflation and growth risk" };

    case "m2_yoy":
      if (value >= 5) return { signal: "warning", label: "High Growth", explanation: "Rapid money supply growth — inflationary pressure long-term" };
      if (value >= 0) return { signal: "neutral", label: "Normal", explanation: "Money supply growing at moderate pace" };
      return { signal: "positive", label: "Contracting", explanation: "Money supply contraction — disinflationary signal" };

    case "ecb_rate":
      if (value >= 3) return { signal: "warning", label: "Restrictive", explanation: "ECB deposit rate in restrictive territory" };
      if (value >= 1) return { signal: "neutral", label: "Neutral", explanation: "ECB at roughly neutral rate" };
      return { signal: "positive", label: "Accommodative", explanation: "ECB in accommodative territory" };

    case "boe_rate":
      if (value >= 4) return { signal: "warning", label: "Restrictive", explanation: "BoE rate in restrictive territory" };
      if (value >= 1.5) return { signal: "neutral", label: "Neutral", explanation: "BoE at roughly neutral rate" };
      return { signal: "positive", label: "Accommodative", explanation: "BoE in accommodative territory" };

    case "ez_cpi_yoy": case "uk_cpi_yoy":
      if (value <= 2) return { signal: "positive", label: "At Target", explanation: "Inflation at 2% central bank target" };
      if (value <= 3) return { signal: "warning", label: "Near Target", explanation: "Inflation slightly above target" };
      return { signal: "negative", label: "Above Target", explanation: "Inflation well above target — rate pressure remains" };

    case "jp_cpi_yoy":
      if (value >= 2) return { signal: "neutral", label: "At Target", explanation: "Japan at 2% target after decades of deflation" };
      if (value > 0) return { signal: "positive", label: "Positive", explanation: "Japan exiting deflation — supports BoJ normalization" };
      return { signal: "negative", label: "Deflation", explanation: "Japan back in deflation — BoJ ultra-easy policy likely" };

    case "cn_cpi_yoy":
      if (value < 0) return { signal: "negative", label: "Deflation", explanation: "China deflation weighs on global commodity demand" };
      if (value < 1.5) return { signal: "warning", label: "Very Low", explanation: "Very low inflation signals weak domestic demand in China" };
      if (value <= 3) return { signal: "neutral", label: "Normal", explanation: "China CPI in normal range" };
      return { signal: "warning", label: "Elevated", explanation: "China inflation above normal — demand-driven" };

    case "ez_unemp":
      if (value <= 6) return { signal: "positive", label: "Low", explanation: "Eurozone unemployment at historically low levels" };
      if (value <= 8) return { signal: "neutral", label: "Normal", explanation: "Eurozone unemployment in typical range" };
      return { signal: "warning", label: "Elevated", explanation: "High unemployment limits ECB room to tighten" };

    case "eurusd":
      if (value >= 1.15) return { signal: "positive", label: "Strong EUR", explanation: "EUR strength reflects relative Eurozone resilience" };
      if (value >= 1.05) return { signal: "neutral", label: "Normal", explanation: "EUR/USD near historical average" };
      return { signal: "warning", label: "Weak EUR", explanation: "EUR weakness signals Fed/ECB rate divergence" };

    case "usdjpy":
      if (value <= 130) return { signal: "neutral", label: "Stable", explanation: "JPY near normal range — BoJ stance manageable" };
      if (value <= 150) return { signal: "warning", label: "Weak JPY", explanation: "JPY weakness reflects BoJ ultra-easy policy" };
      return { signal: "negative", label: "Very Weak JPY", explanation: "Extreme JPY weakness — BoJ intervention risk" };

    case "usdcny":
      if (value <= 7) return { signal: "neutral", label: "Stable", explanation: "CNY within PBoC's comfort zone" };
      if (value <= 7.3) return { signal: "warning", label: "Weak CNY", explanation: "CNY weakness signals PBoC allowing some depreciation" };
      return { signal: "negative", label: "Very Weak CNY", explanation: "Sharp CNY weakness — capital flow concerns" };

    default:
      return { signal: "neutral", label: "Normal", explanation: "" };
  }
}

// ─── Market Cycle logic ───────────────────────────────────────────────────────

function inferMarketCycle(indicators: Map<string, number | null>) {
  const gdp = indicators.get("gdp_growth");
  const unemployment = indicators.get("unemployment");
  const yieldCurve = indicators.get("yield_curve");
  const cpi = indicators.get("cpi_yoy");
  const recProb = indicators.get("recession_prob");
  const ism = indicators.get("ism_mfg");

  let score = 0;
  let confidence = 40;

  if (recProb != null && recProb > 40) {
    const phase = recProb > 60 ? "Recession" : "Early Contraction";
    return { phase, confidence: Math.min(95, 50 + recProb / 2) };
  }

  if (gdp != null) {
    if (gdp < 0) score -= 3;
    else if (gdp < 1) score -= 1;
    else if (gdp >= 3) score += 2;
    else score += 1;
    confidence += 15;
  }
  if (unemployment != null) {
    if (unemployment < 4) score += 1;
    else if (unemployment > 5.5) score -= 2;
    confidence += 10;
  }
  if (yieldCurve != null) {
    if (yieldCurve < -0.5) score -= 2;
    else if (yieldCurve < 0) score -= 1;
    else score += 1;
    confidence += 10;
  }
  if (cpi != null) {
    if (cpi > 5) score -= 1;
    else if (cpi < 2) score += 1;
  }
  if (ism != null) {
    if (ism > 55) score += 2;
    else if (ism > 50) score += 1;
    else score -= 1;
    confidence += 10;
  }

  let phase: string;
  if (score >= 5) phase = "Mid Expansion";
  else if (score >= 3) phase = "Early Expansion";
  else if (score >= 1) phase = "Recovery";
  else if (score >= -1) phase = "Late Expansion";
  else if (score >= -3) phase = "Early Contraction";
  else phase = "Recession";

  return { phase, confidence: Math.min(90, confidence) };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

async function fetchAllIndicators() {
  const YAHOO_IDS = new Set(["yield_curve", ...Object.keys(YAHOO_SYMBOLS)]);

  // Fetch Yahoo Finance indicators in parallel — fast, no rate limit concerns
  const yahooResultMap = new Map<string, { value: number | null; date: string | null }>();
  await Promise.allSettled(
    INDICATORS.filter((d) => YAHOO_IDS.has(d.id)).map(async (def) => {
      const result =
        def.id === "yield_curve"
          ? await yahooYieldCurve()
          : await yahooLatest(YAHOO_SYMBOLS[def.id]!);
      yahooResultMap.set(def.id, result);
    }),
  );

  // Fetch FRED-based indicators serially — 600ms gap (~1.5 req/sec) to stay under FRED rate limit
  const fredResultMap = new Map<string, { value: number | null; date: string | null }>();
  // Deduplicate: if two indicators share the same seriesId+units, reuse the first result
  const fredCache = new Map<string, { value: number | null; date: string | null }>();
  const fredDefs = INDICATORS.filter((d) => !YAHOO_IDS.has(d.id));
  for (let i = 0; i < fredDefs.length; i++) {
    const def = fredDefs[i];
    const key = `${def.seriesId}:${def.chartUnits}`;
    let result = fredCache.get(key);
    if (!result) {
      if (i > 0) await delay(600);
      result = await fredLatest(def);
      fredCache.set(key, result);
    }
    fredResultMap.set(def.id, result);
  }

  const valueMap = new Map<string, number | null>();
  const indicators = INDICATORS.map((def) => {
    const { value, date } =
      yahooResultMap.get(def.id) ?? fredResultMap.get(def.id) ?? { value: null, date: null };
    valueMap.set(def.id, value);
    const { signal, label: signalLabel, explanation } = getSignal(def.id, value);
    return {
      id: def.id,
      seriesId: def.seriesId,
      title: def.title,
      value,
      date,
      unitsLabel: def.unitsLabel,
      chartUnits: def.chartUnits,
      source: def.source,
      frequency: def.frequency,
      category: def.category,
      type: def.type ?? null,
      whyItMatters: def.whyItMatters ?? null,
      signal,
      signalLabel,
      explanation,
    };
  });

  const marketCycle = inferMarketCycle(valueMap);
  return { indicators, marketCycle, fetchedAt: new Date().toISOString() };
}

router.get("/macro/indicators", async (req, res): Promise<void> => {
  const CACHE_KEY = "macro:indicators";
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24-hour TTL (data is daily)

  const cached = fromCache<object>(CACHE_KEY);

  if (cached) {
    res.json(cached.data);
    // Revalidate in background if stale and not already refreshing
    if (cached.stale && !isCacheRefreshing(CACHE_KEY)) {
      setCacheRefreshing(CACHE_KEY, true);
      fetchAllIndicators()
        .then((payload) => toCache(CACHE_KEY, payload, CACHE_TTL))
        .catch(() => { /* suppress background errors */ })
        .finally(() => setCacheRefreshing(CACHE_KEY, false));
    }
    return;
  }

  try {
    const payload = await fetchAllIndicators();
    toCache(CACHE_KEY, payload, CACHE_TTL);
    res.json(payload);
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to fetch macro indicators");
    res.status(500).json({ error: "server_error", message: "Failed to fetch macro indicators" });
  }
});

router.get("/macro/series/:seriesId/observations", async (req, res): Promise<void> => {
  const params = GetMacroSeriesObservationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }

  const query = GetMacroSeriesObservationsQueryParams.safeParse(req.query);
  const units = (query.success ? query.data.units : undefined) ?? "lin";
  const limit = (query.success ? query.data.limit : undefined) ?? 120;
  const { seriesId } = params.data;

  const CACHE_KEY = `macro:obs:${seriesId}:${units}:${limit}`;
  const CACHE_TTL = 10 * 60 * 1000;

  const cached = fromCache<object>(CACHE_KEY);
  if (cached) { res.json(cached); return; }

  try {
    const data = await fredFetch(seriesId, units, limit);
    const obsAsc = [...(data.observations ?? [])].reverse();
    const observations = obsAsc.map((o) => {
      const v = parseFloat(o.value);
      return { date: o.date, value: isNaN(v) ? null : v };
    });

    const def = INDICATORS.find((d) => d.seriesId === seriesId);
    const title = def?.title ?? seriesId;
    const unitsLabel = def?.unitsLabel ?? units;

    const payload = { seriesId, title, unitsLabel, observations };
    toCache(CACHE_KEY, payload, CACHE_TTL);
    res.json(payload);
  } catch (err: unknown) {
    req.log.error({ err, seriesId }, "Failed to fetch FRED series observations");
    res.status(500).json({ error: "server_error", message: "Failed to fetch series data" });
  }
});

// ─── Startup Cache Warming ────────────────────────────────────────────────────

interface IndicatorEntry {
  id: string; seriesId: string; title: string; value: number | null;
  date: string | null; unitsLabel: string; chartUnits: string;
  source: string; frequency: string; category: string; type: string | null;
  whyItMatters: string | null; signal: string | null; signalLabel: string | null;
  explanation: string | null;
}
interface IndicatorsPayload { indicators: IndicatorEntry[]; marketCycle: unknown; fetchedAt: string }

// Fetch a specific subset of FRED defs serially (600ms between each)
async function fetchFredSubset(
  defs: IndicatorDef[],
): Promise<Map<string, { value: number | null; date: string | null }>> {
  const results = new Map<string, { value: number | null; date: string | null }>();
  const dedupeCache = new Map<string, { value: number | null; date: string | null }>();
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const cacheKey = `${def.seriesId}:${def.chartUnits}`;
    let result = dedupeCache.get(cacheKey);
    if (!result) {
      if (i > 0) await delay(600);
      result = await fredLatest(def);
      dedupeCache.set(cacheKey, result);
    }
    results.set(def.id, result);
  }
  return results;
}

// Called once from index.ts after server starts.
// Phase 1: initial full fetch → caches 19/57 indicators (Yahoo + first FRED batch).
// Phase 2-7: enrichment passes (60-second gaps) — try next 8 null FRED series per pass.
// Users always get the latest cached snapshot (instant after first cache write).
export async function warmMacroCache(): Promise<void> {
  const CACHE_KEY = "macro:indicators";
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24-hour TTL (data is daily)
  if (fromCache(CACHE_KEY)) return; // already warm

  // Phase 1: initial fetch (Yahoo parallel + ~9 FRED series in serial)
  try {
    const payload = await fetchAllIndicators();
    toCache(CACHE_KEY, payload, CACHE_TTL);
  } catch {
    return; // non-fatal — route handler will retry on first user request
  }

  // Phase 2+: enrichment passes — 60-second pauses let FRED's rate limit window reset
  const YAHOO_IDS = new Set(["yield_curve", ...Object.keys(YAHOO_SYMBOLS)]);
  const MAX_PASSES = 6;
  const BATCH_SIZE = 8;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const cached = fromCache<IndicatorsPayload>(CACHE_KEY);
    if (!cached) break;

    // Find FRED indicators that are still null in the cached payload
    const nullIds = new Set(
      cached.data.indicators
        .filter((i) => i.value === null && !YAHOO_IDS.has(i.id))
        .map((i) => i.id),
    );
    if (nullIds.size === 0) break; // all filled — stop enrichment

    const batchDefs = INDICATORS
      .filter((d) => nullIds.has(d.id) && !YAHOO_IDS.has(d.id))
      .slice(0, BATCH_SIZE);
    if (batchDefs.length === 0) break;

    await delay(60_000); // wait 60s for FRED rate limit window to reset

    const newValues = await fetchFredSubset(batchDefs);

    // Merge into existing payload; don't overwrite Yahoo values or already-filled FRED values
    const existing = fromCache<IndicatorsPayload>(CACHE_KEY);
    if (!existing) break;

    const valueMap = new Map<string, number | null>();
    const updatedIndicators: IndicatorEntry[] = existing.data.indicators.map((ind) => {
      valueMap.set(ind.id, ind.value); // seed with current value first
      const fresh = newValues.get(ind.id);
      if (fresh && fresh.value !== null) {
        const { signal, label: signalLabel, explanation } = getSignal(ind.id, fresh.value);
        valueMap.set(ind.id, fresh.value);
        return { ...ind, value: fresh.value, date: fresh.date, signal, signalLabel, explanation };
      }
      return ind;
    });

    const marketCycle = inferMarketCycle(valueMap);
    toCache(CACHE_KEY, { indicators: updatedIndicators, marketCycle, fetchedAt: existing.data.fetchedAt }, CACHE_TTL);
  }
}

export default router;
