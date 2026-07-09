import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const CONFIG_KEY = "active_alias";
const REFRESH_INTERVAL_MS = 60_000;

let activeAlias: string | null = null;
let lastLoaded = 0;

export async function initConfigLoader(): Promise<void> {
  await loadConfig();
  setInterval(() => {
    loadConfig().catch((err) =>
      logger.warn({ err }, "Config refresh failed"),
    );
  }, REFRESH_INTERVAL_MS);
}

async function loadConfig(): Promise<void> {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, CONFIG_KEY));
  activeAlias = row?.value ?? null;
  lastLoaded = Date.now();
  logger.info({ activeAlias }, "Config loaded");
}

export function getActiveAlias(): string | null {
  return activeAlias;
}
