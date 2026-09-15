import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stockRouter from "./stock";
import macroRouter from "./macro";
import indexesRouter from "./indexes";
import thirteenFRouter from "./thirteen-f";
import membershipRouter from "./membership";
import { requirePremium } from "../lib/membership-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(membershipRouter);
router.use(macroRouter);
router.use(thirteenFRouter);
router.use(requirePremium);
router.use(stockRouter);
router.use(indexesRouter);

export default router;
