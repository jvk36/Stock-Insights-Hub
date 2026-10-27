import { Router, type IRouter } from "express";
import { getModelPortfolio } from "../lib/model-portfolio-service";
import { getMomentumPortfolio } from "../lib/momentum-service";
import { getLazyPortfolio } from "../lib/lazy-service";
import { GetMomentumPortfolioResponse, GetLazyPortfolioResponse, GetModelPortfolioBacktestParams, GetModelPortfolioBacktestResponse } from "@workspace/api-zod";
import { getPortfolioBacktest } from "../lib/portfolio-backtest-service";
import { getCloningPortfolio } from "../lib/cloning-service";

const router: IRouter = Router();
// Mounted after requirePremium in the shared router.
router.get("/model-portfolios/:strategy/backtest", async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const params = GetModelPortfolioBacktestParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Unknown model portfolio strategy." }); return; }
  try {
    res.json(GetModelPortfolioBacktestResponse.parse(await getPortfolioBacktest(params.data.strategy)));
  } catch (error) {
    req.log.error({ err: error }, "Unable to read historical model portfolio");
    res.status(503).json({ error: "Historical data is temporarily unavailable. Please retry." });
  }
});
router.get("/model-portfolios/cloning", async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  try { res.json(await getCloningPortfolio()); }
  catch (error) {
    req.log.error({ err: error }, "Unable to read Cloning portfolio");
    res.status(503).json({ error: "Cloning portfolio data is temporarily unavailable. Please retry." });
  }
});
router.get("/model-portfolios/lazy", async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  try {
    res.json(GetLazyPortfolioResponse.parse(await getLazyPortfolio()));
  } catch (error) {
    req.log.error({ err: error }, "Unable to read Lazy model portfolio");
    res.status(503).json({ error: "Lazy portfolio is temporarily unavailable. Please retry." });
  }
});
router.get("/model-portfolios/momentum", async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  try {
    res.json(GetMomentumPortfolioResponse.parse(await getMomentumPortfolio()));
  } catch (error) {
    req.log.error({ err: error }, "Unable to read Momentum model portfolio");
    res.status(503).json({ error: "Momentum portfolio is temporarily unavailable. Please retry." });
  }
});
router.get("/model-portfolios/blind-trust", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    res.json(await getModelPortfolio());
  } catch (error) {
    req.log.error({ err: error }, "Unable to read Blind Trust model portfolio");
    res.status(503).json({ error: "Model portfolio is temporarily unavailable. Please retry." });
  }
});
export default router;
