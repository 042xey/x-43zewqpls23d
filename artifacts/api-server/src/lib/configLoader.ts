import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { markBackgroundFailure, markBackgroundSuccess, markBackgroundStopped } from "./backgroundStatus";

const CONFIG_KEY = "active_alias";
const REFRESH_INTERVAL_MS = 60_000;

let activeAlias: string | null = null;

export async function initConfigLoader(): Promise<() => void> {
  const timer = setInterval(() => {
    loadConfig().catch((err) =>
      (logger.warn({ err }, "Config refresh failed"), markBackgroundFailure("config_refresh", err)),
    );
  }, REFRESH_INTERVAL_MS);
  timer.unref();
  stopConfigLoader = () => { clearInterval(timer); markBackgroundStopped("config_refresh"); };
  await loadConfig().then(() => markBackgroundSuccess("config_refresh")).catch((err) => {
    logger.warn({ err }, "Initial config load failed; scheduler will retry");
    markBackgroundFailure("config_refresh", err);
  });
  return stopConfigLoader;
}

let stopConfigLoader: (() => void) | undefined;
export function stopConfigRefresh(): void { stopConfigLoader?.(); }

async function loadConfig(): Promise<void> {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, CONFIG_KEY));
  activeAlias = row?.value ?? null;
  logger.info({ activeAlias }, "Config loaded");
}

export function getActiveAlias(): string | null {
  return activeAlias;
}
