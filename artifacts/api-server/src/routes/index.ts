import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stockRouter from "./stock";
import macroRouter from "./macro";
import indexesRouter from "./indexes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stockRouter);
router.use(macroRouter);
router.use(indexesRouter);

export default router;
