import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stockRouter from "./stock";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stockRouter);

export default router;
