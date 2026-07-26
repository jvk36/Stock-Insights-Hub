import { Router, type Request, type Response } from "express";
import { eq, desc, exists, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  hedgeFundsTable,
  sec13fFilingsTable,
  sec13fHoldingsTable,
} from "@workspace/db";

const router = Router();

// ─── GET /13f/funds ───────────────────────────────────────────────────────────

router.get("/13f/funds", async (req: Request, res: Response) => {
  try {
    const funds = await db
      .select({ cik: hedgeFundsTable.cik, name: hedgeFundsTable.name, slug: hedgeFundsTable.slug })
      .from(hedgeFundsTable)
      .orderBy(hedgeFundsTable.name);
    return res.json({ funds });
  } catch (err) {
    req.log.error({ err }, "Failed to list 13F funds");
    return res.status(500).json({ error: "Failed to list funds", message: String(err) });
  }
});

// ─── GET /13f/funds/:cik/quarters ────────────────────────────────────────────

router.get("/13f/funds/:cik/quarters", async (req: Request, res: Response) => {
  const cik = req.params["cik"] as string;
  try {
    // Only return quarters that have at least one holding already loaded.
    // Stub filings are inserted before holdings are fetched, so filtering here
    // prevents the race condition where an empty prior quarter shows all
    // current-quarter positions as "new" during initial seeding.
    const filings = await db
      .select({
        periodLabel: sec13fFilingsTable.periodLabel,
        reportDate: sec13fFilingsTable.reportDate,
      })
      .from(sec13fFilingsTable)
      .where(
        sql`${sec13fFilingsTable.fundCik} = ${cik} AND EXISTS (
          SELECT 1 FROM sec_13f_holdings h WHERE h.filing_id = ${sec13fFilingsTable.id}
        )`
      )
      .orderBy(desc(sec13fFilingsTable.reportDate));

    return res.json({
      cik,
      quarters: filings.map((f) => f.periodLabel),
    });
  } catch (err) {
    req.log.error({ err, cik }, "Failed to list 13F quarters");
    return res.status(500).json({ error: "Failed to list quarters", message: String(err) });
  }
});

// ─── GET /13f/funds/:cik/holdings ────────────────────────────────────────────
// Query params: currentQ (e.g. "Q1 2026"), priorQ (e.g. "Q4 2025")
// Defaults to the two most recent available quarters.

router.get("/13f/funds/:cik/holdings", async (req: Request, res: Response) => {
  const cik = req.params["cik"] as string;
  let { currentQ, priorQ } = req.query as { currentQ?: string; priorQ?: string };

  try {
    // Get fund info
    const [fund] = await db
      .select()
      .from(hedgeFundsTable)
      .where(eq(hedgeFundsTable.cik, cik))
      .limit(1);

    if (!fund) {
      return res.status(404).json({ error: "Fund not found", message: `No fund with CIK ${cik}` });
    }

    // Get all filings that have holdings (skip empty stubs still being seeded)
    const allFilings = await db
      .select()
      .from(sec13fFilingsTable)
      .where(
        sql`${sec13fFilingsTable.fundCik} = ${cik} AND EXISTS (
          SELECT 1 FROM sec_13f_holdings h WHERE h.filing_id = ${sec13fFilingsTable.id}
        )`
      )
      .orderBy(desc(sec13fFilingsTable.reportDate));

    // If no filings yet, return seeding-in-progress response
    if (allFilings.length === 0) {
      return res.json({
        fundName: fund.name,
        cik,
        currentQ: currentQ ?? null,
        priorQ: priorQ ?? null,
        currentTotalValue: 0,
        priorTotalValue: null,
        seedingInProgress: true,
        holdings: [],
      });
    }

    // Resolve which quarters to compare
    if (!currentQ) {
      currentQ = allFilings[0]!.periodLabel;
    }
    if (!priorQ) {
      const currentIdx = allFilings.findIndex((f) => f.periodLabel === currentQ);
      priorQ = currentIdx >= 0 && currentIdx + 1 < allFilings.length
        ? allFilings[currentIdx + 1]!.periodLabel
        : undefined;
    }

    // Look up filing records
    const currentFiling = allFilings.find((f) => f.periodLabel === currentQ);
    const priorFiling   = priorQ ? allFilings.find((f) => f.periodLabel === priorQ) : undefined;

    if (!currentFiling) {
      return res.status(404).json({
        error: "Quarter not found",
        message: `No filing for quarter "${currentQ}"`,
      });
    }

    // Fetch holdings for both quarters
    const currentHoldings = await db
      .select()
      .from(sec13fHoldingsTable)
      .where(eq(sec13fHoldingsTable.filingId, currentFiling.id));

    const priorHoldingsRaw = priorFiling
      ? await db
          .select()
          .from(sec13fHoldingsTable)
          .where(eq(sec13fHoldingsTable.filingId, priorFiling.id))
      : [];

    // Build lookup maps keyed by CUSIP (stable across quarters, unlike name strings)
    const currentByCusip = new Map(currentHoldings.map((h) => [h.cusip, h]));
    const priorByCusip   = new Map(priorHoldingsRaw.map((h) => [h.cusip, h]));

    // Name normaliser — strips legal suffixes and share-class markers so that
    // e.g. "ALPHABET INC" (CL A) and "ALPHABET INC" (CL C) map to "ALPHABET"
    function normalizeName(name: string): string {
      return name
        .toUpperCase()
        .replace(/\b(CORPORATION|INCORPORATED)\b/g, "")
        .replace(/\b(INC|CORP|LTD|CO|PLC|LLC|LP|NV|AG|SA|SCA)\b\.?/g, "")
        .replace(/\b(CLASS|CL)\s+[A-C]\b/g, "")
        .replace(/\b(NEW|OLD|HOLDINGS|HLDGS|GROUP|SWITZ|DEL)\b/g, "")
        .replace(/[^A-Z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Build normalised-name maps for holdings that have no CUSIP match in the other quarter
    const priorUnmatched   = priorHoldingsRaw.filter((h) => !currentByCusip.has(h.cusip));
    const currentUnmatched = currentHoldings.filter((h) => !priorByCusip.has(h.cusip));
    const priorByNormName   = new Map(priorUnmatched.map((h) => [normalizeName(h.name), h]));
    const currentByNormName = new Map(currentUnmatched.map((h) => [normalizeName(h.name), h]));

    // Known CUSIP succession chains from corporate reorganisations / rebrands.
    // Each entry maps an OLD cusip → its direct SUCCESSOR cusip.
    // The chain is walked, so multi-hop transitions are resolved automatically.
    const CUSIP_SUCCESSOR: Record<string, string> = {
      "531229409": "531229722", // Liberty Media Corp Delaware → Liberty Media Corp Del (new series, Q2→Q3 2023)
      "531229722": "530909100", // Liberty Media Corp Del → Liberty Live Holdings (Q3→Q4 2025)
    };
    const CUSIP_PREDECESSOR: Record<string, string> = Object.fromEntries(
      Object.entries(CUSIP_SUCCESSOR).map(([old, succ]) => [succ, old]),
    );

    // Walk the successor chain from `cusip` until we find one that exists in `map`, or exhaust.
    function walkChain(
      cusip: string,
      map: Map<string, unknown>,
      direction: "successor" | "predecessor",
    ): string | null {
      const lookup = direction === "successor" ? CUSIP_SUCCESSOR : CUSIP_PREDECESSOR;
      let cur = cusip;
      for (let i = 0; i < 10; i++) {
        const next = lookup[cur];
        if (!next) break;
        if (map.has(next)) return next;
        cur = next;
      }
      return null;
    }

    // CUSIPs consumed via fallback matching (skip in main loop to avoid duplicates)
    const priorConsumed   = new Set<string>();
    const currentConsumed = new Set<string>();

    // Pairs resolved by any fallback: [currentCusip, priorCusip]
    const namePairs: Array<[string | null, string | null]> = [];

    // Pass 1 — CUSIP succession chain (explicit corporate-action knowledge, highest priority)
    // Catches rebrands like Liberty Media Corp Del → Liberty Live Holdings
    for (const curr of currentUnmatched) {
      if (currentConsumed.has(curr.cusip)) continue;
      const predCusip = walkChain(curr.cusip, priorByCusip, "predecessor");
      if (predCusip && !priorConsumed.has(predCusip)) {
        namePairs.push([curr.cusip, predCusip]);
        priorConsumed.add(predCusip);
        currentConsumed.add(curr.cusip);
      }
    }
    for (const prior of priorUnmatched) {
      if (priorConsumed.has(prior.cusip)) continue;
      const succCusip = walkChain(prior.cusip, currentByCusip, "successor");
      if (succCusip && !currentConsumed.has(succCusip)) {
        namePairs.push([succCusip, prior.cusip]);
        priorConsumed.add(prior.cusip);
        currentConsumed.add(succCusip);
      }
    }

    // Pass 2 — name normalisation (catches share-class switches like Alphabet CL A → CL C)
    for (const curr of currentUnmatched) {
      if (currentConsumed.has(curr.cusip)) continue;
      const normKey = normalizeName(curr.name);
      const matched = priorByNormName.get(normKey);
      if (matched && !priorConsumed.has(matched.cusip)) {
        namePairs.push([curr.cusip, matched.cusip]);
        priorConsumed.add(matched.cusip);
        currentConsumed.add(curr.cusip);
      }
    }

    // Full outer join: union of CUSIPs from both quarters, minus those handled via fallback pairs
    const allCusips = new Set([...currentByCusip.keys(), ...priorByCusip.keys()]);
    for (const [cc, pc] of namePairs) {
      if (cc) allCusips.delete(cc);
      if (pc) allCusips.delete(pc);
    }

    // Total values — stored as actual dollars from the XML <value> field
    const currentTotalValue = currentFiling.totalValueThousands ?? 0;
    const priorTotalValue = priorFiling
      ? (priorFiling.totalValueThousands ?? 0)
      : null;

    // Helper to build one row from a (current, prior) holding pair
    function buildRow(curr: typeof currentHoldings[0] | null, prior: typeof priorHoldingsRaw[0] | null) {
      const name   = curr?.name   ?? prior?.name   ?? "";
      const ticker = curr?.ticker ?? prior?.ticker ?? null;
      const cusip  = curr?.cusip  ?? prior?.cusip  ?? "";

      const currentMv     = curr ? curr.marketValueThousands : null;
      const currentShares = curr ? curr.shares : null;
      const currentPct    = curr && currentTotalValue > 0
        ? (curr.marketValueThousands / currentTotalValue) * 100 : null;

      const priorMv     = prior ? prior.marketValueThousands : null;
      const priorShares = prior ? prior.shares : null;
      const priorPct    = prior && priorTotalValue
        ? (prior.marketValueThousands / priorTotalValue) * 100 : null;

      let pctChangeShares: number | null = null;
      let colorClass = "";

      if (!curr) {
        colorClass = "decrease";
        pctChangeShares = -100;
      } else if (!prior) {
        colorClass = "new";
      } else if (priorShares === 0) {
        colorClass = "increase";
        pctChangeShares = 100;
      } else if (priorShares !== null) {
        pctChangeShares = (((currentShares ?? 0) - priorShares) / priorShares) * 100;
        if (pctChangeShares > 0) colorClass = "increase";
        else if (pctChangeShares < 0) colorClass = "decrease";
        else colorClass = "";
      }

      return {
        name, ticker, cusip,
        currentMarketValue: currentMv,
        currentShares,
        currentPctAllocation: currentPct,
        priorMarketValue: priorMv,
        priorShares,
        priorPctAllocation: priorPct,
        pctChangeShares,
        colorClass,
      };
    }

    // Build comparison rows — CUSIP-matched positions
    const rows = [...allCusips].map((cusip) => {
      const curr  = currentByCusip.get(cusip) ?? null;
      const prior = priorByCusip.get(cusip)   ?? null;
      return buildRow(curr, prior);
    });

    // Add name-fallback pairs (e.g. Alphabet Class A → Class C share-class switches)
    for (const [currentCusip, priorCusip] of namePairs) {
      const curr  = currentCusip ? (currentByCusip.get(currentCusip) ?? null) : null;
      const prior = priorCusip  ? (priorByCusip.get(priorCusip)     ?? null) : null;
      rows.push(buildRow(curr, prior));
    }

    // Sort: active positions by current market value desc; exited positions at bottom by prior value desc
    rows.sort((a, b) => {
      if (a.currentMarketValue !== null && b.currentMarketValue !== null)
        return b.currentMarketValue - a.currentMarketValue;
      if (a.currentMarketValue !== null) return -1;
      if (b.currentMarketValue !== null) return 1;
      return (b.priorMarketValue ?? 0) - (a.priorMarketValue ?? 0);
    });

    return res.json({
      fundName: fund.name,
      cik,
      currentQ,
      priorQ: priorQ ?? null,
      currentTotalValue,
      priorTotalValue,
      seedingInProgress: false,
      holdings: rows,
    });
  } catch (err) {
    req.log.error({ err, cik }, "Failed to get 13F holdings");
    return res.status(500).json({ error: "Failed to get holdings", message: String(err) });
  }
});

export default router;
