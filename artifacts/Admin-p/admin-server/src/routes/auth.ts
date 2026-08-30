import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminUsersTable, appConfigTable } from "@workspace/db/schema";
import { adminAuth } from "../middleware/adminAuth";
import { createSession, deleteSession, getSessionToken, hashPassword, newCsrfToken, normalizeUsername, csrfCookieName, sessionCookieName, verifyPassword } from "../lib/auth";
import { createHash, timingSafeEqual } from "node:crypto";
import { decryptConfigValue } from "@workspace/db/secure-config";
import { audit } from "../lib/audit";

const router = Router();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

async function limited(key: string): Promise<boolean> {
  const bucketKey = createHash("sha256").update(`admin-auth:${key}`).digest("hex");
  const resetAt = new Date(Date.now() + WINDOW_MS);
  const result = await db.execute(sql`
    insert into rate_limit_buckets (key, count, reset_at)
    values (${bucketKey}, 1, ${resetAt})
    on conflict (key) do update set
      count = case when rate_limit_buckets.reset_at <= now() then 1 else rate_limit_buckets.count + 1 end,
      reset_at = case when rate_limit_buckets.reset_at <= now() then excluded.reset_at else rate_limit_buckets.reset_at end
    returning count
  `);
  return Number((result.rows[0] as { count: number }).count) > MAX_ATTEMPTS;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function setSessionCookies(res: Response, session: { token: string; expiresAt: Date }): void {
  res.cookie(sessionCookieName, session.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", expires: session.expiresAt, path: "/" });
  res.cookie(csrfCookieName, newCsrfToken(), { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "strict", expires: session.expiresAt, path: "/" });
}

router.get("/ping", adminAuth, (_req, res) => res.json({ ok: true }));

router.get("/setup-status", async (_req, res) => {
  try {
    const [user] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1);
    res.json({ configured: !!user });
  } catch {
    res.status(503).json({ error: "Admin schema is not ready. Apply the database schema first." });
  }
});

router.post("/setup", async (req, res): Promise<void> => {
  const ip = req.socket.remoteAddress ?? "unknown";
  if (await limited(`setup:${ip}`)) { res.status(429).json({ error: "Too many setup attempts. Try again later." }); return; }
  const bootstrap = process.env["ADMIN_BOOTSTRAP_TOKEN"];
  const bootstrapExpiry = process.env["ADMIN_BOOTSTRAP_TOKEN_EXPIRES_AT"];
  const suppliedBootstrap = typeof req.headers["x-bootstrap-token"] === "string" ? req.headers["x-bootstrap-token"] : "";
  const suppliedLegacyKey = typeof req.headers["x-admin-key"] === "string" ? req.headers["x-admin-key"] : "";
  const [legacyConfig] = await db.select({ value: appConfigTable.value }).from(appConfigTable).where(eq(appConfigTable.key, "admin_api_key")).limit(1);
  const authorizedByBootstrap = !!bootstrap && (!bootstrapExpiry || Number.isFinite(Date.parse(bootstrapExpiry)) && Date.now() < Date.parse(bootstrapExpiry)) && safeEqual(suppliedBootstrap, bootstrap);
  const legacyKey = legacyConfig?.value ? decryptConfigValue(legacyConfig.value) : "";
  const authorizedByLegacyKey = !!legacyKey && safeEqual(suppliedLegacyKey, legacyKey);
  if (!authorizedByBootstrap && !authorizedByLegacyKey) { res.status(401).json({ error: "Invalid bootstrap token or legacy admin key." }); return; }
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username) || password.length < 12) { res.status(400).json({ error: "Username or password does not meet requirements." }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      // Serialize first-run initialization across all admin-server instances.
      await tx.execute(sql`select pg_advisory_xact_lock(81427391)`);
      const [existing] = await tx.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1);
      if (existing) return null;
      const [user] = await tx.insert(adminUsersTable).values({ username, passwordHash: hashPassword(password) }).returning({ id: adminUsersTable.id });
      if (authorizedByLegacyKey) {
        await tx.delete(appConfigTable).where(eq(appConfigTable.key, "admin_api_key"));
      }
      return user;
    });
    if (!result) { res.status(409).json({ error: "Admin account is already configured." }); return; }
    const session = await createSession(result.id);
    setSessionCookies(res, session);
    audit(req, "admin_bootstrap", "admin_user", String(result.id));
    res.json({ ok: true });
  } catch { res.status(503).json({ error: "Admin schema is not ready. Apply the database schema first." }); }
});

router.post("/login", async (req, res): Promise<void> => {
  const ip = req.socket.remoteAddress ?? "unknown";
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (await limited(`login:${ip}:${username}`)) { res.status(429).json({ error: "Too many login attempts. Try again later." }); return; }
  try {
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) { res.status(401).json({ error: "Invalid username or password." }); return; }
    const session = await createSession(user.id);
    setSessionCookies(res, session);
    audit(req, "admin_login", "admin_user", String(user.id));
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Admin schema is not ready. Apply the database schema first." });
  }
});

router.post("/logout", adminAuth, async (req, res) => {
  const token = getSessionToken(req.headers.cookie);
  if (token) await deleteSession(token);
  audit(req, "admin_logout", "admin_session");
  res.clearCookie(sessionCookieName, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" });
  res.clearCookie(csrfCookieName, { secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" }).redirect("/");
});

export default router;
