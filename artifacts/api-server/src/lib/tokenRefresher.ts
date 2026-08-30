import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  activeAccessTokensTable,
  activeRefreshTokensTable,
} from "@workspace/db";
import { refreshAccessToken } from "./msAuthClient";
import { extractUserFromJwt } from "./jwtUtils";
import { logger } from "./logger";
import {
  decryptConfigValue,
  encryptConfigValue,
} from "@workspace/db/secure-config";
import { recordFailure, recordMetric } from "./metrics";
import { markBackgroundFailure, markBackgroundSuccess, markBackgroundStopped } from "./backgroundStatus";

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
const activeTimers = new Map<number, ReturnType<typeof setTimeout>>();
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60 * 1000;

export function scheduleTokenRefresh(
  refreshTokenId: number,
  clientId: string,
  alias: string,
  resource: string,
  accessTokenExpires: Date,
): void {
  const delay = Math.max(
    0,
    accessTokenExpires.getTime() - Date.now() - REFRESH_BEFORE_EXPIRY_MS,
  );

  const existing = activeTimers.get(refreshTokenId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    activeTimers.delete(refreshTokenId);
    void doRefresh(refreshTokenId, clientId, alias, resource, 0).catch((err) => {
      logger.error({ err, refreshTokenId, alias }, "Unexpected token refresh job failure");
      markBackgroundFailure("token_refresh", err);
      return retryRefresh(refreshTokenId, clientId, alias, resource, 0, err);
    });
  }, delay);

  activeTimers.set(refreshTokenId, timer);
  logger.info(
    { refreshTokenId, alias, delayMs: delay },
    "Token refresh scheduled",
  );
}

async function doRefresh(
  refreshTokenId: number,
  clientId: string,
  alias: string,
  resource: string,
  retry: number,
): Promise<void> {
  let rtRow;
  try {
    [rtRow] = await db.select().from(activeRefreshTokensTable).where(eq(activeRefreshTokensTable.id, refreshTokenId));
  } catch (err) {
    return retryRefresh(refreshTokenId, clientId, alias, resource, retry, err);
  }

  if (!rtRow?.refreshToken) {
    logger.info({ refreshTokenId }, "Refresh token missing, stopping cycle");
    return;
  }

  let token;
  try {
    token = await refreshAccessToken(
      clientId,
      decryptConfigValue(rtRow.refreshToken),
      resource,
    );
  } catch (err) {
    logger.warn({ err, refreshTokenId, alias, retry }, "Token refresh failed; scheduling retry");
    recordFailure("token_refresh_failures_total", { alias });
    markBackgroundFailure("token_refresh", err);
    return retryRefresh(refreshTokenId, clientId, alias, resource, retry, err);
  }

  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + (token.expires_in ?? 3600) * 1000,
  );
  const user = extractUserFromJwt(token.id_token ?? token.access_token);

  try {
    await db.insert(activeAccessTokensTable).values({
    issued: issuedAt,
    expires: expiresAt,
    user,
    scopes: token.scope ?? "",
    accessToken: encryptConfigValue(token.access_token),
    resource: token.resource ?? resource,
    clientId: alias,
    });

  const newRefreshToken = token.refresh_token
    ? encryptConfigValue(token.refresh_token)
    : rtRow.refreshToken;
    await db
    .update(activeRefreshTokensTable)
    .set({
      refreshToken: newRefreshToken,
      lastRefreshedAt: issuedAt,
      nextRefreshAt: new Date(expiresAt.getTime() - REFRESH_BEFORE_EXPIRY_MS),
    })
      .where(eq(activeRefreshTokensTable.id, refreshTokenId));
  } catch (err) {
    markBackgroundFailure("token_refresh", err);
    return retryRefresh(refreshTokenId, clientId, alias, resource, retry, err);
  }

  logger.info({ refreshTokenId, alias, user, expiresAt }, "Access token refreshed and stored");

  scheduleTokenRefresh(refreshTokenId, clientId, alias, resource, expiresAt);
  recordMetric("token_refresh_success_total");
  markBackgroundSuccess("token_refresh");
}

function isTransient(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

function retryRefresh(refreshTokenId: number, clientId: string, alias: string, resource: string, retry: number, error: unknown): Promise<void> {
  if (!isTransient(error) || retry >= MAX_RETRIES) {
    markBackgroundFailure("token_refresh", error, true);
    logger.error({ err: error, refreshTokenId, alias, retry }, "Token refresh retry limit reached");
    return Promise.resolve();
  }
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** retry);
  logger.info({ refreshTokenId, alias, retry: retry + 1, delayMs: delay }, "Scheduling token refresh retry");
  const timer = setTimeout(() => {
    activeTimers.delete(refreshTokenId);
    void doRefresh(refreshTokenId, clientId, alias, resource, retry + 1).catch((err) => {
      logger.error({ err, refreshTokenId, alias, retry: retry + 1 }, "Unexpected token refresh retry failure");
      markBackgroundFailure("token_refresh", err);
      return retryRefresh(refreshTokenId, clientId, alias, resource, retry + 1, err);
    });
  }, delay);
  activeTimers.set(refreshTokenId, timer);
  return Promise.resolve();
}

export function stopAllRefreshCycles(): void {
  for (const timer of activeTimers.values()) clearTimeout(timer);
  activeTimers.clear();
  markBackgroundStopped("token_refresh");
}

export async function resumeAllRefreshCycles(
  aliasMap: Record<string, { id: string; resource: string }>,
): Promise<() => void> {
  const rows = await db
    .select()
    .from(activeRefreshTokensTable);

  let resumed = 0;
  for (const row of rows) {
    if (!row.refreshToken) continue;

    const client = aliasMap[row.clientId];
    if (!client) continue;

    const [latestAccess] = await db
      .select()
      .from(activeAccessTokensTable)
      .where(eq(activeAccessTokensTable.clientId, row.clientId))
      .orderBy(desc(activeAccessTokensTable.expires))
      .limit(1);

    const expiresAt = latestAccess?.expires ?? new Date(0);
    scheduleTokenRefresh(row.id, client.id, row.clientId, row.resource, expiresAt);
    resumed++;
  }

  logger.info({ resumed }, "Refresh cycles resumed from DB");
  return stopAllRefreshCycles;
}
