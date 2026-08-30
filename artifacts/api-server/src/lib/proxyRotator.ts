import { db } from "@workspace/db";
import { proxyUrlsTable } from "@workspace/db";
import { decryptConfigValue } from "@workspace/db/secure-config";
import { logger } from "./logger";
import { recordFailure, setMetric } from "./metrics";
import { markBackgroundFailure, markBackgroundSuccess, markBackgroundStopped } from "./backgroundStatus";

export interface ProxyConfig {
  url: string;
}

let proxies: ProxyConfig[] = [];
let currentIndex = 0;

async function loadFromDb(): Promise<void> {
  try {
    const rows = await db.select().from(proxyUrlsTable);
    proxies = rows.map((r) => ({ url: decryptConfigValue(r.url) }));
    currentIndex = 0;
    logger.debug({ count: proxies.length }, "Proxy list loaded from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load proxy list from DB");
    recordFailure("proxy_refresh_failures_total");
    markBackgroundFailure("proxy_refresh", err);
    throw err;
  }
}

export async function initProxyRotator(): Promise<() => void> {
  const timer = setInterval(() => {
    loadFromDb().catch((err) => logger.error({ err }, "Scheduled proxy refresh failed"));
  }, 60_000);
  timer.unref();
  stopProxyRotator = () => { clearInterval(timer); markBackgroundStopped("proxy_refresh"); };
  await loadFromDb().then(() => markBackgroundSuccess("proxy_refresh")).catch((err) => {
    logger.error({ err }, "Initial proxy refresh failed; scheduler will retry");
  });
  return stopProxyRotator;
}

let stopProxyRotator: (() => void) | undefined;
export function stopProxyRefresh(): void { stopProxyRotator?.(); }

export function getNextProxy(): ProxyConfig | null {
  if (proxies.length === 0) return null;
  const proxy = proxies[currentIndex];
  currentIndex = (currentIndex + 1) % proxies.length;
  return proxy ?? null;
}

export function getProxyCount(): number {
  setMetric("configured_proxies", proxies.length);
  return proxies.length;
}
