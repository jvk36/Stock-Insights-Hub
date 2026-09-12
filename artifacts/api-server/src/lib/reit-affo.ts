import * as cheerio from "cheerio";

export type ReitClassification = {
  kind: "equity_reit" | "mortgage_reit" | "non_reit" | "unknown";
  isLikelyReit: boolean;
  supported: boolean;
  confidence: "high" | "medium" | "low";
  source: "Yahoo Finance sector and industry metadata";
  sector: string | null;
  industry: string | null;
  reason: string;
};

export type AffoData = {
  status: "reported" | "unavailable";
  total: number | null;
  perShare: number | null;
  period: string | null;
  filedAt: string | null;
  source: string | null;
  concept: string | null;
  note: string;
};

type SecFact = {
  start?: string;
  end?: string;
  val?: number;
  filed?: string;
  form?: string;
  fp?: string;
  accn?: string;
};

type SecCompanyFacts = {
  facts?: Record<
    string,
    Record<string, { label?: string; units?: Record<string, SecFact[]> }>
  >;
};

type SecSubmissions = {
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      reportDate?: string[];
      accessionNumber?: string[];
    };
  };
};

type AffoMeasure = "AFFO" | "Core FFO" | "Cash FFO" | "FAD";

const MEASURE_PREFIXES: Array<{
  measure: AffoMeasure;
  prefixes: string[];
}> = [
  {
    measure: "AFFO",
    prefixes: ["adjustedfundsfromoperations", "adjustedffo", "affo"],
  },
  {
    measure: "Core FFO",
    prefixes: ["corefundsfromoperations", "coreffo"],
  },
  {
    measure: "Cash FFO",
    prefixes: ["cashfundsfromoperations", "cashffo"],
  },
  {
    measure: "FAD",
    prefixes: ["fundsavailablefordistribution", "fundsavailablefordistributions", "fad"],
  },
];

function normalizedConcept(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function classifyAffoMeasure(
  concept: string,
  label?: string,
): { measure: AffoMeasure; kind: "total" | "perShare" } | null {
  for (const value of [concept, label ?? ""]) {
    const normalized = normalizedConcept(value);
    const match = MEASURE_PREFIXES.find(({ prefixes }) =>
      prefixes.some((prefix) => normalized.startsWith(prefix)),
    );
    if (!match) continue;
    return {
      measure: match.measure,
      kind: /pershare|percommonshare|perdilutedshare/.test(normalized)
        ? "perShare"
        : "total",
    };
  }
  return null;
}

const EXHIBIT_MEASURE_PATTERN =
  "(Adjusted Funds From Operations|AFFO|Core Funds From Operations|Core FFO|Cash Funds From Operations|Cash FFO|Funds Available for Distribution|FAD)";

export function extractAnnualAffoFromExhibitText(
  filingText: string,
  period: string,
  filedAt: string,
  accessionNumber: string,
): AffoData {
  const documents = [...filingText.matchAll(/<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi)]
    .filter((match) => /<TYPE>\s*EX-99/i.test(match[1]))
    .map((match) => match[1]);
  const searchableDocuments = documents.length > 0 ? documents : [filingText];

  const candidates: Array<{
    value: number;
    label: string;
    measure: AffoMeasure;
  }> = [];

  for (const document of searchableDocuments) {
    const text = cheerio
      .load(document)
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const rowPattern = new RegExp(
      `${EXHIBIT_MEASURE_PATTERN}\\s+per\\s+(?:(?:common|diluted)\\s+)?share(?:\\s*\\((?:diluted|basic)\\))?\\s+\\$?\\s*(\\d+(?:\\.\\d+)?)`,
      "gi",
    );
    for (const match of text.matchAll(rowPattern)) {
      const index = match.index ?? 0;
      const context = text.slice(Math.max(0, index - 5_000), index);
      const lastAnnualHeading = context.toLowerCase().lastIndexOf("years ended");
      const lastQuarterHeading = context.toLowerCase().lastIndexOf("three months ended");
      const lastGuidanceHeading = context.toLowerCase().lastIndexOf("earnings guidance");
      if (lastAnnualHeading < 0 || lastQuarterHeading > lastAnnualHeading) continue;
      if (lastGuidanceHeading > lastAnnualHeading) continue;
      if (!context.slice(lastAnnualHeading).includes(period.slice(0, 4))) continue;

      const classification = classifyAffoMeasure(match[1]);
      const value = Number(match[2]);
      if (!classification || !Number.isFinite(value) || value <= 0 || value > 1_000) {
        continue;
      }
      candidates.push({
        value,
        label: match[1],
        measure: classification.measure,
      });
    }
  }

  const selectedMeasure = MEASURE_PREFIXES.find(({ measure }) =>
    candidates.some((candidate) => candidate.measure === measure),
  )?.measure;
  const selected = candidates.find(
    (candidate) => candidate.measure === selectedMeasure,
  );
  if (!selected) return extractReportedAffo({});

  return {
    status: "reported",
    total: null,
    perShare: selected.value,
    period,
    filedAt,
    source: `SEC 8-K annual earnings exhibit (${accessionNumber})`,
    concept: selected.label,
    note: `Company-reported ${selectedMeasure} per share from an annual earnings exhibit${selectedMeasure === "AFFO" ? "." : ", treated as an AFFO-equivalent measure using the company's reported definition."}`,
  };
}

export function classifyReit(
  sector: string | null | undefined,
  industry: string | null | undefined,
): ReitClassification {
  const sectorText = sector?.trim() || null;
  const industryText = industry?.trim() || null;
  const combined = `${sectorText ?? ""} ${industryText ?? ""}`.toLowerCase();
  const source = "Yahoo Finance sector and industry metadata" as const;

  if (!sectorText && !industryText) {
    return {
      kind: "unknown",
      isLikelyReit: false,
      supported: false,
      confidence: "low",
      source,
      sector: null,
      industry: null,
      reason: "Sector and industry metadata are unavailable; no automatic REIT classification was made.",
    };
  }

  const explicitReit = /\breit\b|real estate investment trust/.test(combined);
  if (explicitReit && /mortgage/.test(combined)) {
    return {
      kind: "mortgage_reit",
      isLikelyReit: true,
      supported: false,
      confidence: "high",
      source,
      sector: sectorText,
      industry: industryText,
      reason: "Industry metadata identifies a mortgage REIT, which is not supported by this AFFO DCF.",
    };
  }

  if (explicitReit) {
    return {
      kind: "equity_reit",
      isLikelyReit: true,
      supported: true,
      confidence: "high",
      source,
      sector: sectorText,
      industry: industryText,
      reason: "Industry metadata identifies an equity REIT.",
    };
  }

  if (sectorText?.toLowerCase() === "real estate") {
    return {
      kind: "unknown",
      isLikelyReit: false,
      supported: false,
      confidence: "low",
      source,
      sector: sectorText,
      industry: industryText,
      reason: "Real Estate sector metadata alone does not establish that the company is a REIT; the FCF basis is preserved unless manually overridden.",
    };
  }

  return {
    kind: "non_reit",
    isLikelyReit: false,
    supported: true,
    confidence: "high",
    source,
    sector: sectorText,
    industry: industryText,
    reason: "Sector and industry metadata do not indicate a REIT.",
  };
}

export function defaultValuationBasis(
  classification: ReitClassification,
): "fcf" | "affo" {
  return classification.isLikelyReit ? "affo" : "fcf";
}

function validAnnualFacts(facts: SecFact[] | undefined): SecFact[] {
  return (facts ?? []).filter((fact) => {
    if (!/^(10-K|8-K)(\/A)?$/.test(fact.form ?? "")) return false;
    if (!fact.start || !fact.end || !fact.filed) return false;
    if (/^10-K/.test(fact.form ?? "") && fact.fp !== "FY") return false;
    if (!Number.isFinite(fact.val) || (fact.val ?? 0) <= 0) return false;
    const duration =
      (Date.parse(fact.end) - Date.parse(fact.start)) / (24 * 60 * 60 * 1000);
    return Number.isFinite(duration) && duration >= 300 && duration <= 430;
  });
}

export function extractReportedAffo(data: SecCompanyFacts): AffoData {
  const candidates: Array<{
    fact: SecFact;
    namespace: string;
    concept: string;
    kind: "total" | "perShare";
    measure: AffoMeasure;
  }> = [];

  for (const [namespace, concepts] of Object.entries(data.facts ?? {})) {
    if (namespace === "us-gaap" || namespace === "dei") continue;
    for (const [concept, definition] of Object.entries(concepts)) {
      const classification = classifyAffoMeasure(concept, definition.label);
      if (!classification) continue;
      const { kind, measure } = classification;
      const preferredUnits =
        kind === "total"
          ? ["USD"]
          : ["USD/shares", "USD / shares", "USD/share"];
      for (const unit of preferredUnits) {
        for (const fact of validAnnualFacts(definition.units?.[unit])) {
          candidates.push({ fact, namespace, concept, kind, measure });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return {
      status: "unavailable",
      total: null,
      perShare: null,
      period: null,
      filedAt: null,
      source: null,
      concept: null,
      note: "No reliable company-reported AFFO, Core FFO, Cash FFO, or Funds Available for Distribution fact was found in structured SEC annual filing data. Plain FFO and free cash flow were not substituted.",
    };
  }

  candidates.sort((a, b) =>
    (b.fact.end ?? "").localeCompare(a.fact.end ?? "") ||
    (b.fact.filed ?? "").localeCompare(a.fact.filed ?? ""),
  );
  const latestPeriod = candidates[0].fact.end!;
  const latestCandidates = candidates.filter(
    (candidate) => candidate.fact.end === latestPeriod,
  );
  const selectedMeasure = MEASURE_PREFIXES.find(({ measure }) =>
    latestCandidates.some((candidate) => candidate.measure === measure),
  )!.measure;
  const latest = latestCandidates.filter(
    (candidate) => candidate.measure === selectedMeasure,
  );
  const totals = latest.filter((candidate) => candidate.kind === "total");
  const perShares = latest.filter((candidate) => candidate.kind === "perShare");

  const uniqueValues = (items: typeof candidates) =>
    new Set(items.map((item) => item.fact.val)).size;
  if (uniqueValues(totals) > 1 || uniqueValues(perShares) > 1) {
    return {
      status: "unavailable",
      total: null,
      perShare: null,
      period: latestPeriod,
      filedAt: null,
      source: null,
      concept: null,
      note: `Multiple conflicting ${selectedMeasure} facts were reported for the latest annual period, so no value was selected.`,
    };
  }

  const selected = perShares[0] ?? totals[0];
  return {
    status: "reported",
    total: totals[0]?.fact.val ?? null,
    perShare: perShares[0]?.fact.val ?? null,
    period: latestPeriod,
    filedAt: selected.fact.filed ?? null,
    source: `SEC ${selected.fact.form} structured filing (${selected.namespace})`,
    concept: selected.concept,
    note: selected.kind === "perShare"
      ? `Company-reported ${selectedMeasure} per share${selectedMeasure === "AFFO" ? "." : ", treated as an AFFO-equivalent measure using the company's reported definition."}`
      : `Company-reported total ${selectedMeasure}${selectedMeasure === "AFFO" ? "" : ", treated as an AFFO-equivalent measure using the company's reported definition"}; per-share value may be calculated from reported shares outstanding.`,
  };
}

async function fetchSecJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Stock Research Platform research@example.com",
        Accept: "application/json, text/plain;q=0.9, text/html;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchSecText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Stock Research Platform research@example.com",
        Accept: "text/plain, text/html;q=0.9, */*;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function getAnnualExhibitAffo(cik: string): Promise<AffoData> {
  const paddedCik = cik.padStart(10, "0");
  const submissions = await fetchSecJson<SecSubmissions>(
    `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
  );
  const recent = submissions?.filings?.recent;
  if (!recent) return extractReportedAffo({});

  const forms = recent.form ?? [];
  const filingDates = recent.filingDate ?? [];
  const reportDates = recent.reportDate ?? [];
  const accessions = recent.accessionNumber ?? [];
  const annualIndex = forms.findIndex((form) => /^10-K(?:\/A)?$/.test(form));
  if (annualIndex < 0 || !reportDates[annualIndex] || !filingDates[annualIndex]) {
    return extractReportedAffo({});
  }

  const period = reportDates[annualIndex];
  const annualFiledAt = Date.parse(filingDates[annualIndex]);
  const nearbyEightKs = forms.flatMap((form, index) => {
    if (form !== "8-K" || !filingDates[index] || !accessions[index]) return [];
    const distanceDays =
      (Date.parse(filingDates[index]) - annualFiledAt) / (24 * 60 * 60 * 1_000);
    return distanceDays >= -45 && distanceDays <= 15
      ? [{ filedAt: filingDates[index], accession: accessions[index] }]
      : [];
  });

  for (const filing of nearbyEightKs.slice(0, 4)) {
    const accessionPath = filing.accession.replace(/-/g, "");
    const text = await fetchSecText(
      `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath}/${filing.accession}.txt`,
    );
    if (!text) continue;
    const extracted = extractAnnualAffoFromExhibitText(
      text,
      period,
      filing.filedAt,
      filing.accession,
    );
    if (extracted.status === "reported") return extracted;
  }
  return extractReportedAffo({});
}

const reportedAffoCache = new Map<string, Promise<AffoData>>();

export async function getReportedAffo(cik: string | null): Promise<AffoData> {
  if (!cik) return extractReportedAffo({});
  const normalizedCik = String(Number(cik));
  const existing = reportedAffoCache.get(normalizedCik);
  if (existing) return existing;

  const pending = (async () => {
    const facts = await fetchSecJson<SecCompanyFacts>(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${normalizedCik.padStart(10, "0")}.json`,
    );
    const structured = extractReportedAffo(facts ?? {});
    if (structured.status === "reported") return structured;
    return await getAnnualExhibitAffo(normalizedCik);
  })();
  reportedAffoCache.set(normalizedCik, pending);
  return pending;
}