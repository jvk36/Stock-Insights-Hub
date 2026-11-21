import assert from "node:assert/strict";
import test from "node:test";
import {
  FIGI_AMBIGUOUS, FIGI_MATCHED, FIGI_UNMATCHED,
  parseFigiResolution, project13fHoldings, resolved13fTicker, isTerminalUnmatched, usTicker, type TickerMapping,
} from "./cusip-resolution-policy";
import { createOpenFigiMapper } from "./openfigi-resolver";

const equity = (ticker: string, extra = {}) => ({ ticker, exchCode: "US", marketSector: "Equity", securityType: "ETP", ...extra });
const p = (cusip: string, ticker: string | null, value = 100) =>
  ({ cusip, ticker, name: `Issuer ${cusip}`, marketValueThousands: value, shares: 10 });
const m = (cusip: string, source: string, ticker: string | null = null): TickerMapping => ({ cusip, source, ticker });
const json = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });

test("the four Ariel CUSIPs resolve to IWN, VT, VEA and XCEM despite cached foreign guesses", () => {
  const wrong = ["IWN.SN", "VT03.BK", "VEA.BA", null];
  const rows = ["464287630", "922042742", "921943858", "19762B202"].map((c, i) => p(c, wrong[i]!));
  const mappings = new Map(rows.map(r => [r.cusip, m(r.cusip, "yahoo_search", r.ticker)]));
  const projected = project13fHoldings(rows, mappings);
  assert.deepEqual(projected.map(r => r.ticker), ["IWN", "VT", "VEA", "XCEM"]);
  assert.equal(projected.some(r => r.cusip === "__MISC__"), false);
  assert.deepEqual(rows.map(r => r.ticker), wrong);
});
test("US share classes are preserved, but foreign suffixes are not blindly stripped", () => {
  assert.equal(usTicker("BRK.B"), "BRK-B");
  assert.equal(usTicker("BF/A"), "BF-A");
  assert.equal(usTicker("LEN/B", true), "LEN-B");
  for (const symbol of ["IWN.SN", "VEA.BA", "VT03.BK", "ABC.L", "ABC/WS", "NOT_FOUND"]) assert.equal(usTicker(symbol), null);
});
test("exact matching accepts ETF records including securityType2 Mutual Fund", () => {
  assert.deepEqual(parseFigiResolution({ data: [equity("XCEM", { securityType2: "Mutual Fund" })] }), { status: "matched", ticker: "XCEM" });
  assert.deepEqual(parseFigiResolution({ data: [equity("BRK/B", { securityType: "Common Stock" })] }), { status: "matched", ticker: "BRK-B" });
});
test("duplicate venues for the same US ticker are not ambiguous", () => {
  assert.equal(parseFigiResolution({ data: [equity("IWN"), equity("IWN")] }).ticker, "IWN");
});
test("multiple distinct US symbols cannot be arbitrarily selected", () => {
  assert.equal(parseFigiResolution({ data: [equity("ONE"), equity("TWO")] }).status, "ambiguous");
});
test("a foreign listing or unsupported security cannot win a US exact mapping", () => {
  for (const data of [[equity("IWN.SN", { exchCode: "CI" })], [equity("BOND", { marketSector: "Corp" })], [equity("ABC", { securityType: "Warrant" })]]) {
    assert.equal(parseFigiResolution({ data }).status, "ambiguous");
  }
});
test("explicit no-match differs from errors, empty and malformed responses", () => {
  assert.equal(parseFigiResolution({ warning: "No identifier found." }).status, "unmatched");
  assert.equal(parseFigiResolution({ error: "No identifier found." }).status, "unmatched");
  for (const data of [null, {}, { error: "Internal server error" }, { data: [] }, { data: "bad" }]) {
    assert.equal(parseFigiResolution(data).status, "temporary");
  }
});
test("Miscellaneous includes only exact terminal no-matches and existing retained tails", () => {
  const rows = [p("000000001", "GOOD", 250), p("000000002", null, 75),
    p("000000003", "WRONG.SN", 25), p("000000004", null, 30), p("__MISC__", null, 120)];
  const maps = new Map([
    ["000000002", m("000000002", FIGI_UNMATCHED)],
    ["000000003", m("000000003", FIGI_AMBIGUOUS)],
    ["000000004", m("000000004", "not_found")],
  ]);
  const before = structuredClone(rows);
  const output = project13fHoldings(rows, maps);
  assert.deepEqual(output.filter(r => r.cusip !== "__MISC__").map(r => r.cusip), ["000000001", "000000004"]);
  const misc = output.at(-1)!;
  assert.equal(misc.cusip, "__MISC__");
  assert.equal(misc.marketValueThousands, 220);
  assert.equal(misc.shares, 0);
  assert.equal(misc.ticker, null);
  assert.equal(output.reduce((s, r) => s + r.marketValueThousands, 0), rows.reduce((s, r) => s + r.marketValueThousands, 0));
  assert.deepEqual(rows, before, "original CUSIPs and accounting records must never be mutated");
  maps.set("000000002", m("000000002", FIGI_MATCHED, "FOUND"));
  assert.equal(project13fHoldings(rows, maps).find(r => r.cusip === "000000002")?.ticker, "FOUND", "consolidation must be reversible");
});
test("pending, old failed and missing mappings never become Miscellaneous", () => {
  const rows = [p("000000001", null), p("000000002", "ABC.L"), p("000000003", null)];
  const maps = new Map([["000000003", m("000000003", "not_found")]]);
  const result = project13fHoldings(rows, maps);
  assert.equal(result.length, 3);
  assert.equal(result.some(r => r.cusip === "__MISC__"), false);
  assert.equal(result[1]!.ticker, null);
});
test("old negative CUSIP results must be retried, not keep CINS positions in Miscellaneous", () => {
  const mapping = m("N3167Y103", "openfigi_no_match_v1");
  assert.equal(isTerminalUnmatched(mapping), false);
  const rows = [p(mapping.cusip, null, 125)];
  assert.equal(project13fHoldings(rows, new Map([[mapping.cusip, mapping]]))[0]?.cusip, mapping.cusip);
});
test("strategy identities use exact mappings without removing raw unmatched shares or values", () => {
  const raw = [p("L8681T102", null, 150), p("000000001", "WRONG", 80)];
  const before = structuredClone(raw);
  const mappings = new Map([
    ["L8681T102", m("L8681T102", FIGI_MATCHED, "SPOT")],
    ["000000001", m("000000001", FIGI_UNMATCHED)],
  ]);
  const strategy = raw.map(row => ({ ...row, ticker: resolved13fTicker(row.cusip, row.ticker, mappings) }));
  assert.deepEqual(strategy.map(row => row.ticker), ["SPOT", null]);
  assert.equal(strategy[1]?.cusip, "000000001", "do not hide an unknown manager winner by grouping it");
  assert.equal(strategy.reduce((sum, row) => sum + row.marketValueThousands, 0), 230);
  assert.deepEqual(raw, before);
});
test("curated historical listings remain valid even when dotted", () => {
  const maps = new Map([["000000001", m("000000001", "manual", "SAMPLE.TO")]]);
  assert.equal(project13fHoldings([p("000000001", "SAMPLE.TO")], maps)[0]!.ticker, "SAMPLE.TO");
});
test("an exact matched cache corrects even a wrong ticker without dots", () => {
  const maps = new Map([["000000001", m("000000001", FIGI_MATCHED, "CORRECT")]]);
  assert.equal(project13fHoldings([p("000000001", "WRONG")], maps)[0]!.ticker, "CORRECT");
});
test("all-unmatched and empty filings conserve values without manufacturing positions", () => {
  assert.deepEqual(project13fHoldings([], new Map()), []);
  const maps = new Map([["000000001", m("000000001", FIGI_UNMATCHED)]]);
  const result = project13fHoldings([p("000000001", null, 125)], maps);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.marketValueThousands, 125);
  assert.equal(result[0]!.cusip, "__MISC__");
});
test("anonymous OpenFIGI batches contain at most ten exact US CUSIP jobs", async () => {
  const batches: Record<string, unknown>[][] = [];
  const waits: number[] = [];
  let clock = 0;
  const mapper = createOpenFigiMapper({
    now: () => clock, wait: async ms => { waits.push(ms); clock += ms; },
    fetcher: async (_url, options) => {
      const jobs = JSON.parse(options!.body as string); batches.push(jobs);
      return json(jobs.map(() => ({ data: [equity("FOUND")] })));
    },
  });
  const result = await mapper(Array.from({ length: 23 }, (_, i) => String(i).padStart(9, "0")));
  assert.deepEqual(batches.map(b => b.length), [10, 10, 3]);
  assert.equal(result.size, 23);
  assert.deepEqual(waits, [3100, 3100]);
  assert.deepEqual(batches[0]![0], { idType: "ID_CUSIP", idValue: "000000000", exchCode: "US", marketSecDes: "Equity", includeUnlistedEquities: true });
});
test("letter-prefixed CINS use their exact identifier type, including the six missed WhaleShadow issuers", async () => {
  const identifiers = ["N3167Y103", "L8681T102", "G3265R107", "G0180Y100", "L31839134", "G42089113", "464287630"];
  const tickers = ["RACE", "SPOT", "APTV", "AIIR", "ERFSF", "DGEAF", "IWN"];
  const mapper = createOpenFigiMapper({ fetcher: async (_url, options) => {
    const jobs = JSON.parse(options!.body as string);
    assert.deepEqual(jobs.map((job: { idType: string }) => job.idType), [...Array(6).fill("ID_CINS"), "ID_CUSIP"]);
    assert.deepEqual(jobs.map((job: { idValue: string }) => job.idValue), identifiers);
    assert.ok(jobs.every((job: { exchCode: string }) => job.exchCode === "US"), "never substitute an arbitrary foreign listing");
    return json(tickers.map(ticker => ({ data: [equity(ticker, { securityType: "Common Stock" })] })));
  } });
  const result = await mapper(identifiers);
  assert.deepEqual([...result.values()].map(r => r.ticker), tickers);
});
test("obsolete unlisted aliases are resolved through a unique listed-only exact match", async () => {
  const jobs: { includeUnlistedEquities: boolean }[] = [];
  let clock = 0;
  const mapper = createOpenFigiMapper({now: () => clock, wait: async ms => { clock += ms; }, fetcher: async (_url, options) => {
    const job = JSON.parse(options!.body as string)[0]; jobs.push(job);
    return json([{ data: job.includeUnlistedEquities ? [equity("RACE"), equity("RACE-W")] : [equity("RACE")] }]);
  }});
  assert.equal((await mapper(["N3167Y103"])).get("N3167Y103")?.ticker, "RACE");
  assert.deepEqual(jobs.map(job => job.includeUnlistedEquities), [true, false]);
  assert.equal(clock, 3100, "the refinement must obey the same global rate limit");
});
test("listed-only ambiguity or temporary failure cannot manufacture a verified ticker", async () => {
  for (const second of [{ data: [equity("ONE"), equity("TWO")] }, { error: "Unavailable" }]) {
    let calls = 0;
    const mapper = createOpenFigiMapper({intervalMs: 0, fetcher: async () =>
      json([++calls === 1 ? { data: [equity("ONE"), equity("TWO")] } : second]),
    });
    const result = (await mapper(["000000001"])).get("000000001");
    assert.equal(result?.ticker, null);
    assert.equal(result?.status, "error" in second ? "temporary" : "ambiguous");
  }
});
test("overlapping calls deduplicate CUSIPs while requests are pending", async () => {
  let calls = 0;
  const mapper = createOpenFigiMapper({ fetcher: async () => { calls++; return json([{ data: [equity("FOUND")] }]); } });
  const [a, b] = await Promise.all([mapper(["000000001", "000000001"]), mapper(["000000001"])]);
  assert.equal(calls, 1);
  assert.equal(a.get("000000001")?.ticker, "FOUND");
  assert.equal(b.get("000000001")?.ticker, "FOUND");
  await mapper(["000000001"]);
  assert.equal(calls, 1, "completed results must cover the brief gap before persistent cache writes");
});
test("429 obeys Retry-After globally and never produces an unmatched result", async () => {
  let calls = 0, clock = 0;
  const waits: number[] = [];
  const mapper = createOpenFigiMapper({
    now: () => clock, wait: async ms => { waits.push(ms); clock += ms; },
    fetcher: async () => ++calls === 1 ? json({}, 429, { "retry-after": "60" }) : json([{ data: [equity("FOUND")] }]),
  });
  assert.equal((await mapper(["000000001"])).get("000000001")?.status, "temporary");
  assert.equal((await mapper(["000000001"])).get("000000001")?.status, "temporary");
  assert.equal(calls, 1, "temporary failures must not immediately re-request the same CUSIP");
  assert.equal((await mapper(["000000002"])).get("000000002")?.ticker, "FOUND");
  assert.deepEqual(waits, [60000]);
});
test("timeouts, malformed batches and server errors never cause consolidation", async () => {
  for (const fetcher of [
    async () => { throw new Error("timeout"); },
    async () => json({}, 503),
    async () => json([]),
    async () => json([{ data: [equity("FOUND")] }, { warning: "No identifier found." }]),
  ]) {
    const mapper = createOpenFigiMapper({ fetcher });
    assert.equal((await mapper(["000000001"])).get("000000001")?.status, "temporary");
  }
});
