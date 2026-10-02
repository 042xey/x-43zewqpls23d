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
import { buildSessionAudit, isRefreshTokenLive } from "../lib/sessions";

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
  const refreshLive = refreshRows.filter((t) => isRefreshTokenLive(t, now)).length;
  const refreshInvalidated = refreshRows.length - refreshLive;
  const refreshExpiringSoon = refreshRows.filter((t) => {
    if (t.invalidatedAt || !t.refreshTokenExpiresAt) return false;
    return t.refreshTokenExpiresAt.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  // --- Device Codes + Active Sessions (shared audit derivation) ---
  const audit = buildSessionAudit(deviceRows, refreshRows, now);
  const codesPolling = audit.filter((s) => s.status === "POLLING").length;
  const codesAuthorized = audit.filter((s) => s.status === "SUCCESS").length;
  const codesExpired = audit.filter((s) => s.status === "EXPIRED").length;

  // Only SUCCESS codes whose linked refresh token is still live.
  const activeSessions = audit
    .filter((s) => s.status === "SUCCESS" && s.refresh_token_active === true)
    .map((s) => ({
      user_code: s.user_code,
      app: s.app,
      alias: s.alias,
      authorized_at: s.authorized_at ?? s.generated_at,
      user: s.user,
      refresh_token_active: true,
    }))
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
  for (const s of audit.filter((row) => row.status === "SUCCESS").slice(0, 10)) {
    activity.push({
      type: "auth",
      label: "Device code authorized",
      sub: s.app,
      ts: s.authorized_at ?? s.generated_at,
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
      total: deviceRows.length,
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
