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

const AFFO_TOTAL_CONCEPTS = new Set([
  "adjustedfundsfromoperations",
  "adjustedfundsfromoperationsattributabletocommonshareholders",
  "adjustedfundsfromoperationsattributabletocommonstockholders",
  "adjustedfundsfromoperationsavailabletocommonshareholders",
  "adjustedfundsfromoperationsavailabletocommonstockholders",
]);

const AFFO_PER_SHARE_CONCEPTS = new Set([
  "adjustedfundsfromoperationspershare",
  "adjustedfundsfromoperationsperdilutedshare",
  "adjustedfundsfromoperationsattributabletocommonshareholderspershare",
  "adjustedfundsfromoperationsattributabletocommonstockholderspershare",
]);

function normalizedConcept(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
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
    if (!/^(10-K)(\/A)?$/.test(fact.form ?? "")) return false;
    if (fact.fp !== "FY" || !fact.start || !fact.end || !fact.filed) return false;
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
  }> = [];

  for (const [namespace, concepts] of Object.entries(data.facts ?? {})) {
    if (namespace === "us-gaap" || namespace === "dei") continue;
    for (const [concept, definition] of Object.entries(concepts)) {
      const normalized = normalizedConcept(concept);
      const kind = AFFO_TOTAL_CONCEPTS.has(normalized)
        ? "total"
        : AFFO_PER_SHARE_CONCEPTS.has(normalized)
          ? "perShare"
          : null;
      if (!kind) continue;
      const preferredUnits =
        kind === "total"
          ? ["USD"]
          : ["USD/shares", "USD / shares", "USD/share"];
      for (const unit of preferredUnits) {
        for (const fact of validAnnualFacts(definition.units?.[unit])) {
          candidates.push({ fact, namespace, concept, kind });
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
      note: "No reliable company-reported AFFO fact was found in structured SEC annual filing data. FFO and free cash flow were not substituted.",
    };
  }

  candidates.sort((a, b) =>
    (b.fact.end ?? "").localeCompare(a.fact.end ?? "") ||
    (b.fact.filed ?? "").localeCompare(a.fact.filed ?? ""),
  );
  const latestPeriod = candidates[0].fact.end!;
  const latest = candidates.filter((candidate) => candidate.fact.end === latestPeriod);
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
      note: "Multiple conflicting AFFO facts were reported for the latest annual period, so no value was selected.",
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
      ? "Company-reported AFFO per share."
      : "Company-reported total AFFO; per-share value may be calculated from reported shares outstanding.",
  };
}

export async function getReportedAffo(cik: string | null): Promise<AffoData> {
  if (!cik) return extractReportedAffo({});
  try {
    const response = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, "0")}.json`,
      {
        headers: {
          "User-Agent": "Stock Research Platform research@example.com",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) return extractReportedAffo({});
    return extractReportedAffo((await response.json()) as SecCompanyFacts);
  } catch {
    return extractReportedAffo({});
  }
}