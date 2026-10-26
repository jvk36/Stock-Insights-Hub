import { load } from "cheerio";
import { zipDocumentContainingFact } from "./buyback-history";
import { UNIVERSE } from "./model-portfolio-engine";

export type HistoricalBook = {
  ticker: string; date: string; filed: string; value: number | null; source: string;
};
type Fact = { end: string; val: number; filed: string; accn: string; form: string; start?: string };
type Facts = { facts: Record<string, Record<string, { units: Record<string, Fact[]> }>> };
type Rows = { form: string[]; filingDate: string[]; reportDate: string[]; accessionNumber: string[]; primaryDocument: string[] };
const HEADERS = { "User-Agent": "Stock Research Platform research@example.com" };
const CIKS: Record<string, string[]> = {
  "BRK.A": ["1067983"], MKL: ["1096343"], FRFHF: ["915191"],
  JEF: ["96223"], L: ["60086"], HHH: ["1498828", "1981792"], BOC: ["1494582"],
};
async function response(url: string) {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(45_000) });
  if (!r.ok) throw new Error(`Historical filing request returned ${r.status}: ${url}`);
  return r;
}
const root = (cik: string, accession: string) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}`;

// Read the balance-sheet instant, not weighted-average EPS denominators or
// cover-page counts from a different date. Class B Berkshire = 1/1500 of A.
export function parseHistoricalBook(xml: string, ticker: string, period: string): number | null {
  const $ = load(xml, { xml: true });
  const contexts = new Map<string, { date: string; members: string[] }>();
  $("*").each((_, e) => {
    if (!("name" in e) || e.name.split(":").at(-1)?.toLowerCase() !== "context") return;
    const node = $(e);
    const instant = node.find("*").filter((_, c) => "name" in c && c.name.split(":").at(-1)?.toLowerCase() === "instant").text();
    const members = node.find("*").filter((_, c) => "name" in c && c.name.split(":").at(-1)?.toLowerCase() === "explicitmember").map((_, c) => $(c).text()).get();
    contexts.set(node.attr("id") ?? "", { date: instant.trim(), members });
  });
  const values: { tag: string; value: number; members: string[] }[] = [];
  $("*").each((_, e) => {
    if (!("name" in e)) return;
    const n = $(e), context = contexts.get(n.attr("contextRef") ?? n.attr("contextref") ?? "");
    if (context?.date !== period) return;
    const tag = (n.attr("name") ?? e.name).split(":").at(-1)!;
    if (!/StockholdersEquity$|CommonStockSharesOutstanding$|CommonStockSharesIssued$|TreasuryStock(?:Common)?Shares$|^SharesIssued$|PreferredStockValue$|PreferredStockCarryingValue$|BookValuePerShare$/i.test(tag)) return;
    const raw = n.text().replace(/[\s,$]/g, "");
    if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) return;
    const value = Number(raw) * 10 ** Number(n.attr("scale") ?? 0) * (n.attr("sign") === "-" ? -1 : 1);
    if (Number.isFinite(value)) values.push({ tag, value, members: context.members });
  });
  const unqualified = (tag: string) => values.find((v) => v.tag === tag && !v.members.length)?.value;
  const equity = unqualified("StockholdersEquity");
  if (equity == null) return null;
  const preferred = unqualified("PreferredStockValue") ?? unqualified("PreferredStockCarryingValue") ?? 0;
  let shares = unqualified("CommonStockSharesOutstanding");
  if (shares == null) {
    const classes = values.filter((v) => /CommonStockSharesOutstanding|CommonStockSharesIssued/.test(v.tag) &&
      v.members.length === 1 && /Class[AB]Member|(?:Voting)?CommonStockMember/i.test(v.members[0]));
    // Dedupe repeated contexts for the same class.
    const byClass = new Map(classes.filter((v) => v.tag === "CommonStockSharesIssued").map((v) => [v.members[0], v.value]));
    for (const v of classes.filter((v) => v.tag === "CommonStockSharesOutstanding")) byClass.set(v.members[0], v.value);
    if (ticker === "BRK.A") {
      const a = [...byClass].find(([k]) => /(?:Common|Stock)ClassAMember/i.test(k))?.[1];
      const b = [...byClass].find(([k]) => /(?:Common|Stock)ClassBMember/i.test(k))?.[1];
      if (a != null && b != null) shares = a + b / 1500;
    } else if (byClass.size) {
      const hasOutstanding = classes.some((v) => v.tag === "CommonStockSharesOutstanding");
      const treasury = hasOutstanding && ticker !== "BOC" ? 0 :
        unqualified("TreasuryStockCommonShares") ?? unqualified("TreasuryStockShares") ?? 0;
      shares = [...byClass.values()].reduce((a, b) => a + b, 0) - treasury;
    }
  }
  shares ??= (() => {
    const issued = unqualified("CommonStockSharesIssued"), treasury = unqualified("TreasuryStockShares") ?? unqualified("TreasuryStockCommonShares");
    return issued != null && treasury != null ? issued - treasury : undefined;
  })();
  // Markel retires repurchased shares; its period-end common-stock equity
  // component reports the actual count under SharesIssued.
  if (ticker === "MKL" && shares == null) {
    shares = values.find((v) => v.tag === "SharesIssued" && v.members.length === 1 && /CommonStockMember$/.test(v.members[0]))?.value;
  }
  return shares != null && shares > 0 ? (equity - preferred) / shares : null;
}

async function companyBooks(ticker: string, cik: string): Promise<HistoricalBook[]> {
  const data = await (await response(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, "0")}.json`)).json() as Facts;
  const equity = data.facts["us-gaap"]?.StockholdersEquity?.units.USD ?? [];
  const rows: HistoricalBook[] = [];
  for (let year = 2016; year <= 2025; year++) {
    if (ticker === "HHH" && ((cik === "1498828" && year > 2023) || (cik === "1981792" && year <= 2023))) continue;
    const cutoff = `${year}-10-26`;
    const eligible = equity.filter((f) => !f.start && f.end < cutoff && f.end >= `${year - 1}-10-26` && f.filed < cutoff && /^(10-Q|10-K)$/.test(f.form));
    // Latest reporting period, earliest original filing of that period.
    eligible.sort((a, b) => b.end.localeCompare(a.end) || a.filed.localeCompare(b.filed));
    const f = eligible[0];
    if (!f) continue;
    const url = `${root(cik, f.accn)}/${f.accn}-xbrl.zip`;
    const archive = Buffer.from(await (await response(url)).arrayBuffer());
    const xml = zipDocumentContainingFact(archive, "StockholdersEquity");
    const value = xml ? parseHistoricalBook(xml, ticker, f.end) : null;
    rows.push({ ticker, date: f.end, filed: f.filed, value: value != null && Number.isFinite(value) ? value : null,
      source: `${root(cik, f.accn)}/${f.accn}-index.html` });
  }
  return rows;
}

export function parseFairfaxBook(text: string, year: number): number | null {
  const plain = load(text).text().replace(/\s+/g, " ");
  const m = plain.match(new RegExp(`Book value per basic share (?:at|as at) June 30,? ${year} (?:was|of)\\s*\\$?([\\d,]+\\.\\d+)`, "i"));
  return m ? Number(m[1].replaceAll(",", "")) : null;
}
async function fairfaxBooks(): Promise<HistoricalBook[]> {
  const cik = "915191";
  const sub = await (await response(`https://data.sec.gov/submissions/CIK0000915191.json`)).json() as { filings: { recent: Rows } };
  const r: Rows = sub.filings.recent;
  const books: HistoricalBook[] = [];
  for (let year = 2016; year <= 2025; year++) {
    const i = r.form.findIndex((f, i) => f === "6-K" && r.filingDate[i].startsWith(`${year}-`) && /q2/i.test(r.primaryDocument[i]));
    if (i < 0) continue;
    const base = root(cik, r.accessionNumber[i]);
    const primary = await (await response(`${base}/${r.primaryDocument[i]}`)).text();
    const $ = load(primary);
    const links = $("a[href]").map((_, e) => $(e).attr("href")!).get();
    let exhibit = links.find((s) => /pressrelease|pressrel|q2pr|q2news/i.test(s) && /\.htm/i.test(s));
    if (!exhibit) {
      const index = await (await response(`${base}/index.json`)).json() as { directory: { item: { name: string }[] } };
      exhibit = index.directory.item.find((f: { name: string }) => /pressrelease|pressrel|q2pr|q2news/i.test(f.name) && /\.htm/i.test(f.name))?.name;
    }
    if (!exhibit) continue;
    const source = new URL(exhibit, `${base}/`).href;
    const value = parseFairfaxBook(await (await response(source)).text(), year);
    if (value != null) books.push({ ticker: "FRFHF", date: `${year}-06-30`, filed: r.filingDate[i], value, source });
  }
  return books;
}

export async function fetchBlindTrustBooks(): Promise<{ books: HistoricalBook[]; issues: string[] }> {
  const books: HistoricalBook[] = [], issues: string[] = [];
  // Sequential by issuer, avoiding SEC bursts. A failure must be disclosed,
  // never silently converted into an exclusion from valuation rankings.
  for (const { ticker } of UNIVERSE.filter((b) => b.ticker !== "PSUS")) {
    try {
      const found = ticker === "FRFHF" ? await fairfaxBooks() :
        (await Promise.all(CIKS[ticker].map((cik) => companyBooks(ticker, cik)))).flat();
      books.push(...found);
      if (!found.length) issues.push(`${ticker}: no historical book values verified.`);
    } catch (error) {
      issues.push(`${ticker}: ${error instanceof Error ? error.message : "historical filing unavailable"}`);
    }
  }
  return { books, issues };
}
