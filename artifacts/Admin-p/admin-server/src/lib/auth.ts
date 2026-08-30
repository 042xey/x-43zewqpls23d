import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminSessionsTable, adminUsersTable } from "@workspace/db/schema";

const PASSWORD_COST = 16_384;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELIZATION = 1;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_COOKIE = "admin_session";
const CSRF_COOKIE = "admin_csrf";

export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, {
    N: PASSWORD_COST,
    r: PASSWORD_BLOCK_SIZE,
    p: PASSWORD_PARALLELIZATION,
  });
  return ["scrypt", PASSWORD_COST, PASSWORD_BLOCK_SIZE, PASSWORD_PARALLELIZATION,
    salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [, n, r, p, saltEncoded, hashEncoded] = encoded.split("$");
  const salt = Buffer.from(saltEncoded ?? "", "base64url");
  const expected = Buffer.from(hashEncoded ?? "", "base64url");
  if (!salt.length || !expected.length || n !== String(PASSWORD_COST) || r !== String(PASSWORD_BLOCK_SIZE) || p !== String(PASSWORD_PARALLELIZATION)) return false;
  const actual = scryptSync(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionCookie(): { token: string; expiresAt: Date } {
  return { token: randomBytes(32).toString("base64url"), expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
}

export function newCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const session = newSessionCookie();
  await db.insert(adminSessionsTable).values({ userId, tokenHash: hashToken(session.token), expiresAt: session.expiresAt });
  return session;
}

export async function getSessionUser(token: string) {
  const [session] = await db.select({ userId: adminSessionsTable.userId })
    .from(adminSessionsTable)
    .where(and(eq(adminSessionsTable.tokenHash, hashToken(token)), gt(adminSessionsTable.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;
  const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, session.userId)).limit(1);
  return user ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.tokenHash, hashToken(token)));
}

export async function isSensitiveActionLimited(key: string): Promise<boolean> {
  const bucketKey = createHash("sha256").update(`admin-action:${key}`).digest("hex");
  const resetAt = new Date(Date.now() + 60_000);
  const result = await db.execute(sql`
    insert into rate_limit_buckets (key, count, reset_at) values (${bucketKey}, 1, ${resetAt})
    on conflict (key) do update set
      count = case when rate_limit_buckets.reset_at <= now() then 1 else rate_limit_buckets.count + 1 end,
      reset_at = case when rate_limit_buckets.reset_at <= now() then excluded.reset_at else rate_limit_buckets.reset_at end
    returning count
  `);
  return Number((result.rows[0] as { count: number }).count) > 30;
}

export function getSessionToken(cookieHeader: string | undefined): string | null {
  const match = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}

export const sessionCookieName = SESSION_COOKIE;
export const csrfCookieName = CSRF_COOKIE;
