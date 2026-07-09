import { db } from "@workspace/db";
import { proxyUrlsTable } from "@workspace/db";
import { logger } from "./logger";

export interface ProxyConfig {
  url: string;
}

let proxies: ProxyConfig[] = [];
let currentIndex = 0;

async function loadFromDb(): Promise<void> {
  try {
    const rows = await db.select().from(proxyUrlsTable);
    proxies = rows.map((r) => ({ url: r.url }));
    currentIndex = 0;
    logger.debug({ count: proxies.length }, "Proxy list loaded from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load proxy list from DB");
  }
}

export async function initProxyRotator(): Promise<void> {
  await loadFromDb();
  setInterval(() => {
    loadFromDb().catch(() => {});
  }, 60_000);
}

export function getNextProxy(): ProxyConfig | null {
  if (proxies.length === 0) return null;
  const proxy = proxies[currentIndex];
  currentIndex = (currentIndex + 1) % proxies.length;
  return proxy ?? null;
}

export function getProxyCount(): number {
  return proxies.length;
}
