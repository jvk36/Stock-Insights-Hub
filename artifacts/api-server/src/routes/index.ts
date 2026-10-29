import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stockRouter from "./stock";
import macroRouter from "./macro";
import indexesRouter from "./indexes";
import thirteenFRouter from "./thirteen-f";
import membershipRouter from "./membership";
import { requirePremium } from "../lib/membership-auth";
import { createStockAccess } from "../lib/stock-access";
import { createIndexAccess } from "../lib/index-access";
import watchlistRouter from "./watchlist";
import modelPortfoliosRouter from "./model-portfolios";

const router: IRouter = Router();

router.use(healthRouter);
router.use(membershipRouter);
router.use(macroRouter);
router.use(thirteenFRouter);
router.use("/stock/:symbol/:section", createStockAccess(requirePremium));
router.use(stockRouter);
// Watchlist routes enforce sign-in and ownership themselves, for all tiers.
router.use(watchlistRouter);
const indexAccess = createIndexAccess(requirePremium);
router.use((req, res, next) => {
  if (req.path === "/indexes" || req.path.startsWith("/indexes/")) return indexAccess(req, res, next);
  return next();
});
router.use(indexesRouter);
router.use(requirePremium);
router.use(modelPortfoliosRouter);

export default router;
