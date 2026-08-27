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

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
const activeTimers = new Map<number, ReturnType<typeof setTimeout>>();

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
    doRefresh(refreshTokenId, clientId, alias, resource).catch((err) =>
      logger.error({ err, refreshTokenId }, "Unhandled error in doRefresh"),
    );
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
): Promise<void> {
  const [rtRow] = await db
    .select()
    .from(activeRefreshTokensTable)
    .where(eq(activeRefreshTokensTable.id, refreshTokenId));

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
    logger.warn({ err, refreshTokenId, alias }, "Token refresh failed, stopping cycle");
    return;
  }

  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + (token.expires_in ?? 3600) * 1000,
  );
  const user = extractUserFromJwt(token.id_token ?? token.access_token);

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

  logger.info({ refreshTokenId, alias, user, expiresAt }, "Access token refreshed and stored");

  scheduleTokenRefresh(refreshTokenId, clientId, alias, resource, expiresAt);
}

export async function resumeAllRefreshCycles(
  aliasMap: Record<string, { id: string; resource: string }>,
): Promise<void> {
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
}
