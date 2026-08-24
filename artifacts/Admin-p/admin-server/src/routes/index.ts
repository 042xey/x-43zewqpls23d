import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tokensRouter from "./tokens";
import codesRouter from "./codes";
import proxiesRouter from "./proxies";
import aliasesRouter from "./aliases";
import templateRouter from "./template";
import deployRouter from "./deploy";
import tunnelRouter from "./tunnel";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import sessionsRouter from "./sessions";
import externalAppsRouter from "./externalApps";

const router: IRouter = Router();

const prefix = process.env["ADMIN_ROUTE_PREFIX"];
if (!prefix) {
  throw new Error("ADMIN_ROUTE_PREFIX env var is not set — admin routes cannot be mounted.");
}

const adminRouter: IRouter = Router();
adminRouter.use(authRouter);
adminRouter.use(dashboardRouter);
adminRouter.use(sessionsRouter);
adminRouter.use(externalAppsRouter);
adminRouter.use(tokensRouter);
adminRouter.use(codesRouter);
adminRouter.use(proxiesRouter);
adminRouter.use(aliasesRouter);
adminRouter.use(templateRouter);
adminRouter.use(deployRouter);
adminRouter.use(tunnelRouter);

router.use(healthRouter);
router.use(`/${prefix}`, adminRouter);

export default router;
