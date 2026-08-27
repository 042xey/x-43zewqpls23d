import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  generatecode: { max: 1, windowMs: 24 * 60 * 60 * 1000 },
  regeneratecode: { max: 2, windowMs: 24 * 60 * 60 * 1000 },
};
const INTERNAL_HEADER = "x-q7m2k";

function validWorkerSecret(provided: string | undefined): boolean {
  const expected = process.env["WORKER_API_SECRET"]?.trim();
  if (!expected || !provided) return false;
  const actualDigest = createHash("sha256").update(provided.trim()).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export async function checkRateLimit(
  ip: string,
  route: string,
  workerSecret?: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  if (validWorkerSecret(workerSecret)) {
    const limit = LIMITS[route] ?? { max: 1, windowMs: 24 * 60 * 60 * 1000 };
    return { allowed: true, remaining: limit.max, resetAt: new Date(Date.now() + limit.windowMs) };
  }

  const limit = LIMITS[route] ?? { max: 1, windowMs: 24 * 60 * 60 * 1000 };
  const key = createHash("sha256").update(`${route}:${ip}`).digest("hex");
  const resetAt = new Date(Date.now() + limit.windowMs);
  const result = await db.execute(sql`
    insert into rate_limit_buckets (key, count, reset_at)
    values (${key}, 1, ${resetAt})
    on conflict (key) do update set
      count = case when rate_limit_buckets.reset_at <= now() then 1 else rate_limit_buckets.count + 1 end,
      reset_at = case when rate_limit_buckets.reset_at <= now() then excluded.reset_at else rate_limit_buckets.reset_at end
    returning count, reset_at
  `);
  const row = result.rows[0] as { count: number; reset_at: Date };
  return {
    allowed: row.count <= limit.max,
    remaining: Math.max(0, limit.max - row.count),
    resetAt: new Date(row.reset_at),
  };
}

export const workerAuthHeader = INTERNAL_HEADER;
