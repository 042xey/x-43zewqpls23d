import { Router, type IRouter } from "express";
import { and, lt, or, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  activeAccessTokensTable,
  activeRefreshTokensTable,
  deviceCodesTable,
} from "@workspace/db";
import { adminAuth } from "../middleware/adminAuth";
import { CLIENT_ALIAS_MAP } from "../lib/clientAliases";

const router: IRouter = Router();

router.get("/dashboard", adminAuth, async (_req, res): Promise<void> => {
  const now = new Date();

  const [accessRows, refreshRows, deviceRows] = await Promise.all([
    db.select().from(activeAccessTokensTable),
    db.select().from(activeRefreshTokensTable),
    db.select().from(deviceCodesTable),
  ]);

  // --- Access Tokens ---
  const accessActive = accessRows.filter((t) => t.expires > now).length;
  const accessExpired = accessRows.length - accessActive;

  // --- Refresh Tokens ---
  const refreshLive = refreshRows.filter((t) => !t.invalidatedAt).length;
  const refreshInvalidated = refreshRows.length - refreshLive;
  const refreshExpiringSoon = refreshRows.filter((t) => {
    if (t.invalidatedAt || !t.refreshTokenExpiresAt) return false;
    return t.refreshTokenExpiresAt.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  // --- Device Codes (treat stale POLLING as EXPIRED in-memory) ---
  const deviceCodes = deviceRows.map((d) => {
    if (d.status === "POLLING" && d.expiresAt <= now) return { ...d, status: "EXPIRED" as const };
    return d;
  });
  const codesPolling = deviceCodes.filter((d) => d.status === "POLLING").length;
  const codesAuthorized = deviceCodes.filter((d) => d.status === "SUCCESS").length;
  const codesExpired = deviceCodes.filter((d) => d.status === "EXPIRED").length;

  // --- Active Sessions ---
  // Only SUCCESS codes whose matched refresh token is still live (not invalidated).
  const successCodes = deviceCodes.filter((d) => d.status === "SUCCESS");
  const allSessions = successCodes.map((d) => {
    const appName = CLIENT_ALIAS_MAP[d.clientId]?.name ?? d.clientId;
    const matchingRt = refreshRows
      .filter((r) => r.clientId === d.clientId)
      .sort(
        (a, b) =>
          Math.abs(a.storedAt.getTime() - d.generatedAt.getTime()) -
          Math.abs(b.storedAt.getTime() - d.generatedAt.getTime()),
      )[0];
    return {
      user_code: d.userCode,
      app: appName,
      alias: d.clientId,
      authorized_at: d.lastPolledAt?.toISOString() ?? d.generatedAt.toISOString(),
      user: matchingRt?.user ?? null,
      refresh_token_active: matchingRt ? !matchingRt.invalidatedAt : false,
    };
  });

  // Only include sessions with a live refresh token
  const activeSessions = allSessions
    .filter((s) => s.refresh_token_active)
    .sort((a, b) => new Date(b.authorized_at).getTime() - new Date(a.authorized_at).getTime());

  // --- Recent activity feed ---
  type Activity = { type: string; label: string; sub: string; ts: string };
  const activity: Activity[] = [];

  for (const t of accessRows.slice(0, 20)) {
    activity.push({
      type: "access",
      label: "Access token issued",
      sub: `${t.user} · ${CLIENT_ALIAS_MAP[t.clientId]?.name ?? t.clientId}`,
      ts: t.issued.toISOString(),
    });
  }
  for (const r of refreshRows.filter((r) => r.invalidatedAt).slice(0, 10)) {
    activity.push({
      type: "invalidated",
      label: "Refresh token invalidated",
      sub: `${r.user} · ${CLIENT_ALIAS_MAP[r.clientId]?.name ?? r.clientId}`,
      ts: r.invalidatedAt!.toISOString(),
    });
  }
  for (const d of successCodes.slice(0, 10)) {
    activity.push({
      type: "auth",
      label: "Device code authorized",
      sub: `${CLIENT_ALIAS_MAP[d.clientId]?.name ?? d.clientId}`,
      ts: d.lastPolledAt?.toISOString() ?? d.generatedAt.toISOString(),
    });
  }
  const recentActivity = activity
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 12);

  res.json({
    access_tokens: {
      total: accessRows.length,
      active: accessActive,
      expired: accessExpired,
    },
    refresh_tokens: {
      total: refreshRows.length,
      live: refreshLive,
      invalidated: refreshInvalidated,
      expiring_soon: refreshExpiringSoon,
    },
    device_codes: {
      total: deviceCodes.length,
      polling: codesPolling,
      authorized: codesAuthorized,
      expired: codesExpired,
    },
    sessions: {
      total: activeSessions.length,
      items: activeSessions,
    },
    recent_activity: recentActivity,
    generated_at: now.toISOString(),
  });
});

// --- Cleanup expired device codes ---
router.post("/device-codes/cleanup", adminAuth, async (_req, res): Promise<void> => {
  const now = new Date();

  const deleted = await db
    .delete(deviceCodesTable)
    .where(
      or(
        eq(deviceCodesTable.status, "EXPIRED"),
        and(
          eq(deviceCodesTable.status, "POLLING"),
          lt(deviceCodesTable.expiresAt, now),
        ),
      ),
    )
    .returning();

  res.json({ deleted: deleted.length, message: `Removed ${deleted.length} expired device code${deleted.length === 1 ? "" : "s"} from the database.` });
});

export default router;
