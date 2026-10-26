import { Router, type IRouter } from "express";
import { getModelPortfolio } from "../lib/model-portfolio-service";
import { getMomentumPortfolio } from "../lib/momentum-service";
import { GetMomentumPortfolioResponse } from "@workspace/api-zod";

const router: IRouter = Router();
// Mounted after requirePremium in the shared router.
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
