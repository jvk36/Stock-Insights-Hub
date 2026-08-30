import YahooFinance from "yahoo-finance2";
import { inflateRawSync } from "node:zlib";

type Quality = "reported" | "estimated" | "unavailable";

export interface BuybackHistoryPoint {
  date: string;
  sharesOutstanding: number | null;
  repurchasedShares: number | null;
  issuedShares: number | null;
  pricePerShare: number | null;
  repurchaseQuality: Quality;
  issuanceQuality: Quality;
}

export interface BuybackHistoryResult {
  symbol: string;
  currency: string | null;
  history: BuybackHistoryPoint[];
  coverage: {
    startDate: string | null;
    endDate: string | null;
    quarterCount: number;
    estimatedQuarterCount: number;
    note: string;
  };
}

interface SecFact {
  start?: string;
  end: string;
  val: number;
  filed: string;
  form: string;
  fy?: number | string;
  fp?: string;
  accn?: string;
  frame?: string;
}

interface SecCompanyFacts {
  facts?: Record<
    string,
    Record<string, { units?: Record<string, SecFact[]> }>
  >;
}

interface SecSubmissions {
  filings?: {
    recent?: {
      form?: string[];
      accessionNumber?: string[];
      reportDate?: string[];
      primaryDocument?: string[];
    };
  };
}

interface PeriodValue {
  key: string;
  date: string;
  value: number;
}

const SEC_HEADERS = {
  "User-Agent": "Stock Research Platform research@example.com",
  Accept: "application/json",
};
const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const historyCache = new Map<
  string,
  { expiresAt: number; value: BuybackHistoryResult }
>();

function fiscalKey(fact: SecFact): string | null {
  if (fact.fy == null || !fact.fp) return null;
  const fp = fact.fp.toUpperCase();
  if (!["Q1", "Q2", "Q3", "FY"].includes(fp)) return null;
  return `${fact.fy}-${fp}`;
}

function isPrimaryFilingFact(fact: SecFact): boolean {
  if (!/^(10-Q|10-K)(\/A)?$/.test(fact.form)) return false;
  if (!Number.isFinite(fact.val) || fact.val < 0) return false;
  const end = Date.parse(fact.end);
  const filed = Date.parse(fact.filed);
  if (!Number.isFinite(end) || !Number.isFinite(filed)) return false;
  // Comparative values copied into later filings often carry that later
  // filing's FY/FP. Keeping facts filed near their period end avoids assigning
  // those comparisons to the wrong quarter.
  const filingLagDays = (filed - end) / (24 * 60 * 60 * 1000);
  const maxLagDays = fact.form.endsWith("/A") ? 365 : 160;
  return filingLagDays >= 0 && filingLagDays <= maxLagDays;
}

function factsForConcept(
  data: SecCompanyFacts,
  namespace: string,
  concept: string,
  unit: string,
): SecFact[] {
  return data.facts?.[namespace]?.[concept]?.units?.[unit] ?? [];
}

function durationDays(fact: SecFact): number | null {
  if (!fact.start) return null;
  const duration =
    (Date.parse(fact.end) - Date.parse(fact.start)) /
    (24 * 60 * 60 * 1000);
  return Number.isFinite(duration) ? duration : null;
}

function expectedDurationDays(fp: string | undefined): number {
  if (fp === "Q1") return 91;
  if (fp === "Q2") return 182;
  if (fp === "Q3") return 273;
  return 365;
}

function selectByFiscalPeriod(
  facts: SecFact[],
  durationFact = false,
): Map<string, SecFact> {
  const grouped = new Map<string, SecFact[]>();
  for (const fact of facts.filter(isPrimaryFilingFact)) {
    const key = fiscalKey(fact);
    if (!key) continue;
    const group = grouped.get(key) ?? [];
    group.push(fact);
    grouped.set(key, group);
  }

  const selected = new Map<string, SecFact>();
  for (const [key, candidates] of grouped) {
    candidates.sort((a, b) => {
      if (durationFact) {
        // SEC filings can include both standalone-quarter and YTD contexts for
        // the same FY/FP. Cash-flow concepts need the YTD context so Q2/Q3/Q4
        // can be derived by subtraction.
        const expected = expectedDurationDays(a.fp?.toUpperCase());
        const aDistance = Math.abs((durationDays(a) ?? expected) - expected);
        const bDistance = Math.abs((durationDays(b) ?? expected) - expected);
        if (aDistance !== bDistance) return aDistance - bDistance;
      }
      const aAmended = a.form.endsWith("/A") ? 1 : 0;
      const bAmended = b.form.endsWith("/A") ? 1 : 0;
      if (aAmended !== bAmended) return bAmended - aAmended;
      if (a.filed !== b.filed) return b.filed.localeCompare(a.filed);
      if (a.end !== b.end) return b.end.localeCompare(a.end);
      return (b.accn ?? "").localeCompare(a.accn ?? "");
    });
    selected.set(key, candidates[0]);
  }
  return selected;
}

function quarterizeDurationFacts(facts: SecFact[]): Map<string, PeriodValue> {
  const selected = selectByFiscalPeriod(facts, true);
  const result = new Map<string, PeriodValue>();

  for (const [key, fact] of selected) {
    if (!fact.start) continue;
    const fp = fact.fp?.toUpperCase();
    let value: number | null = null;
    if (fp === "Q1") {
      value = fact.val;
    } else {
      const previousFp = fp === "Q2" ? "Q1" : fp === "Q3" ? "Q2" : "Q3";
      const previous = selected.get(`${fact.fy}-${previousFp}`);
      if (previous?.start === fact.start && previous.end < fact.end) {
        value = fact.val - previous.val;
      } else {
        const durationDays =
          (Date.parse(fact.end) - Date.parse(fact.start)) /
          (24 * 60 * 60 * 1000);
        if (durationDays <= 135) value = fact.val;
      }
    }
    if (value != null && Number.isFinite(value) && value >= 0) {
      result.set(key, { key, date: fact.end, value });
    }
  }

  return result;
}

function instantFacts(facts: SecFact[]): Map<string, PeriodValue> {
  const selected = selectByFiscalPeriod(facts);
  return new Map(
    Array.from(selected.entries()).map(([key, fact]) => [
      key,
      { key, date: fact.end, value: fact.val },
    ]),
  );
}

function firstAvailableDurationConcept(
  data: SecCompanyFacts,
  concepts: Array<{ namespace: string; concept: string; unit: string }>,
): Map<string, PeriodValue> {
  for (const candidate of concepts) {
    const values = quarterizeDurationFacts(
      factsForConcept(
        data,
        candidate.namespace,
        candidate.concept,
        candidate.unit,
      ),
    );
    if (values.size > 0) return values;
  }
  return new Map();
}

function splitAdjustmentForDate(
  date: string,
  splits: Array<{ date: Date; numerator?: number; denominator?: number }>,
): number {
  const pointDate = Date.parse(date);
  return splits.reduce((factor, split) => {
    if (split.date.getTime() <= pointDate) return factor;
    const numerator = split.numerator ?? 1;
    const denominator = split.denominator ?? 1;
    return denominator !== 0 ? factor * (numerator / denominator) : factor;
  }, 1);
}

function isAdjacentFiscalQuarter(previousKey: string, currentKey: string): boolean {
  const [previousFyText, previousFp] = previousKey.split("-");
  const [currentFyText, currentFp] = currentKey.split("-");
  const previousFy = Number(previousFyText);
  const currentFy = Number(currentFyText);

  if (previousFy === currentFy) {
    return (
      (previousFp === "Q1" && currentFp === "Q2") ||
      (previousFp === "Q2" && currentFp === "Q3") ||
      (previousFp === "Q3" && currentFp === "FY")
    );
  }
  return (
    previousFp === "FY" &&
    currentFp === "Q1" &&
    currentFy === previousFy + 1
  );
}

function zipDocumentContainingFact(
  archive: Buffer,
  factName: string,
): string | null {
  const minimumEocdOffset = Math.max(0, archive.length - 65_557);
  let eocdOffset = -1;
  for (let offset = archive.length - 22; offset >= minimumEocdOffset; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  let offset = archive.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < entryCount; index++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) return null;
    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const fileName = archive
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    if (
      /\.(?:xml|html?)$/i.test(fileName) &&
      !/_(?:cal|def|lab|pre)\.xml$/i.test(fileName) &&
      archive.readUInt32LE(localHeaderOffset) === 0x04034b50
    ) {
      const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataOffset =
        localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = archive.subarray(
        dataOffset,
        dataOffset + compressedSize,
      );
      const contents =
        compressionMethod === 0
          ? compressed
          : compressionMethod === 8
            ? inflateRawSync(compressed)
            : null;
      if (contents) {
        const xml = contents.toString("utf8");
        if (xml.includes(factName)) return xml;
      }
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return null;
}

function xmlAttribute(attributes: string, name: string): string | null {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"),
  );
  return match?.[1] ?? null;
}

function parseBerkshireEquivalentShares(
  xml: string,
  symbol: string,
): number | null {
  const shareClassByContext = new Map<string, "A" | "B">();
  const contextRegex =
    /<(?:[\w.-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?context>/gi;
  let contextMatch: RegExpExecArray | null;
  while ((contextMatch = contextRegex.exec(xml)) !== null) {
    const id = xmlAttribute(contextMatch[1], "id");
    if (!id) continue;
    if (/CommonClassAMember/i.test(contextMatch[2])) {
      shareClassByContext.set(id, "A");
    } else if (/CommonClassBMember/i.test(contextMatch[2])) {
      shareClassByContext.set(id, "B");
    }
  }

  const sharesByClass = new Map<"A" | "B", number>();
  const recordFact = (attributes: string, rawValue: string) => {
    const contextRef = xmlAttribute(attributes, "contextRef");
    const shareClass = contextRef
      ? shareClassByContext.get(contextRef)
      : undefined;
    const numericText = rawValue
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;|&#160;/gi, "")
      .replace(/,/g, "")
      .trim();
    const parsed = Number(numericText);
    const scale = Number(xmlAttribute(attributes, "scale") ?? "0");
    const sign = xmlAttribute(attributes, "sign") === "-" ? -1 : 1;
    const value =
      Number.isFinite(parsed) && Number.isFinite(scale)
        ? parsed * 10 ** scale * sign
        : Number.NaN;
    if (shareClass && Number.isFinite(value) && value >= 0) {
      sharesByClass.set(shareClass, value);
    }
  };

  const factRegex =
    /<dei:EntityCommonStockSharesOutstanding\b([^>]*)>([^<]+)<\/dei:EntityCommonStockSharesOutstanding>/gi;
  let factMatch: RegExpExecArray | null;
  while ((factMatch = factRegex.exec(xml)) !== null) {
    recordFact(factMatch[1], factMatch[2]);
  }
  const inlineFactRegex =
    /<ix:nonfraction\b([^>]*\bname=["']dei:EntityCommonStockSharesOutstanding["'][^>]*)>([\s\S]*?)<\/ix:nonfraction>/gi;
  while ((factMatch = inlineFactRegex.exec(xml)) !== null) {
    recordFact(factMatch[1], factMatch[2]);
  }

  const classA = sharesByClass.get("A");
  const classB = sharesByClass.get("B");
  if (classA == null || classB == null) return null;
  return symbol.replace(".", "-") === "BRK-A"
    ? classA + classB / 1_500
    : classA * 1_500 + classB;
}

async function fetchBerkshireOutstandingByPeriod(
  symbol: string,
  cik: string,
  periodDates: Map<string, string>,
): Promise<Map<string, PeriodValue>> {
  if (
    cik.replace(/^0+/, "") !== "1067983" ||
    !["BRK-A", "BRK-B"].includes(symbol.replace(".", "-"))
  ) {
    return new Map();
  }

  const response = await fetch(
    `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`,
    { headers: SEC_HEADERS, signal: AbortSignal.timeout(12_000) },
  );
  if (!response.ok) return new Map();

  const submissions = (await response.json()) as SecSubmissions;
  const recent = submissions.filings?.recent ?? {};
  const forms = recent.form ?? [];
  const accessions = recent.accessionNumber ?? [];
  const reportDates = recent.reportDate ?? [];
  const primaryDocuments = recent.primaryDocument ?? [];
  const periodKeyByDate = new Map(
    Array.from(periodDates.entries()).map(([key, date]) => [date, key]),
  );
  const candidates: Array<{
    key: string;
    reportDate: string;
    accession: string;
    primaryDocument: string;
  }> = [];
  const selectedDates = new Set<string>();

  for (let index = 0; index < forms.length; index++) {
    if (!/^(10-Q|10-K)(\/A)?$/.test(forms[index] ?? "")) continue;
    const reportDate = reportDates[index];
    const key = periodKeyByDate.get(reportDate);
    if (
      !key ||
      selectedDates.has(reportDate) ||
      !accessions[index] ||
      !primaryDocuments[index]
    ) {
      continue;
    }
    selectedDates.add(reportDate);
    candidates.push({
      key,
      reportDate,
      accession: accessions[index],
      primaryDocument: primaryDocuments[index],
    });
  }

  const result = new Map<string, PeriodValue>();
  const concurrency = 3;
  for (let index = 0; index < candidates.length; index += concurrency) {
    const batch = candidates.slice(index, index + concurrency);
    const values = await Promise.all(
      batch.map(async (candidate) => {
        const accessionPath = candidate.accession.replace(/-/g, "");
        const archiveName = `${candidate.accession}-xbrl.zip`;
        const archiveUrl =
          `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, "")}/` +
          `${accessionPath}/${archiveName}`;
        try {
          const archiveResponse = await fetch(archiveUrl, {
            headers: SEC_HEADERS,
            signal: AbortSignal.timeout(12_000),
          });
          if (!archiveResponse.ok) return null;
          const archive = Buffer.from(await archiveResponse.arrayBuffer());
          const xml = zipDocumentContainingFact(
            archive,
            "EntityCommonStockSharesOutstanding",
          );
          const value = xml
            ? parseBerkshireEquivalentShares(xml, symbol)
            : null;
          return value == null ? null : { candidate, value };
        } catch {
          return null;
        }
      }),
    );
    for (const value of values) {
      if (!value) continue;
      result.set(value.candidate.key, {
        key: value.candidate.key,
        date: value.candidate.reportDate,
        value: value.value,
      });
    }
  }
  return result;
}

export async function getBuybackHistory(
  symbol: string,
  cik: string | null,
): Promise<BuybackHistoryResult> {
  const cached = historyCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const period1 = new Date(Date.now() - TEN_YEARS_MS);
  const chartPromise = yahooFinance.chart(symbol, {
    period1,
    interval: "1d",
    events: "splits",
  });

  if (!cik) {
    const chart = await chartPromise;
    return {
      symbol,
      currency: chart.meta.currency ?? null,
      history: [],
      coverage: {
        startDate: null,
        endDate: null,
        quarterCount: 0,
        estimatedQuarterCount: 0,
        note: "Quarterly SEC share data is not available for this symbol.",
      },
    };
  }

  const factsPromise = fetch(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, "0")}.json`,
    { headers: SEC_HEADERS, signal: AbortSignal.timeout(12_000) },
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(`SEC Company Facts returned ${response.status}`);
    }
    return (await response.json()) as SecCompanyFacts;
  });

  const [facts, chart] = await Promise.all([factsPromise, chartPromise]);
  const cutoff = new Date(Date.now() - TEN_YEARS_MS).toISOString().slice(0, 10);
  const splits = (chart.events?.splits ?? []).map((split) => ({
    date: split.date,
    numerator: split.numerator,
    denominator: split.denominator,
  }));

  let outstanding = (() => {
    const dei = instantFacts(
      factsForConcept(
        facts,
        "dei",
        "EntityCommonStockSharesOutstanding",
        "shares",
      ),
    );
    if (dei.size > 0) return dei;
    return instantFacts(
      factsForConcept(
        facts,
        "us-gaap",
        "CommonStockSharesOutstanding",
        "shares",
      ),
    );
  })();

  const reportedRepurchases = firstAvailableDurationConcept(facts, [
    {
      namespace: "us-gaap",
      concept: "StockRepurchasedAndRetiredDuringPeriodShares",
      unit: "shares",
    },
    {
      namespace: "us-gaap",
      concept: "StockRepurchaseProgramShares",
      unit: "shares",
    },
  ]);
  const repurchaseCash = firstAvailableDurationConcept(facts, [
    {
      namespace: "us-gaap",
      concept: "PaymentsForRepurchaseOfCommonStock",
      unit: "USD",
    },
    {
      namespace: "us-gaap",
      concept: "PaymentsForRepurchaseOfEquity",
      unit: "USD",
    },
  ]);
  const reportedIssuance = firstAvailableDurationConcept(facts, [
    {
      namespace: "us-gaap",
      concept: "StockIssuedDuringPeriodShares",
      unit: "shares",
    },
    {
      namespace: "us-gaap",
      concept: "CommonStockSharesIssued",
      unit: "shares",
    },
  ]);
  const periodDates = new Map<string, string>();
  for (const source of [
    reportedRepurchases,
    repurchaseCash,
    reportedIssuance,
  ]) {
    for (const [key, value] of source) {
      if (!periodDates.has(key)) periodDates.set(key, value.date);
    }
  }
  const hasOutstandingForDisplayedPeriods = Array.from(
    periodDates.keys(),
  ).some((key) => outstanding.has(key));
  if (!hasOutstandingForDisplayedPeriods) {
    const dimensionalOutstanding = await fetchBerkshireOutstandingByPeriod(
      symbol,
      cik,
      periodDates,
    );
    if (dimensionalOutstanding.size > 0) {
      outstanding = dimensionalOutstanding;
    }
  }

  const sortedPrices = (chart.quotes ?? [])
    .map((quote) => ({
      date:
        quote.date instanceof Date
          ? quote.date.toISOString().slice(0, 10)
          : String(quote.date),
      // Raw close reflects the market price paid at the time. Dividend-adjusted
      // close is unsuitable for cash/share conversion because dividends do not
      // change how many shares the issuer repurchased.
      price: quote.close ?? null,
    }))
    .filter(
      (quote): quote is { date: string; price: number } =>
        quote.price != null && Number.isFinite(quote.price),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const periodKeys = new Set([
    ...outstanding.keys(),
    ...reportedRepurchases.keys(),
    ...repurchaseCash.keys(),
    ...reportedIssuance.keys(),
  ]);
  const prelim = Array.from(periodKeys)
    .map((key) => {
      const rawOutstanding = outstanding.get(key);
      const reportedBuyback = reportedRepurchases.get(key);
      const cashBuyback = repurchaseCash.get(key);
      const rawIssuance = reportedIssuance.get(key);
      const date =
        reportedBuyback?.date ??
        cashBuyback?.date ??
        rawIssuance?.date ??
        rawOutstanding?.date;
      if (!date || date < cutoff) return null;

      const adjustment = splitAdjustmentForDate(date, splits);
      const periodEndTime = Date.parse(date);
      const rawPrice =
        sortedPrices.reduce<(typeof sortedPrices)[number] | null>(
          (nearest, quote) => {
            if (!nearest) return quote;
            return Math.abs(Date.parse(quote.date) - periodEndTime) <
              Math.abs(Date.parse(nearest.date) - periodEndTime)
              ? quote
              : nearest;
          },
          null,
        )?.price ?? null;
      // Yahoo chart close is already normalized for historical splits, but not
      // dividends. Dividing cash by it yields a split-comparable share count
      // without the dividend inflation introduced by adjusted close.
      const price = rawPrice;
      let repurchasedShares: number | null = null;
      let repurchaseQuality: Quality = "unavailable";
      if (reportedBuyback) {
        repurchasedShares = reportedBuyback.value * adjustment;
        repurchaseQuality = "reported";
      } else if (cashBuyback && price && price > 0) {
        repurchasedShares = cashBuyback.value / price;
        repurchaseQuality = "estimated";
      }

      return {
        key,
        date,
        sharesOutstanding: rawOutstanding
          ? rawOutstanding.value * adjustment
          : null,
        repurchasedShares,
        issuedShares: rawIssuance ? rawIssuance.value * adjustment : null,
        pricePerShare: price,
        repurchaseQuality,
        issuanceQuality: rawIssuance
          ? ("reported" as const)
          : ("unavailable" as const),
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-40);

  const history: BuybackHistoryPoint[] = prelim.map((point, index) => {
    if (point.issuedShares != null) return point;
    const previous = prelim[index - 1];
    if (
      !previous ||
      !isAdjacentFiscalQuarter(previous.key, point.key) ||
      previous?.sharesOutstanding == null ||
      point.sharesOutstanding == null ||
      point.repurchasedShares == null
    ) {
      return point;
    }
    // Outstanding change = issuance - retirements. This captures dilution from
    // compensation and acquisition consideration when a standalone issuance
    // share fact is not available.
    const estimated =
      point.sharesOutstanding -
      previous.sharesOutstanding +
      point.repurchasedShares;
    return {
      ...point,
      issuedShares: Math.max(0, estimated),
      issuanceQuality: "estimated" as const,
    };
  });

  const result: BuybackHistoryResult = {
    symbol,
    currency: chart.meta.currency ?? null,
    history,
    coverage: {
      startDate: history[0]?.date ?? null,
      endDate: history.at(-1)?.date ?? null,
      quarterCount: history.length,
      estimatedQuarterCount: history.filter(
        (point) =>
          point.repurchaseQuality === "estimated" ||
          point.issuanceQuality === "estimated",
      ).length,
      note:
        "Share quantities are split-adjusted. Reported SEC quantities are used when available; estimates use reported cash paid and share-count movement.",
    },
  };

  historyCache.set(symbol, {
    value: result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return result;
}