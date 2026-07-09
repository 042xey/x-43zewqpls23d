import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const DB_KEY = "admin_api_key";

let cached: string | null | undefined = undefined;

export async function getAdminKey(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const [row] = await db
      .select()
      .from(appConfigTable)
      .where(eq(appConfigTable.key, DB_KEY))
      .limit(1);
    cached = row?.value ?? process.env["ADMIN_API_KEY"] ?? null;
  } catch {
    cached = process.env["ADMIN_API_KEY"] ?? null;
  }
  return cached;
}

export async function setAdminKey(key: string): Promise<void> {
  await db
    .insert(appConfigTable)
    .values({ key: DB_KEY, value: key })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value: key } });
  cached = key;
  logger.info("Admin key configured via first-run setup");
}

export async function isAdminKeyConfigured(): Promise<boolean> {
  const key = await getAdminKey();
  return !!key;
}

export function invalidateAdminKeyCache(): void {
  cached = undefined;
}
