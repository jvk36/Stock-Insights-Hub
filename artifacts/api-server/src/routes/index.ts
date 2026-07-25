import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stockRouter from "./stock";
import macroRouter from "./macro";
import indexesRouter from "./indexes";
import thirteenFRouter from "./thirteen-f";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stockRouter);
router.use(macroRouter);
router.use(indexesRouter);
router.use(thirteenFRouter);

export default router;
