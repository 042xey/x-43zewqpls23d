import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { decryptConfigValue, validateConfigEncryptionKey } from "@workspace/db/secure-config";
import { getMetrics, isMetricsAuthorized } from "../lib/metrics";

const router: IRouter = Router();

// Public, unauthenticated liveness endpoint. Intentionally not gated by
// adminAuth so platform probes (which can't send custom headers) can reach it.
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
  const checks: Record<string, string> = {
    database: "failed",
    encryption: "failed",
    external_service: "not_configured",
    tunnel: "not_configured",
  };
  try {
    await pool.query("select 1");
    checks.database = "ok";
    validateConfigEncryptionKey();
    checks.encryption = "ok";

    const rows = await db.select().from(appConfigTable);
    const config = new Map(rows.map((row) => [row.key, decryptConfigValue(row.value)]));
    const cloudflareKeys = ["cloudflare_api_key", "cloudflare_account_id", "cloudflare_api_server_url", "cloudflare_frontend_url"];
    const hasCloudflareConfig = cloudflareKeys.some((key) => !!config.get(key));
    if (hasCloudflareConfig) {
      const urlsValid = ["cloudflare_api_server_url", "cloudflare_frontend_url"].every((key) => {
        try { return ["http:", "https:"].includes(new URL(config.get(key) ?? "").protocol); } catch { return false; }
      });
      checks.external_service = cloudflareKeys.every((key) => !!config.get(key)) && urlsValid ? "ok" : "failed";
    }
    if (config.get("cloudflare_tunnel_token")) checks.tunnel = "ok";
  } catch (error) {
    if (checks.database !== "ok") checks.database = "failed";
    else if (checks.encryption !== "ok") checks.encryption = "failed";
    else checks.external_service = "failed";
  }
  const failed = Object.values(checks).includes("failed");
  res.status(failed ? 503 : 200).json({ status: failed ? "not_ready" : "ready", checks });
});

export default router;
