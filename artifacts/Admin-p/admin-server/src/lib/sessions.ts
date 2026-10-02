import type { ActiveRefreshToken, DeviceCode } from "@workspace/db";
import { CLIENT_ALIAS_MAP } from "./clientAliases";

export interface RefreshTokenHealth {
  invalidatedAt: Date | null;
  refreshTokenExpiresAt: Date | null;
}

export function isRefreshTokenLive(
  token: RefreshTokenHealth,
  now: Date,
): boolean {
  if (token.invalidatedAt) return false;
  if (
    token.refreshTokenExpiresAt &&
    token.refreshTokenExpiresAt.getTime() <= now.getTime()
  ) {
    return false;
  }
  return true;
}

export interface SessionAuditRow {
  user_code: string;
  app: string;
  alias: string;
  status: DeviceCode["status"];
  generated_at: string;
  expires_at: string;
  last_polled_at: string | null;
  authorized_at: string | null;
  user: string | null;
  resource: string | null;
  foci: string | null;
  refresh_token_id: number | null;
  refresh_token_active: boolean | null;
  refresh_token_expires_at: string | null;
  last_refreshed_at: string | null;
  next_refresh_at: string | null;
  invalidated_at: string | null;
  invalid_reason: string | null;
}

export function buildSessionAudit(
  deviceRows: DeviceCode[],
  refreshRows: ActiveRefreshToken[],
  now: Date,
): SessionAuditRow[] {
  const tokenByUserCode = new Map<string, ActiveRefreshToken>();
  for (const token of refreshRows) {
    if (token.userCode) tokenByUserCode.set(token.userCode, token);
  }

  return deviceRows.map((device) => {
    let status = device.status;
    if (status === "POLLING" && device.expiresAt <= now) status = "EXPIRED";

    const token = tokenByUserCode.get(device.userCode) ?? null;

    const authorizedAt = token
      ? token.storedAt
      : status === "SUCCESS"
        ? device.lastPolledAt ?? device.generatedAt
        : null;

    return {
      user_code: device.userCode,
      app: CLIENT_ALIAS_MAP[device.clientId]?.name ?? device.clientId,
      alias: device.clientId,
      status,
      generated_at: device.generatedAt.toISOString(),
      expires_at: device.expiresAt.toISOString(),
      last_polled_at: device.lastPolledAt?.toISOString() ?? null,
      authorized_at: authorizedAt?.toISOString() ?? null,
      user: token?.user ?? null,
      resource: token?.resource ?? null,
      foci: token?.foci ?? null,
      refresh_token_id: token?.id ?? null,
      refresh_token_active: token ? isRefreshTokenLive(token, now) : null,
      refresh_token_expires_at: token?.refreshTokenExpiresAt?.toISOString() ?? null,
      last_refreshed_at: token?.lastRefreshedAt?.toISOString() ?? null,
      next_refresh_at: token?.nextRefreshAt?.toISOString() ?? null,
      invalidated_at: token?.invalidatedAt?.toISOString() ?? null,
      invalid_reason: token?.invalidReason ?? null,
    };
  });
}
