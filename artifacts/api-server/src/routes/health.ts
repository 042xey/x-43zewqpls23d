import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { decryptConfigValue, validateConfigEncryptionKey } from "@workspace/db/secure-config";
import { getDbMetrics, recordDbMetric } from "@workspace/db/metrics";
import { getMetrics, isMetricsAuthorized } from "../lib/metrics";
import { getBackgroundStatus } from "../lib/backgroundStatus";
import { getTunnelStatus } from "../lib/tunnelManager";

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
  res.json({ ...getMetrics(), ...getDbMetrics(pool) });
});

router.get("/readyz", async (_req, res) => {
  const checks: Record<string, string> = { database: "failed", encryption: "failed", external_service: "not_configured", tunnel: "not_configured" };
  try {
    await pool.query("select 1");
    checks.database = "ok";
    validateConfigEncryptionKey();
    checks.encryption = "ok";
    const rows = await db.select().from(appConfigTable);
    const config = new Map(rows.map((row) => [row.key, decryptConfigValue(row.value)]));
    const cloudflareKeys = ["cloudflare_api_key", "cloudflare_account_id", "cloudflare_api_server_url", "cloudflare_frontend_url"];
    if (cloudflareKeys.some((key) => !!config.get(key))) {
      const urlsValid = ["cloudflare_api_server_url", "cloudflare_frontend_url"].every((key) => {
        try { return ["http:", "https:"].includes(new URL(config.get(key) ?? "").protocol); } catch { return false; }
      });
      checks.external_service = cloudflareKeys.every((key) => !!config.get(key)) && urlsValid ? "ok" : "failed";
    }
    if (config.get("cloudflare_tunnel_token")) {
      checks.tunnel = getTunnelStatus().status === "running" ? "ok" : "failed";
    }
  } catch {
    if (checks.database !== "ok") {
      recordDbMetric("db_readiness_failures_total");
    } else if (checks.encryption !== "ok") {
      recordDbMetric("encryption_readiness_failures_total");
    } else {
      recordDbMetric("configuration_readiness_failures_total");
    }
  }
  const failed = Object.values(checks).includes("failed");
  res.status(failed ? 503 : 200).json({ status: failed ? "not_ready" : "ready", checks, background_operations: getBackgroundStatus(), metrics: getDbMetrics(pool) });
});

router.get("/background-status", (_req, res) => {
  const operations = getBackgroundStatus();
  const degraded = Object.values(operations).some((operation) => operation.state === "degraded" || operation.state === "failed");
  res.status(degraded ? 503 : 200).json({ status: degraded ? "degraded" : "healthy", operations });
});

export default router;
