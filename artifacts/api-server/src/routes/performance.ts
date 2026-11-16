import { Router, type IRouter } from "express";
import { GetTickerPerformanceParams, GetTickerPerformanceResponse } from "@workspace/api-zod";
import { getTickerPerformance, PerformanceUnavailable } from "../lib/performance-service";
import { performanceSymbol } from "../lib/performance-history";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.get("/performance/:symbol", async (req, res): Promise<void> => {
  const parsed = GetTickerPerformanceParams.safeParse(req.params);
  const symbol = parsed.success ? performanceSymbol(parsed.data.symbol) : null;
  if (!symbol) {
    res.status(400).json({ error: "Enter a valid ticker symbol." });
    return;
  }
  try {
    res.json(GetTickerPerformanceResponse.parse(await getTickerPerformance(symbol)));
  } catch (error) {
    logger.warn({ err: error, symbol }, "Performance history request failed");
    const notFound = error instanceof PerformanceUnavailable || (error instanceof Error && /not found|no data|delisted/i.test(error.message));
    res.status(notFound ? 404 : 502).json({ error: notFound ? `No adjusted history is available for ${symbol}.` : "Historical prices are temporarily unavailable. Please retry shortly." });
  }
});
export default router;
