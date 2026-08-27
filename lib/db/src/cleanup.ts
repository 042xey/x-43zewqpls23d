import { sql } from "drizzle-orm";
import { db } from "./index";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export async function cleanupExpiredData(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(81427392)`);
    await tx.execute(sql`delete from admin_sessions where expires_at <= now()`);
    await tx.execute(sql`delete from device_codes where expires_at <= now() or (status in ('SUCCESS', 'EXPIRED') and generated_at < now() - interval '1 day')`);
    await tx.execute(sql`delete from active_access_tokens where expires <= now()`);
    await tx.execute(sql`delete from active_refresh_tokens where invalidated_at is not null or refresh_token_expires_at <= now()`);
    await tx.execute(sql`delete from rate_limit_buckets where reset_at <= now()`);
  });
}

export function startCleanupScheduler(): () => void {
  const timer = setInterval(() => {
    void cleanupExpiredData().catch(() => {
      // Cleanup is best effort; the next scheduled run retries it.
    });
  }, CLEANUP_INTERVAL_MS);
  timer.unref();
  void cleanupExpiredData().catch(() => {});
  return () => clearInterval(timer);
}
