import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminUsersTable, appConfigTable } from "@workspace/db/schema";
import { adminAuth } from "../middleware/adminAuth";
import { createSession, deleteSession, getSessionToken, hashPassword, newCsrfToken, normalizeUsername, csrfCookieName, sessionCookieName, verifyPassword } from "../lib/auth";
import { timingSafeEqual } from "node:crypto";

const router = Router();
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    if (record.resetAt <= now) attempts.delete(key);
  }
}, WINDOW_MS).unref();

function limited(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
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
  if (limited(`setup:${ip}`)) { res.status(429).json({ error: "Too many setup attempts. Try again later." }); return; }
  const bootstrap = process.env["ADMIN_BOOTSTRAP_TOKEN"];
  const suppliedBootstrap = typeof req.headers["x-bootstrap-token"] === "string" ? req.headers["x-bootstrap-token"] : "";
  const suppliedLegacyKey = typeof req.headers["x-admin-key"] === "string" ? req.headers["x-admin-key"] : "";
  const [legacyConfig] = await db.select({ value: appConfigTable.value }).from(appConfigTable).where(eq(appConfigTable.key, "admin_api_key")).limit(1);
  const authorizedByBootstrap = !!bootstrap && safeEqual(suppliedBootstrap, bootstrap);
  const authorizedByLegacyKey = !!legacyConfig?.value && safeEqual(suppliedLegacyKey, legacyConfig.value);
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
    res.json({ ok: true });
  } catch { res.status(503).json({ error: "Admin schema is not ready. Apply the database schema first." }); }
});

router.post("/login", async (req, res): Promise<void> => {
  const ip = req.socket.remoteAddress ?? "unknown";
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (limited(`login:${ip}:${username}`)) { res.status(429).json({ error: "Too many login attempts. Try again later." }); return; }
  try {
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) { res.status(401).json({ error: "Invalid username or password." }); return; }
    const session = await createSession(user.id);
    setSessionCookies(res, session);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Admin schema is not ready. Apply the database schema first." });
  }
});

router.get("/logout", async (req, res) => {
  const token = getSessionToken(req.headers.cookie);
  if (token) await deleteSession(token);
  res.clearCookie(sessionCookieName, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" });
  res.clearCookie(csrfCookieName, { secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" }).redirect("/");
});

export default router;
