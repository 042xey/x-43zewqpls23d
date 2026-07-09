import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  activeRefreshTokensTable,
  deviceCodesTable,
} from "@workspace/db";
import { adminAuth } from "../middleware/adminAuth";
import { CLIENT_ALIAS_MAP } from "../lib/clientAliases";

const router: IRouter = Router();

router.get("/sessions", adminAuth, async (_req, res): Promise<void> => {
  const [deviceRows, refreshRows] = await Promise.all([
    db
      .select()
      .from(deviceCodesTable)
      .orderBy(desc(deviceCodesTable.generatedAt)),
    db.select().from(activeRefreshTokensTable),
  ]);

  const now = new Date();

  // All device codes (all statuses), enriched with matched refresh token
  const sessions = deviceRows.map((d) => {
    // Resolve computed status (stale POLLING → EXPIRED in-memory)
    let status = d.status as string;
    if (status === "POLLING" && d.expiresAt <= now) status = "EXPIRED";

    const appName = CLIENT_ALIAS_MAP[d.clientId]?.name ?? d.clientId;

    // Match nearest refresh token (same clientId, closest storedAt to generatedAt)
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
      status,
      // Device code lifecycle
      generated_at: d.generatedAt.toISOString(),
      expires_at: d.expiresAt.toISOString(),
      last_polled_at: d.lastPolledAt?.toISOString() ?? null,
      // Auth capture
      authorized_at: matchingRt?.storedAt?.toISOString() ?? null,
      user: matchingRt?.user ?? null,
      resource: matchingRt?.resource ?? null,
      foci: matchingRt?.foci ?? null,
      // Refresh token health
      refresh_token_id: matchingRt?.id ?? null,
      refresh_token_active: matchingRt ? !matchingRt.invalidatedAt : null,
      refresh_token_expires_at: matchingRt?.refreshTokenExpiresAt?.toISOString() ?? null,
      last_refreshed_at: matchingRt?.lastRefreshedAt?.toISOString() ?? null,
      next_refresh_at: matchingRt?.nextRefreshAt?.toISOString() ?? null,
      invalidated_at: matchingRt?.invalidatedAt?.toISOString() ?? null,
      invalid_reason: matchingRt?.invalidReason ?? null,
    };
  });

  // Aliases list for filter dropdown
  const aliases = Object.entries(CLIENT_ALIAS_MAP).map(([alias, info]) => ({
    alias,
    name: info.name,
  }));

  res.json({ sessions, aliases });
});

export default router;
