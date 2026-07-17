import { Router, type IRouter } from "express";
import healthRouter from "./health";
import generateCodeRouter from "./generateCode";
import templateRouter from "./template";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generateCodeRouter);
router.use(templateRouter);

export default router;
