import { Router, type IRouter } from "express";
import generateCodeRouter from "./generateCode";
import templateRouter from "./template";

const router: IRouter = Router();

router.use(generateCodeRouter);
router.use(templateRouter);

export default router;
