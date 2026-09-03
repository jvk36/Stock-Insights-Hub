import * as cheerio from "cheerio";
import YahooFinance from "yahoo-finance2";
import { execFile, execSync } from "node:child_process";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SEC_USER_AGENT = "Stock Research Platform research@example.com";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const INCOMPLETE_CACHE_TTL_MS = 60 * 1000;
const ACTIVIST_LOOKBACK_YEARS = 4;
const responseCache = new Map<string, { expiresAt: number; value: BoardLeadershipData }>();
let secRequestQueue: Promise<void> = Promise.resolve();
let lastSecRequestAt = 0;
const SEC_REQUEST_INTERVAL_MS = 175;
const CURL_BIN = (() => {
  try {
    return execSync("which curl", { encoding: "utf8" }).trim();
  } catch {
    return "curl";
  }
})();

async function scheduleSecRequest<T>(request: () => Promise<T>): Promise<T> {
  const scheduled = secRequestQueue.then(async () => {
    const waitMs = Math.max(
      0,
      SEC_REQUEST_INTERVAL_MS - (Date.now() - lastSecRequestAt),
    );
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastSecRequestAt = Date.now();
    return await request();
  });
  secRequestQueue = scheduled.then(() => undefined, () => undefined);
  return await scheduled;
}

type NullableNumber = number | null;

type Compensation = {
  fiscalYear: number | null;
  salary: NullableNumber;
  stockAwards: NullableNumber;
  optionAwards: NullableNumber;
  nonEquityIncentive: NullableNumber;
  otherCompensation: NullableNumber;
  total: NullableNumber;
};

type OwnershipRecord = {
  name: string;
  shares: number;
  date: string | null;
};

type ProxyFiling = {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
};

type SecSubmissions = {
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
      fileNumber?: string[];
    };
  };
};

export type BoardLeadershipData = {
  symbol: string;
  companyName: string;
  dataAsOf: string;
  executives: Array<{
    name: string;
    title: string;
    age: number | null;
    yearBorn: number | null;
    isFounder: boolean;
    sharesOwned: number | null;
    ownershipDate: string | null;
    compensation: Compensation;
  }>;
  boardMembers: Array<{
    name: string;
    role: string | null;
    occupation: string | null;
    age: number | null;
    directorSince: number | null;
    tenureYears: number | null;
    isIndependent: boolean | null;
    isFounder: boolean;
    sharesOwned: number | null;
    upForElection: boolean;
    electionYear: number | null;
    electionTerm: string | null;
  }>;
  activistCampaigns: Array<{
    activistName: string;
    status: "active" | "recent" | "concluded" | "settled" | "unknown";
    filingDate: string;
    form: string;
    objective: string | null;
    statusDetail: string;
    sourceUrl: string;
  }>;
  activistSummary: string;
  sources: Array<{
    label: string;
    filingDate: string | null;
    url: string | null;
  }>;
  coverage: {
    proxyAvailable: boolean;
    executiveCompensationAvailable: boolean;
    boardRosterAvailable: boolean;
    activistFilingsReviewed: number;
    note: string;
  };
};

function normalizeSpace(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPersonName(value: string): string {
  const cleaned = normalizeSpace(value)
    .replace(/^(Mr|Ms|Mrs|Miss|Dr|Sir)\.?\s+/i, "")
    .replace(/\s+(Jr|Sr|II|III|IV)\.?$/i, "")
    .trim();
  if (cleaned && cleaned === cleaned.toUpperCase()) {
    return cleaned
      .toLowerCase()
      .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toUpperCase());
  }
  return cleaned;
}

function personTokens(value: string): string[] {
  return cleanPersonName(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function samePerson(left: string, right: string): boolean {
  const a = personTokens(left);
  const b = personTokens(right);
  if (a.length < 2 || b.length < 2) return false;
  const naturalOrder = a.at(-1) === b.at(-1) && a[0]?.[0] === b[0]?.[0];
  const leftReversed = a[0] === b.at(-1) && a[1]?.[0] === b[0]?.[0];
  const rightReversed = b[0] === a.at(-1) && b[1]?.[0] === a[0]?.[0];
  return naturalOrder || leftReversed || rightReversed;
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/\([^)]*\)/g, "").replace(/[$,%\s,]/g, "");
  if (!normalized || normalized === "—" || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function filingUrl(cik: string, filing: ProxyFiling): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accessionNumber.replace(/-/g, "")}/`;
}

function documentUrl(cik: string, filing: ProxyFiling): string {
  return `${filingUrl(cik, filing)}${encodeURIComponent(filing.primaryDocument.split("/").at(-1) ?? filing.primaryDocument)}`;
}

async function fetchSec(url: string): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await scheduleSecRequest(async () =>
        await fetch(url, {
          headers: {
            "User-Agent": SEC_USER_AGENT,
            Accept: "application/json, text/html;q=0.9, */*;q=0.8",
          },
          signal: AbortSignal.timeout(12_000),
        })
      );
      lastResponse = response;
      if (response.ok || ![403, 429, 500, 502, 503, 504].includes(response.status)) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt === 0) {
      const retryDelay = lastResponse?.status === 429 ? 2_000 : 750;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  if (lastResponse?.status === 429) return lastResponse;
  try {
    return await scheduleSecRequest(async () =>
      await new Promise<Response>((resolve, reject) => {
        execFile(
          CURL_BIN,
          [
            "-sS",
            "-L",
            "--max-time",
            "30",
            "-A",
            SEC_USER_AGENT,
            "-H",
            "Accept: application/json, text/html;q=0.9, */*;q=0.8",
            "-w",
            "\n%{http_code}",
            url,
          ],
          { maxBuffer: 25 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`SEC curl fallback failed: ${error.message} — ${stderr}`));
              return;
            }
            const marker = stdout.lastIndexOf("\n");
            const body = marker >= 0 ? stdout.slice(0, marker) : stdout;
            const status = marker >= 0 ? Number(stdout.slice(marker + 1)) : 200;
            resolve(new Response(body, { status: Number.isFinite(status) ? status : 200 }));
          },
        );
      })
    );
  } catch {
    if (lastResponse) return lastResponse;
    if (lastError instanceof Error) throw lastError;
    throw new Error(`SEC request failed for ${url}`);
  }
}

function submissionFilings(data: SecSubmissions): ProxyFiling[] {
  const recent = data.filings?.recent ?? {};
  const forms = recent.form ?? [];
  const dates = recent.filingDate ?? [];
  const accessions = recent.accessionNumber ?? [];
  const documents = recent.primaryDocument ?? [];

  return forms.flatMap((form, index) => {
    if (!form || !dates[index] || !accessions[index] || !documents[index]) return [];
    return [{
      form,
      filingDate: dates[index],
      accessionNumber: accessions[index],
      primaryDocument: documents[index],
    }];
  });
}

function findOwnership(
  ownership: OwnershipRecord[],
  name: string,
): OwnershipRecord | null {
  const matches = ownership
    .filter((entry) => samePerson(entry.name, name))
    .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""));
  return matches.find((entry) => entry.shares > 0) ?? matches[0] ?? null;
}

function parseOwnershipTable($: cheerio.CheerioAPI): OwnershipRecord[] {
  const records: OwnershipRecord[] = [];

  $("table").each((_index, table) => {
    const tableText = normalizeSpace($(table).text());
    if (
      !(
        /Name(?: and Address)?(?: of Beneficial Owner)?/i.test(tableText) ||
        /Beneficial ownership.{0,80}\bName\b/i.test(tableText)
      ) ||
      !(
        /(Shares|Securities).{0,50}Beneficially Owned/i.test(tableText) ||
        /Amount and\s*Nature of\s*Beneficial\s*Ownership/i.test(tableText) ||
        /Beneficial ownership.{0,100}Common\s*stock/i.test(tableText)
      )
    ) {
      return;
    }

    $(table).find("tr").each((_rowIndex, row) => {
      const cells = $(row)
        .find("th,td")
        .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
        .get()
        .filter(Boolean);
      const name = cells[0];
      const parsedShares = parseNumber(
        cells.find((cell, index) => index > 0 && /[\d,]{2,}/.test(cell) && !/%/.test(cell)),
      );
      const shares = parsedShares ??
        (cells.slice(1).some((cell) => /^(?:—|-|\*)$/.test(cell)) ? 0 : null);
      if (
        !name ||
        shares == null ||
        /Name(?: and Address)? of Beneficial Owner|All current directors|All directors and executive/i.test(name)
      ) {
        return;
      }
      const nameWithoutAddress = name.replace(
        /\s+\d{1,6}\s+[A-Za-z][\s\S]*$/,
        "",
      );
      records.push({
        name: cleanPersonName(nameWithoutAddress.replace(/\(\d+\)/g, "")),
        shares,
        date: null,
      });
    });
  });

  return records;
}

function xmlValue(xml: string, tag: string): string | null {
  const match = xml.match(
    new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:[A-Za-z0-9_-]+:)?${tag}>`, "i"),
  )?.[0];
  if (!match) return null;
  const value = match.match(
    /<(?:[A-Za-z0-9_-]+:)?value\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?value>/i,
  )?.[1] ?? match.replace(/<[^>]+>/g, "");
  return normalizeSpace(
    value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, "\""),
  ) || null;
}

function xmlBlocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(
    new RegExp(
      `<(?:[A-Za-z0-9_-]+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:[A-Za-z0-9_-]+:)?${tag}>`,
      "gi",
    ),
  )].map((match) => match[0]);
}

function form4HoldingFromXml(
  xml: string,
  filingDate: string,
  candidateNames: string[],
): OwnershipRecord | null {
  const ownerName = xmlValue(xml, "rptOwnerName");
  if (!ownerName || !candidateNames.some((name) => samePerson(ownerName, name))) return null;

  const directHoldings: Array<{ shares: number; date: string }> = [];
  for (const block of [
    ...xmlBlocks(xml, "nonDerivativeHolding"),
    ...xmlBlocks(xml, "nonDerivativeTransaction"),
  ]) {
    const ownership = xmlValue(block, "directOrIndirectOwnership");
    const shares = parseNumber(
      xmlValue(block, "sharesOwnedFollowingTransaction") ??
      xmlValue(block, "sharesOwned"),
    );
    if (ownership !== "D" || shares == null) continue;
    directHoldings.push({
      shares,
      date: xmlValue(block, "transactionDate") ??
        xmlValue(xml, "periodOfReport") ??
        filingDate,
    });
  }
  const latestDirectHolding = directHoldings.at(-1);
  return latestDirectHolding
    ? { name: ownerName, shares: latestDirectHolding.shares, date: latestDirectHolding.date }
    : null;
}

async function fetchRecentForm4Ownership(
  cik: string,
  submissions: SecSubmissions,
  candidateNames: string[],
): Promise<OwnershipRecord[]> {
  const recent = submissions.filings?.recent ?? {};
  const entries = (recent.form ?? []).flatMap((form, index) => {
    const accessionNumber = recent.accessionNumber?.[index];
    const primaryDocument = recent.primaryDocument?.[index];
    const filingDate = recent.filingDate?.[index];
    const isIssuerSideFiling = !recent.fileNumber?.[index]?.trim();
    if (
      (form !== "4" && form !== "4/A") ||
      !accessionNumber ||
      !primaryDocument ||
      !filingDate ||
      !isIssuerSideFiling
    ) {
      return [];
    }
    return [{
      form,
      accessionNumber,
      primaryDocument,
      filingDate,
    }];
  }).slice(0, 24);

  const records = await Promise.all(entries.map(async (entry) => {
    try {
      const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${entry.accessionNumber.replace(/-/g, "")}/${encodeURIComponent(entry.primaryDocument.split("/").at(-1) ?? entry.primaryDocument)}`;
      const response = await fetchSec(url);
      if (!response.ok) return null;
      const xml = await response.text();
      if (!/<(?:[A-Za-z0-9_-]+:)?ownershipDocument\b/i.test(xml)) return null;
      const issuerCik = xmlValue(xml, "issuerCik")?.replace(/^0+/, "");
      if (issuerCik !== cik.replace(/^0+/, "")) return null;
      return form4HoldingFromXml(xml, entry.filingDate, candidateNames);
    } catch {
      return null;
    }
  }));

  const latestByOwner: OwnershipRecord[] = [];
  for (const record of records) {
    if (!record) continue;
    if (!latestByOwner.some((existing) => samePerson(existing.name, record.name))) {
      latestByOwner.push(record);
    }
  }
  return latestByOwner;
}

function splitNameAndTitle(value: string): { name: string; title: string } | null {
  const cleaned = normalizeSpace(value).replace(/\(\d+\)/g, "");
  const titleStart = cleaned.search(
    /\s(?=(?:Chief|CEO\b|CFO\b|COO\b|President\b|Executive\b|Senior\b|Former\b|Interim\b|General Counsel\b|Principal\b|Chair(?:man|woman)?\b))/i,
  );
  if (titleStart < 2) return null;
  const name = cleanPersonName(cleaned.slice(0, titleStart));
  const title = normalizeSpace(cleaned.slice(titleStart));
  return name && title ? { name, title } : null;
}

function findHeaderIndex(headers: string[], matcher: RegExp): number {
  return headers.findIndex((header) => matcher.test(header));
}

function parseExecutiveCompensation($: cheerio.CheerioAPI): Array<{
  name: string;
  title: string;
  compensation: Compensation;
}> {
  const results = new Map<string, { name: string; title: string; compensation: Compensation }>();

  $("table").each((_index, table) => {
    const rows = $(table).find("tr").toArray();
    const headerRow = rows.find((row) => {
      const text = normalizeSpace($(row).text());
      return /Name and Principal Position/i.test(text) && /Salary/i.test(text) && /Total/i.test(text);
    });
    if (!headerRow) return;

    const headers = $(headerRow)
      .find("th,td")
      .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
      .get();
    const nameIndex = findHeaderIndex(headers, /Name and Principal Position/i);
    const yearIndex = findHeaderIndex(headers, /^Year$/i);
    const salaryIndex = findHeaderIndex(headers, /Salary/i);
    const stockIndex = findHeaderIndex(headers, /Stock Awards/i);
    const optionIndex = findHeaderIndex(headers, /Option Awards/i);
    const incentiveIndex = findHeaderIndex(headers, /Non-Equity Incentive/i);
    const otherIndex = findHeaderIndex(headers, /All Other Compensation/i);
    const totalIndex = findHeaderIndex(headers, /^Total/i);
    if (nameIndex < 0 || yearIndex < 0 || totalIndex < 0) return;

    for (const row of rows.slice(rows.indexOf(headerRow) + 1)) {
      const cells = $(row)
        .find("th,td")
        .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
        .get();
      const identity = splitNameAndTitle(cells[nameIndex] ?? "");
      if (!identity || /^Former\b/i.test(identity.title)) continue;
      const fiscalYear = parseNumber(cells[yearIndex]);
      if (fiscalYear == null || fiscalYear < 2000) continue;
      const existing = [...results.values()].find((entry) => samePerson(entry.name, identity.name));
      if (existing && (existing.compensation.fiscalYear ?? 0) >= fiscalYear) continue;

      results.set(identity.name, {
        ...identity,
        compensation: {
          fiscalYear,
          salary: salaryIndex >= 0 ? parseNumber(cells[salaryIndex]) : null,
          stockAwards: stockIndex >= 0 ? parseNumber(cells[stockIndex]) : null,
          optionAwards: optionIndex >= 0 ? parseNumber(cells[optionIndex]) : null,
          nonEquityIncentive: incentiveIndex >= 0 ? parseNumber(cells[incentiveIndex]) : null,
          otherCompensation: otherIndex >= 0 ? parseNumber(cells[otherIndex]) : null,
          total: parseNumber(cells[totalIndex]),
        },
      });
    }
  });

  return [...results.values()];
}

function electionTermFromText(text: string): string | null {
  if (/elected annually for (?:a\s+)?(?:one[- ]year|1[- ]year) term/i.test(text)) {
    return "Annual, one-year term";
  }
  if (
    /all (?:of )?(?:our )?directors are elected annually/i.test(text) ||
    /declassified board.{0,120}elected annually/i.test(text)
  ) {
    return "Annual election";
  }
  const classifiedMatch = text.match(/(?:classified|staggered) board.{0,120}?(\w+)-year terms?/i);
  return classifiedMatch ? `${classifiedMatch[1]}-year staggered term` : null;
}

function parseBoardMembers(
  $: cheerio.CheerioAPI,
  ownership: OwnershipRecord[],
  proxyText: string,
  electionYear: number,
  executiveNames: string[],
) {
  const members: BoardLeadershipData["boardMembers"] = [];
  const electionTerm = electionTermFromText(proxyText);
  const addMember = ({
    name: rawName,
    role = null,
    occupation = null,
    age = null,
    directorSince,
    independent = null,
  }: {
    name: string;
    role?: string | null;
    occupation?: string | null;
    age?: number | null;
    directorSince: number;
    independent?: boolean | null;
  }) => {
    const name = cleanPersonName(rawName.replace(/\*+$/, ""));
    if (!name || directorSince < 1900 || members.some((member) => samePerson(member.name, name))) {
      return;
    }
    const ownershipRecord = findOwnership(ownership, name);
    const isCompanyExecutive = executiveNames.some((executiveName) => samePerson(executiveName, name));
    members.push({
      name,
      role,
      occupation,
      age,
      directorSince,
      tenureYears: Math.max(0, electionYear - directorSince),
      isIndependent: independent ?? (isCompanyExecutive ? false : null),
      isFounder: /\b(co-?founder|founder)\b/i.test(`${role ?? ""} ${occupation ?? ""}`),
      sharesOwned: ownershipRecord?.shares ?? null,
      upForElection: true,
      electionYear,
      electionTerm,
    });
  };
  const ownershipNameAtStart = (value: string): string | null => {
    const normalizedValue = normalizeSpace(value).toLowerCase();
    const directMatch = ownership
      .filter((record) => normalizedValue.startsWith(normalizeSpace(record.name).toLowerCase()))
      .sort((left, right) => right.name.length - left.name.length)[0];
    if (directMatch) return directMatch.name;
    const textTokens = personTokens(value);
    const match = ownership.find((record) => {
      const tokens = personTokens(record.name);
      if (tokens.length < 2 || textTokens.length < 2) return false;
      const lastIndex = textTokens.indexOf(tokens.at(-1)!);
      return textTokens[0] === tokens[0] && lastIndex > 0 && lastIndex <= 4;
    });
    return match?.name ?? null;
  };
  const inferredSummaryName = (value: string): string | null => {
    const withoutParentheticalRole = value.replace(
      /\s*\((?:Board Chair|Chair|Lead Director|Lead Independent Director)\)\s*/gi,
      " ",
    );
    const fromOwnership = ownershipNameAtStart(withoutParentheticalRole);
    if (fromOwnership) return fromOwnership;
    const beforeLabels = withoutParentheticalRole.split(
      /\b(?:Age|Director(?: and Chairperson)? since)\s*:/i,
    )[0];
    const beforeRole = beforeLabels.split(
      /\s+(?=Lead Independent Director\b|Independent Director\b|Chairman of the Board\b|Partner\b|Former\b|Retired\b|Founder\b|Co-Founder\b|Chair(?:man)?\b|President\b|Senior\b|Executive\b|Chief\b|CEO\b|CFO\b|Group CEO\b|Managing\b|Professor\b)/i,
    )[0];
    return cleanPersonName(beforeRole.replace(/\([^)]*\)/g, "").trim()) || null;
  };

  $("table").each((_index, table) => {
    const rows = $(table).find("tr").toArray();
    const headerRow = rows.find((row) => {
      const headers = $(row)
        .children("th,td")
        .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
        .get();
      return headers.some((header) => /\bName\b/i.test(header)) &&
        headers.some((header) => /\bOccupation\b/i.test(header)) &&
        headers.some((header) => /Director Since/i.test(header));
    });
    if (!headerRow) return;

    const headers = $(headerRow)
      .children("th,td")
      .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
      .get();
    const nameIndex = findHeaderIndex(headers, /^Name$/i);
    const occupationIndex = findHeaderIndex(headers, /Occupation/i);
    const ageIndex = findHeaderIndex(headers, /^Age$/i);
    const sinceIndex = findHeaderIndex(headers, /Director Since/i);
    const independentIndex = findHeaderIndex(headers, /Independent/i);
    if (nameIndex < 0 || sinceIndex < 0) return;

    for (const row of rows.slice(rows.indexOf(headerRow) + 1)) {
      const cells = $(row)
        .children("th,td")
        .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
        .get();
      const directorSince = parseNumber(cells[sinceIndex]);
      const rawName = cells[nameIndex] ?? "";
      if (
        directorSince == null ||
        directorSince < 1900 ||
        /Name|Chair\s*Member|Committee/i.test(rawName)
      ) {
        continue;
      }

      const roleMatch = rawName.match(
        /\b(Board Chair|Lead Independent Director|Lead Director|Chair(?:man|woman)?)\b/i,
      );
      const name = cleanPersonName(
        rawName.replace(
          /\s*\(?(Board Chair|Lead Independent Director|Lead Director|Chair(?:man|woman)?)\)?.*$/i,
          "",
        ),
      );
      if (!name || members.some((member) => samePerson(member.name, name))) continue;
      const occupation = occupationIndex >= 0 ? cells[occupationIndex] || null : null;
      const independentText = independentIndex >= 0 ? cells[independentIndex] ?? "" : "";
      const ownershipRecord = findOwnership(ownership, name);
      const isCompanyExecutive = executiveNames.some((executiveName) => samePerson(executiveName, name));

      members.push({
        name,
        role: roleMatch ? normalizeSpace(roleMatch[1]) : null,
        occupation,
        age: ageIndex >= 0 ? parseNumber(cells[ageIndex]) : null,
        directorSince,
        tenureYears: Math.max(0, electionYear - directorSince),
        isIndependent: /yes|independent|✓|●|x/i.test(independentText)
          ? true
          : isCompanyExecutive
            ? false
            : null,
        isFounder: /\b(co-?founder|founder)\b/i.test(`${rawName} ${occupation ?? ""}`),
        sharesOwned: ownershipRecord?.shares ?? null,
        upForElection: true,
        electionYear,
        electionTerm,
      });
    }
  });

  if (members.length === 0) {
    $("table").each((_index, table) => {
      const rows = $(table).find("tr").toArray();
      const headerRow = rows.find((row) => {
        const headers = $(row)
          .children("th,td")
          .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
          .get();
        return findHeaderIndex(headers, /^Name$/i) >= 0 &&
          findHeaderIndex(headers, /Director Since/i) >= 0 &&
          findHeaderIndex(headers, /Primary (?:Employment|Occupation)/i) >= 0;
      });
      if (!headerRow) return;
      const headers = $(headerRow)
        .children("th,td")
        .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
        .get();
      const nameIndex = findHeaderIndex(headers, /^Name$/i);
      const sinceIndex = findHeaderIndex(headers, /Director Since/i);
      const occupationIndex = findHeaderIndex(headers, /Primary (?:Employment|Occupation)/i);
      const independentIndex = findHeaderIndex(headers, /Independent/i);
      for (const row of rows.slice(rows.indexOf(headerRow) + 1)) {
        const cells = $(row)
          .children("th,td")
          .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
          .get();
        const directorSince = parseNumber(cells[sinceIndex]);
        if (directorSince == null || directorSince < 1900 || !cells[nameIndex]) continue;
        addMember({
          name: cells[nameIndex],
          occupation: cells[occupationIndex] || null,
          directorSince,
          independent: independentIndex >= 0 &&
              /^(?:yes|ü|✓|x)$/i.test(cells[independentIndex] ?? "")
            ? true
            : null,
        });
      }
    });
  }

  if (members.length === 0) {
    $("table").each((_index, table) => {
      const tableText = normalizeSpace($(table).text());
      if (!/Director\s*Since/i.test(tableText) || !/Age/i.test(tableText)) return;

      $(table).find("tr").each((_rowIndex, row) => {
        const cells = $(row)
          .children("th,td")
          .map((_cellIndex, cell) => normalizeSpace($(cell).text()))
          .get()
          .filter(Boolean);
        if (cells.length === 0) return;

        if (/^\d{2,3}$/.test(cells[1] ?? "") && /^(?:\d{4}|New\s*Nominee)$/i.test(cells[2] ?? "")) {
          const name = inferredSummaryName(cells[0]);
          if (!name) return;
          const occupation = normalizeSpace(cells[0].slice(
            Math.min(cells[0].length, cells[0].toLowerCase().indexOf(name.toLowerCase()) + name.length),
          )) || (cells[3] && !/^(?:yes|no|ü|✓|x)$/i.test(cells[3]) ? cells[3] : null);
          const roleMatch = cells[0].match(/\b(Lead Independent Director|Board Chair|Chairman of the Board)\b/i);
          addMember({
            name,
            role: roleMatch
              ? /lead/i.test(roleMatch[1])
                ? "Lead Independent Director"
                : "Board Chair"
              : null,
            occupation,
            age: Number(cells[1]),
            directorSince: /^\d{4}$/.test(cells[2]) ? Number(cells[2]) : electionYear,
            independent: cells.some((cell) => /^(?:yes|ü|✓)$/i.test(cell))
              ? true
              : cells.some((cell) => /^no$/i.test(cell))
                ? false
                : null,
          });
          return;
        }

        const firstCellMatch = cells[0].match(
          /^([\s\S]+?)Director since\s*:?\s*(\d{4})$/i,
        );
        if (firstCellMatch && /^\d{2,3}$/.test(cells[1] ?? "")) {
          const role = /Lead Independent Director/i.test(cells[0])
            ? "Lead Independent Director"
            : null;
          addMember({
            name: inferredSummaryName(firstCellMatch[1]) ?? firstCellMatch[1],
            role,
            occupation: cells[2] ?? null,
            age: Number(cells[1]),
            directorSince: Number(firstCellMatch[2]),
          });
        }

        for (const cell of cells) {
          const cardMatch = cell.match(
            /^(.{2,100}?)\s+Age:\s*(\d{2,3})\s+Director Since:\s*(\d{4})\b/i,
          );
          if (!cardMatch) continue;
          addMember({
            name: inferredSummaryName(cardMatch[1]) ?? cardMatch[1],
            age: Number(cardMatch[2]),
            directorSince: Number(cardMatch[3]),
          });
        }
      });
    });
  }

  if (members.length === 0) {
    $("table").each((_index, table) => {
      const text = normalizeSpace($(table).text());
      const ageMatch = text.match(/\bAge:\s*(\d{2,3})\b/i);
      const sinceMatch = text.match(
        /\bDirector(?: and Chairperson)? since:\s*(?:[A-Za-z]+\s+)?(\d{4})\b/i,
      );
      if (!ageMatch || !sinceMatch) return;

      const headingMatch = text.match(
        /^(.{2,100}?)\s+(LEAD INDEPENDENT DIRECTOR|INDEPENDENT DIRECTOR|CHAIRMAN OF THE BOARD|BOARD CHAIR|CO-CHIEF EXECUTIVE OFFICER[\s\S]{0,80}?AND DIRECTOR)\b/i,
      );
      const headingName = headingMatch
        ? cleanPersonName(headingMatch[1].replace(/\*+$/, ""))
        : null;
      const profileNameMatch = headingName
        ? null
        : text.match(
          /^(.{2,100}?)\s+(?=Founder and Executive Chair\b|President and CEO\b|Co-Founder\b|Lead Independent Director\b|Senior Counsel\b|Dean\b|Managing General Partner\b|Managing Partner\b|Former\b|Chairman\b|President\b)/i,
        );
      const inferredName = headingName ??
        (profileNameMatch ? cleanPersonName(profileNameMatch[1]) : null);
      const ownershipRecord = inferredName
        ? findOwnership(ownership, inferredName)
        : ownership
          .filter((record) => {
            const normalizedName = normalizeSpace(record.name);
            return normalizedName.length >= 5 &&
              text.toLowerCase().startsWith(normalizedName.toLowerCase());
          })
          .sort((left, right) => right.name.length - left.name.length)[0];

      const name = inferredName ??
        (ownershipRecord ? cleanPersonName(ownershipRecord.name) : null);
      if (!name) return;
      if (members.some((member) => samePerson(member.name, name))) return;
      const directorSince = Number(sinceMatch[1]);
      const profileLead = headingMatch
        ? normalizeSpace(headingMatch[2])
        : normalizeSpace(
          text.slice(
            name.length,
            Math.min(
              ...[
                text.search(/\bAdditional Skills:/i),
                text.search(/\bExpertise Provided to the Board\b/i),
                text.search(/\bNotable Experience\b/i),
                text.search(/\bBackground\b/i),
                ageMatch.index ?? text.length,
              ].filter((index) => index >= 0),
            ),
          ),
        );
      const role = /\bLead Independent Director\b/i.test(profileLead)
        ? "Lead Independent Director"
        : /\b(?:Chairman of the Board|Board Chair)\b/i.test(profileLead)
          ? "Board Chair"
          : /\bExecutive Chair(?:man)?\b/i.test(profileLead) &&
              !/\bFormer Executive Chair(?:man)?\b/i.test(profileLead)
            ? "Executive Chair"
            : null;
      const isCompanyExecutive = executiveNames.some((executiveName) =>
        samePerson(executiveName, name)
      );
      const occupation = /^(?:Lead )?Independent Director$|^Chairman of the Board$|^Board Chair$/i
        .test(profileLead)
        ? null
        : profileLead.replace(/\s+AND DIRECTOR$/i, "") || null;

      members.push({
        name,
        role,
        occupation,
        age: Number(ageMatch[1]),
        directorSince,
        tenureYears: Math.max(0, electionYear - directorSince),
        isIndependent: /Lead Independent Director/i.test(profileLead)
          ? true
          : isCompanyExecutive
            ? false
            : null,
        isFounder: /\b(co-?founder|founder)\b/i.test(profileLead),
        sharesOwned: ownershipRecord?.shares ?? null,
        upForElection: true,
        electionYear,
        electionTerm,
      });
    });
  }

  if (members.length === 0) {
    $("table").each((_index, table) => {
      const text = normalizeSpace($(table).text());
      const match = text.match(
        /^([A-Z][A-Z .,'’&-]{3,}?)\s*DIRECTOR SINCE\s*(\d{4})([\s\S]{0,260}?)AGE:\s*(\d{2,3})/i,
      );
      if (!match) return;
      const name = cleanPersonName(match[1]);
      if (!name || members.some((member) => samePerson(member.name, name))) return;
      const directorSince = Number(match[2]);
      const occupation = normalizeSpace(
        match[3]
          .replace(/_{2,}/g, " ")
          .replace(/^[-–—:\s]+|[-–—:\s]+$/g, ""),
      ) || null;
      const ownershipRecord = findOwnership(ownership, name);
      members.push({
        name,
        role: null,
        occupation,
        age: Number(match[4]),
        directorSince,
        tenureYears: Math.max(0, electionYear - directorSince),
        isIndependent: executiveNames.some((executiveName) => samePerson(executiveName, name))
          ? false
          : null,
        isFounder: /\b(co-?founder|founder)\b/i.test(occupation ?? ""),
        sharesOwned: ownershipRecord?.shares ?? null,
        upForElection: true,
        electionYear,
        electionTerm,
      });
    });
  }

  return members;
}

function activistNameFromDocument(rawText: string): string {
  const markerMatch = rawText.match(
    /\(Name of Registrant[^)]*\)\s*([\s\S]{1,1800}?)\s*\(Name of Person\(s\)\s+Filing Proxy Statement[^)]*\)/i,
  );
  if (!markerMatch) return "Non-management solicitor";
  const segment = markerMatch[1]
    .split(/\n+/)
    .map(normalizeSpace)
    .filter(Boolean)
    .join(" ");
  const organization = segment.match(
    /^(.{2,140}?(?:L\.P\.|L\.L\.C\.|LLC|Inc\.|Ltd\.|Corporation|Partners|Capital|Management))(?:\s|$)/i,
  );
  return normalizeSpace(organization?.[1] ?? segment.split(/\s{2,}/)[0] ?? "Non-management solicitor");
}

function activistNameFromContext(flatText: string): string | null {
  const match = flatText.match(
    /\b([A-Z][A-Za-z0-9&.' -]{2,90}?(?:Fund Management|Management|Capital|Partners)(?:,?\s*(?:L\.P\.|L\.L\.C\.|LLC))?)\b.{0,140}?(?:solicitation of proxies|participants in the solicitation)/i,
  );
  return match ? normalizeSpace(match[1]) : null;
}

function objectiveFromDocument(flatText: string): string | null {
  const sentences = flatText.split(/(?<=[.!?])\s+/);
  const sentence = sentences.find((candidate) =>
    /(solicitation of proxies|proxy contest|nominee|board seat|annual meeting)/i.test(candidate) &&
    !/Pursuant to Section 14/i.test(candidate),
  );
  if (!sentence) return null;
  const cleaned = normalizeSpace(sentence);
  return cleaned.length > 420 ? `${cleaned.slice(0, 417)}…` : cleaned;
}

function activistStatus(
  filingDate: string,
  documentText: string,
): BoardLeadershipData["activistCampaigns"][number]["status"] {
  if (/\b(settlement|settled|withdrew|withdrawn|terminated the solicitation)\b/i.test(documentText)) {
    return "settled";
  }
  const ageDays = (Date.now() - Date.parse(filingDate)) / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(ageDays)) return "unknown";
  if (ageDays <= 365) return "active";
  if (ageDays <= 730) return "recent";
  return "concluded";
}

function statusDetail(
  status: BoardLeadershipData["activistCampaigns"][number]["status"],
  filingDate: string,
): string {
  switch (status) {
    case "active":
      return `A non-management proxy solicitation was filed recently, on ${filingDate}; the campaign may still be active.`;
    case "recent":
      return `The latest non-management proxy filing was ${filingDate}. Review the source for developments after that filing.`;
    case "settled":
      return `The filing language indicates that the solicitation was settled or withdrawn; the latest filing reviewed is dated ${filingDate}.`;
    case "concluded":
      return `The last SEC campaign filing was ${filingDate}, with no newer non-management solicitation found in the reviewed company feed.`;
    default:
      return `A non-management proxy filing was found on ${filingDate}, but its current status could not be determined.`;
  }
}

async function parseActivistCampaigns(
  cik: string,
  filings: ProxyFiling[],
): Promise<{
  campaigns: BoardLeadershipData["activistCampaigns"];
  reviewed: number;
}> {
  const cutoffYear = new Date().getUTCFullYear() - ACTIVIST_LOOKBACK_YEARS;
  const activistForms = new Set(["DFAN14A", "DEFC14A", "PREC14A", "PRRN14A"]);
  const candidates = filings
    .filter((filing) =>
      activistForms.has(filing.form) &&
      Number(filing.filingDate.slice(0, 4)) >= cutoffYear,
    )
    .slice(0, 15);

  const parsed = await Promise.all(candidates.map(async (filing) => {
    try {
      const response = await fetchSec(documentUrl(cik, filing));
      if (!response.ok) return null;
      const html = await response.text();
      const $ = cheerio.load(html);
      const rawText = $("body").text();
      const flatText = normalizeSpace(rawText);
      const status = activistStatus(filing.filingDate, flatText);
      const coverName = activistNameFromDocument(rawText);
      return {
        activistName: coverName === "Non-management solicitor"
          ? activistNameFromContext(flatText) ?? coverName
          : coverName,
        status,
        filingDate: filing.filingDate,
        form: filing.form,
        objective: objectiveFromDocument(flatText),
        statusDetail: statusDetail(status, filing.filingDate),
        sourceUrl: documentUrl(cik, filing),
      };
    } catch {
      return null;
    }
  }));

  const campaigns: BoardLeadershipData["activistCampaigns"] = [];
  for (const campaign of parsed) {
    if (!campaign) continue;
    const year = campaign.filingDate.slice(0, 4);
    const existingIndex = campaigns.findIndex((existing) =>
      existing.filingDate.startsWith(year) &&
      (samePerson(existing.activistName, campaign.activistName) ||
        existing.activistName.toLowerCase() === campaign.activistName.toLowerCase()),
    );
    if (existingIndex < 0) {
      campaigns.push(campaign);
    } else if (campaign.filingDate > campaigns[existingIndex].filingDate) {
      campaigns[existingIndex] = campaign;
    }
  }

  return {
    campaigns: campaigns.sort((a, b) => b.filingDate.localeCompare(a.filingDate)).slice(0, 6),
    reviewed: candidates.length,
  };
}

function leadershipRank(title: string): number {
  if (/\b(CEO|Chief Executive)\b/i.test(title)) return 0;
  if (/\b(President)\b/i.test(title)) return 1;
  if (/\b(CFO|Chief Financial)\b/i.test(title)) return 2;
  if (/\b(COO|Chief Operating)\b/i.test(title)) return 3;
  return 4;
}

function emptyCompensation(fiscalYear: number | null, total: number | null): Compensation {
  return {
    fiscalYear,
    salary: null,
    stockAwards: null,
    optionAwards: null,
    nonEquityIncentive: null,
    otherCompensation: null,
    total,
  };
}

export async function getBoardLeadership(
  symbol: string,
  cik: string | null,
): Promise<BoardLeadershipData> {
  const cacheKey = `${symbol}:${cik ?? "none"}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) responseCache.delete(cacheKey);

  const [quoteSummary, submissionsData] = await Promise.all([
    yahooFinance.quoteSummary(symbol, {
      modules: ["assetProfile", "price", "insiderHolders"],
    }),
    cik
      ? fetchSec(`https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`)
          .then(async (response) => response.ok ? await response.json() as SecSubmissions : null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const price = quoteSummary.price;
  if (!price) {
    throw new Error(`Symbol ${symbol} not found`);
  }

  const filings = submissionsData ? submissionFilings(submissionsData) : [];
  const proxyFiling = filings.find((filing) => filing.form === "DEF 14A") ?? null;
  let proxyHtml: string | null = null;
  if (cik && proxyFiling) {
    try {
      const response = await fetchSec(documentUrl(cik, proxyFiling));
      proxyHtml = response.ok ? await response.text() : null;
    } catch {
      proxyHtml = null;
    }
  }

  const proxy$ = proxyHtml ? cheerio.load(proxyHtml) : null;
  const proxyText = proxy$ ? normalizeSpace(proxy$("body").text()) : "";
  const proxyOwnership = proxy$
    ? parseOwnershipTable(proxy$).map((entry) => ({
        ...entry,
        date: proxyFiling?.filingDate ?? null,
      }))
    : [];
  const yahooOwnership: OwnershipRecord[] = (quoteSummary.insiderHolders?.holders ?? []).flatMap((holder) => {
    const direct = typeof holder.positionDirect === "number" ? holder.positionDirect : 0;
    const indirect = typeof holder.positionIndirect === "number" ? holder.positionIndirect : 0;
    if (!holder.name || (direct === 0 && indirect === 0)) return [];
    const rawDate = holder.positionDirectDate ?? holder.positionIndirectDate;
    return [{
      name: holder.name,
      shares: direct + indirect,
      date: rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : null,
    }];
  });
  const proxyCompensation = proxy$ ? parseExecutiveCompensation(proxy$) : [];
  const leadershipNames = [
    ...(quoteSummary.assetProfile?.companyOfficers ?? []).map((officer) => officer.name),
    ...proxyCompensation.map((officer) => officer.name),
  ];
  const form4Ownership = cik && submissionsData
    ? await fetchRecentForm4Ownership(cik, submissionsData, leadershipNames)
    : [];
  const ownership = [...form4Ownership, ...proxyOwnership, ...yahooOwnership];

  const executivePattern =
    /\b(CEO|CFO|COO|Chief\b|General Counsel\b|Controller\b|Company Secretary\b|Corporate Secretary\b)/i;
  const executives: BoardLeadershipData["executives"] = [];
  for (const officer of quoteSummary.assetProfile?.companyOfficers ?? []) {
    const isCompanyPresident = /^(?:Executive\s+)?President\b|(?:^|,\s*)President\b/i.test(officer.title);
    if (
      !executivePattern.test(officer.title) &&
      !isCompanyPresident &&
      !/\b(co-?founder|founder)\b/i.test(officer.title)
    ) {
      continue;
    }
    const name = cleanPersonName(officer.name);
    const proxyPay = proxyCompensation.find((entry) => samePerson(entry.name, name));
    const ownershipRecord = findOwnership(ownership, name);
    executives.push({
      name,
      title: officer.title,
      age: officer.age ?? null,
      yearBorn: officer.yearBorn ?? null,
      isFounder: /\b(co-?founder|founder)\b/i.test(officer.title),
      sharesOwned: ownershipRecord?.shares ?? null,
      ownershipDate: ownershipRecord?.date ?? proxyFiling?.filingDate ?? null,
      compensation: proxyPay?.compensation ??
        emptyCompensation(officer.fiscalYear ?? null, officer.totalPay ?? null),
    });
  }

  for (const proxyOfficer of proxyCompensation) {
    if (executives.some((officer) => samePerson(officer.name, proxyOfficer.name))) continue;
    const ownershipRecord = findOwnership(ownership, proxyOfficer.name);
    executives.push({
      name: proxyOfficer.name,
      title: proxyOfficer.title,
      age: null,
      yearBorn: null,
      isFounder: /\b(co-?founder|founder)\b/i.test(proxyOfficer.title),
      sharesOwned: ownershipRecord?.shares ?? null,
      ownershipDate: ownershipRecord?.date ?? proxyFiling?.filingDate ?? null,
      compensation: proxyOfficer.compensation,
    });
  }
  executives.sort((a, b) =>
    leadershipRank(a.title) - leadershipRank(b.title) || a.name.localeCompare(b.name),
  );

  const electionYear = proxyFiling ? Number(proxyFiling.filingDate.slice(0, 4)) : new Date().getUTCFullYear();
  const boardMembers = proxy$ && Number.isFinite(electionYear)
    ? parseBoardMembers(
        proxy$,
        ownership,
        proxyText,
        electionYear,
        executives.map((executive) => executive.name),
      )
    : [];
  const activist = cik
    ? await parseActivistCampaigns(cik, filings)
    : { campaigns: [], reviewed: 0 };

  const hasCurrentCampaign = activist.campaigns.some((campaign) =>
    campaign.status === "active" || campaign.status === "recent",
  );
  const activistSummary = activist.campaigns.length === 0
    ? `No non-management proxy solicitation filings were found in the SEC company feed for the last ${ACTIVIST_LOOKBACK_YEARS} years. This does not rule out private engagement or an unfiled campaign.`
    : hasCurrentCampaign
      ? "Recent SEC non-management proxy filings indicate an active or recently active campaign. Review the filing links for the latest position."
      : "Historical non-management proxy activity was found, but no recent campaign filing appears in the reviewed SEC company feed.";

  const dataAsOf = proxyFiling?.filingDate ??
    quoteSummary.assetProfile?.compensationAsOfEpochDate?.toISOString().slice(0, 10) ??
    new Date().toISOString().slice(0, 10);
  const value: BoardLeadershipData = {
    symbol,
    companyName: price.longName ?? price.shortName ?? symbol,
    dataAsOf,
    executives,
    boardMembers,
    activistCampaigns: activist.campaigns,
    activistSummary,
    sources: [
      {
        label: "Yahoo Finance company leadership",
        filingDate: quoteSummary.assetProfile?.compensationAsOfEpochDate?.toISOString().slice(0, 10) ?? null,
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/profile/`,
      },
      {
        label: "Latest SEC definitive proxy statement",
        filingDate: proxyFiling?.filingDate ?? null,
        url: cik && proxyFiling ? documentUrl(cik, proxyFiling) : null,
      },
      {
        label: "SEC company filing history",
        filingDate: null,
        url: cik ? `https://www.sec.gov/edgar/browse/?CIK=${cik}` : null,
      },
    ],
    coverage: {
      proxyAvailable: proxy$ != null,
      executiveCompensationAvailable:
        proxyCompensation.length > 0 ||
        executives.some((executive) => executive.compensation.total != null),
      boardRosterAvailable: boardMembers.length > 0,
      activistFilingsReviewed: activist.reviewed,
      note: proxy$
        ? "Compensation, board tenure, and election details use the latest proxy statement. Ownership uses a newer matched SEC Form 4 direct balance when available, otherwise proxy beneficial ownership. Current titles are supplemented by Yahoo Finance."
        : "SEC proxy details were unavailable, so leadership coverage is limited to current Yahoo Finance records.",
    },
  };

  const cacheTtl = proxyFiling && proxy$ == null ? INCOMPLETE_CACHE_TTL_MS : CACHE_TTL_MS;
  responseCache.set(cacheKey, { expiresAt: Date.now() + cacheTtl, value });
  return value;
}