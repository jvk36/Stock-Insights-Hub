import { Router, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
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
    const filings = await db
      .select({
        periodLabel: sec13fFilingsTable.periodLabel,
        reportDate: sec13fFilingsTable.reportDate,
      })
      .from(sec13fFilingsTable)
      .where(eq(sec13fFilingsTable.fundCik, cik))
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

    // Get all available filings ordered newest first
    const allFilings = await db
      .select()
      .from(sec13fFilingsTable)
      .where(eq(sec13fFilingsTable.fundCik, cik))
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

    // Full outer join: union of CUSIPs from both quarters
    const allCusips = new Set([...currentByCusip.keys(), ...priorByCusip.keys()]);

    // Total values — stored as actual dollars from the XML <value> field
    const currentTotalValue = currentFiling.totalValueThousands ?? 0;
    const priorTotalValue = priorFiling
      ? (priorFiling.totalValueThousands ?? 0)
      : null;

    // Build comparison rows
    const rows = [...allCusips].map((cusip) => {
      const curr  = currentByCusip.get(cusip) ?? null;
      const prior = priorByCusip.get(cusip)   ?? null;

      // Prefer current quarter's name/ticker; fall back to prior quarter's
      const name   = curr?.name   ?? prior?.name   ?? cusip;
      const ticker = curr?.ticker ?? prior?.ticker ?? null;

      const currentMv     = curr ? curr.marketValueThousands : null;
      const currentShares = curr ? curr.shares : null;
      const currentPct    = curr && currentTotalValue > 0
        ? (curr.marketValueThousands / currentTotalValue) * 100
        : null;

      const priorMv     = prior ? prior.marketValueThousands : null;
      const priorShares = prior ? prior.shares : null;
      const priorPct    = prior && priorTotalValue
        ? (prior.marketValueThousands / priorTotalValue) * 100
        : null;

      let pctChangeShares: number | null = null;
      let colorClass = "";

      if (!curr) {
        // Exited position — was in prior quarter, gone in current
        colorClass = "decrease";
        pctChangeShares = -100;
      } else if (!prior) {
        // New position — not in prior quarter
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
        name,
        ticker,
        cusip,
        currentMarketValue: currentMv,
        currentShares,
        currentPctAllocation: currentPct,
        priorMarketValue: priorMv,
        priorShares,
        priorPctAllocation: priorPct,
        pctChangeShares,
        colorClass,
      };
    });

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
