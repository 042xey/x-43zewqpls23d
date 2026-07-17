import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  activeAccessTokensTable,
  activeRefreshTokensTable,
  deviceCodesTable,
} from "@workspace/db";
import { adminAuth } from "../middleware/adminAuth";
import { CLIENT_ALIAS_MAP } from "../lib/clientAliases";
import { refreshAccessToken, RefreshGrantError } from "../lib/msTokenclient";

const router: IRouter = Router();

// Must match REFRESH_TOKEN_LOCK_NAMESPACE in
// artifacts/api-server/src/lib/tokenRefresher.ts — both services rotate the
// same single-use Microsoft refresh tokens and must serialize access via a
// shared Postgres advisory lock keyed on the refresh token row id.
const REFRESH_TOKEN_LOCK_NAMESPACE = 741_852;

router.get("/tokens", adminAuth, async (req, res): Promise<void> => {
  const alias = (req.query.app as string | undefined)?.toLowerCase();

  if (alias && !CLIENT_ALIAS_MAP[alias]) {
    res.status(400).json({
      error: `Unknown app alias "${alias}". Valid aliases: ${Object.keys(CLIENT_ALIAS_MAP).join(", ")}`,
    });
    return;
  }

  let accessTokens: typeof activeAccessTokensTable.$inferSelect[];
  let refreshTokens: typeof activeRefreshTokensTable.$inferSelect[];

  if (alias) {
    [accessTokens, refreshTokens] = await Promise.all([
      db
        .select()
        .from(activeAccessTokensTable)
        .where(eq(activeAccessTokensTable.clientId, alias))
        .orderBy(desc(activeAccessTokensTable.issued)),
      db
        .select()
        .from(activeRefreshTokensTable)
        .where(eq(activeRefreshTokensTable.clientId, alias))
        .orderBy(desc(activeRefreshTokensTable.storedAt)),
    ]);
  } else {
    [accessTokens, refreshTokens] = await Promise.all([
      db
        .select()
        .from(activeAccessTokensTable)
        .orderBy(desc(activeAccessTokensTable.issued)),
      db
        .select()
        .from(activeRefreshTokensTable)
        .orderBy(desc(activeRefreshTokensTable.storedAt)),
    ]);
  }

  const now = new Date();

  res.json({
    filter: alias ?? "all",
    access_tokens: accessTokens.map((t) => ({
      id: t.id,
      app: CLIENT_ALIAS_MAP[t.clientId]?.name ?? t.clientId,
      alias: t.clientId,
      user: t.user,
      scopes: t.scopes,
      resource: t.resource,
      issued: t.issued.toISOString(),
      expires: t.expires.toISOString(),
      expired: t.expires < now,
      access_token: t.accessToken,
    })),
    refresh_tokens: refreshTokens.map((t) => ({
      id: t.id,
      app: CLIENT_ALIAS_MAP[t.clientId]?.name ?? t.clientId,
      alias: t.clientId,
      user: t.user,
      resource: t.resource,
      stored_at: t.storedAt.toISOString(),
      foci: t.foci,
      invalidated_at: t.invalidatedAt?.toISOString() ?? null,
      invalid_reason: t.invalidReason,
      refresh_token_expires_at: t.refreshTokenExpiresAt?.toISOString() ?? null,
      refresh_token_expiring_soon: t.refreshTokenExpiresAt
        ? t.refreshTokenExpiresAt.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000
        : null,
    })),
    counts: {
      access_tokens: accessTokens.length,
      refresh_tokens: refreshTokens.length,
    },
  });
});

router.delete(
  "/tokens/:id",
  adminAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const id = parseInt(raw, 10);

    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid token id" });
      return;
    }

    const type = (req.query.type as string | undefined) ?? "access";

    if (type !== "access" && type !== "refresh") {
      res.status(400).json({ error: 'type must be "access" or "refresh"' });
      return;
    }

    if (type === "access") {
      const [deleted] = await db
        .delete(activeAccessTokensTable)
        .where(eq(activeAccessTokensTable.id, id))
        .returning();

      if (!deleted) {
        res.status(404).json({ error: "Access token not found" });
        return;
      }
      res.json({ deleted: true, type: "access", id });
    } else {
      const [deleted] = await db
        .delete(activeRefreshTokensTable)
        .where(eq(activeRefreshTokensTable.id, id))
        .returning();

      if (!deleted) {
        res.status(404).json({ error: "Refresh token not found" });
        return;
      }
      res.json({ deleted: true, type: "refresh", id });
    }
  },
);

router.post(
  "/tokens/bulk-delete",
  adminAuth,
  async (req, res): Promise<void> => {
    const body = req.body as { items?: Array<{ id: number; type: string }> };
    const items = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      res.status(400).json({ error: "items must be a non-empty array" });
      return;
    }

    for (const item of items) {
      if (
        typeof item.id !== "number" ||
        Number.isNaN(item.id) ||
        (item.type !== "access" && item.type !== "refresh")
      ) {
        res.status(400).json({ error: "each item must have a numeric id and type of \"access\" or \"refresh\"" });
        return;
      }
    }

    const accessIds = items.filter((i) => i.type === "access").map((i) => i.id);
    const refreshIds = items.filter((i) => i.type === "refresh").map((i) => i.id);

    const deleted: Array<{ id: number; type: "access" | "refresh" }> = [];

    for (const id of accessIds) {
      const [row] = await db
        .delete(activeAccessTokensTable)
        .where(eq(activeAccessTokensTable.id, id))
        .returning();
      if (row) deleted.push({ id, type: "access" });
    }

    for (const id of refreshIds) {
      const [row] = await db
        .delete(activeRefreshTokensTable)
        .where(eq(activeRefreshTokensTable.id, id))
        .returning();
      if (row) deleted.push({ id, type: "refresh" });
    }

    res.json({ deleted, count: deleted.length, requested: items.length });
  },
);

router.post(
  "/tokens/:id/refresh",
  adminAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);

    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid token id" });
      return;
    }

    const [existingRow] = await db
      .select({
        id: activeRefreshTokensTable.id,
        invalidatedAt: activeRefreshTokensTable.invalidatedAt,
        invalidReason: activeRefreshTokensTable.invalidReason,
      })
      .from(activeRefreshTokensTable)
      .where(eq(activeRefreshTokensTable.id, id));

    if (!existingRow) {
      res.status(404).json({ error: "Refresh token not found" });
      return;
    }

    if (existingRow.invalidatedAt) {
      res.status(400).json({
        error:
          existingRow.invalidReason ??
          "This refresh token has been invalidated by Microsoft and can no longer be used. Generate a new device code to re-authenticate.",
      });
      return;
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Refresh tokens are single-use/rotating on Microsoft's side, and
        // the background auto-refresh cycle in the API server can fire for
        // this same row concurrently. Take a Postgres advisory lock keyed
        // on the row id, then re-read the latest refresh token value so we
        // never reuse one that another process already consumed.
        await tx.execute(
          sql`select pg_advisory_xact_lock(${REFRESH_TOKEN_LOCK_NAMESPACE}, ${id})`,
        );

        const [refreshRow] = await tx
          .select()
          .from(activeRefreshTokensTable)
          .where(eq(activeRefreshTokensTable.id, id));

        if (!refreshRow) {
          return { status: 404 as const, error: "Refresh token not found" };
        }

        if (!refreshRow.refreshToken) {
          return {
            status: 400 as const,
            error: "This refresh token record has no stored refresh token value",
          };
        }

        const client = CLIENT_ALIAS_MAP[refreshRow.clientId];
        if (!client) {
          return {
            status: 400 as const,
            error: `Unknown client alias "${refreshRow.clientId}" — cannot resolve the OAuth client id`,
          };
        }

        const token = await refreshAccessToken(
          client.id,
          refreshRow.refreshToken,
          refreshRow.resource,
        );

        const now = new Date();
        const expires = new Date(now.getTime() + token.expires_in * 1000);

        const [newAccessToken] = await tx
          .insert(activeAccessTokensTable)
          .values({
            issued: now,
            expires,
            user: refreshRow.user,
            scopes: token.scope,
            accessToken: token.access_token,
            resource: refreshRow.resource,
            clientId: refreshRow.clientId,
          })
          .returning();

        const refreshTokenExpiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        if (token.refresh_token && token.refresh_token !== refreshRow.refreshToken) {
          await tx
            .update(activeRefreshTokensTable)
            .set({ refreshToken: token.refresh_token, lastRefreshedAt: now, refreshTokenExpiresAt })
            .where(eq(activeRefreshTokensTable.id, id));
        } else {
          await tx
            .update(activeRefreshTokensTable)
            .set({ lastRefreshedAt: now, refreshTokenExpiresAt })
            .where(eq(activeRefreshTokensTable.id, id));
        }

        return {
          status: 200 as const,
          access_token: {
            id: newAccessToken.id,
            app: CLIENT_ALIAS_MAP[refreshRow.clientId]?.name ?? refreshRow.clientId,
            alias: refreshRow.clientId,
            user: refreshRow.user,
            scopes: token.scope,
            resource: refreshRow.resource,
            issued: now.toISOString(),
            expires: expires.toISOString(),
            expired: false,
            access_token: token.access_token,
          },
        };
      });

      if (result.status !== 200) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json({ access_token: result.access_token });
    } catch (err) {
      if (err instanceof RefreshGrantError) {
        await db
          .update(activeRefreshTokensTable)
          .set({ invalidatedAt: new Date(), invalidReason: err.message })
          .where(eq(activeRefreshTokensTable.id, id));

        res.status(400).json({
          error:
            "This refresh token has been invalidated by Microsoft (invalid_grant) and can no longer be used. Generate a new device code to re-authenticate.",
        });
        return;
      }

      res.status(502).json({
        error: err instanceof Error ? err.message : "Failed to refresh access token",
      });
    }
  },
);

router.get("/codes", adminAuth, async (req, res): Promise<void> => {
  const alias = (req.query.app as string | undefined)?.toLowerCase();
  const status = (req.query.status as string | undefined)?.toUpperCase();

  if (alias && !CLIENT_ALIAS_MAP[alias]) {
    res.status(400).json({
      error: `Unknown app alias "${alias}". Valid aliases: ${Object.keys(CLIENT_ALIAS_MAP).join(", ")}`,
    });
    return;
  }

  const rows = await db
    .select()
    .from(deviceCodesTable)
    .orderBy(desc(deviceCodesTable.generatedAt));

  const filtered = rows.filter((r) => {
    if (alias && r.clientId !== alias) return false;
    if (status && r.status !== status) return false;
    return true;
  });

  res.json({
    filter: { app: alias ?? "all", status: status ?? "all" },
    codes: filtered.map((r) => ({
      user_code: r.userCode,
      app: CLIENT_ALIAS_MAP[r.clientId]?.name ?? r.clientId,
      alias: r.clientId,
      status: r.status,
      generated_at: r.generatedAt.toISOString(),
      expires_at: r.expiresAt.toISOString(),
      last_polled_at: r.lastPolledAt?.toISOString() ?? null,
    })),
    count: filtered.length,
  });
});

export default router;
