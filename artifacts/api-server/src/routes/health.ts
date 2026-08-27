import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getMetrics, isMetricsAuthorized } from "../lib/metrics";

const router: IRouter = Router();

// Public, unauthenticated liveness endpoint for platforms that only need to
// verify that the process is responding.
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/metrics", (req, res) => {
  if (!isMetricsAuthorized(req.header("authorization")?.replace(/^Bearer\s+/i, ""))) {
    res.status(404).end();
    return;
  }
  res.json(getMetrics());
});

router.get("/readyz", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ready", checks: { database: "ok", config: "ok" } });
  } catch {
    res.status(503).json({ status: "not_ready", checks: { database: "failed" } });
  }
});

export default router;
