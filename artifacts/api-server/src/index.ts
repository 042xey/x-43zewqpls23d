import app from "./app";
import { logger } from "./lib/logger";
import { initProxyRotator } from "./lib/proxyRotator";
import { initConfigLoader } from "./lib/configLoader";
import { resumeAllRefreshCycles, stopAllRefreshCycles } from "./lib/tokenRefresher";
import { stopProxyRefresh } from "./lib/proxyRotator";
import { stopConfigRefresh } from "./lib/configLoader";
import { abortOutboundRequests } from "./lib/shutdown";
import { initTunnelManager, stopTunnel } from "./lib/tunnelManager";
import { CLIENT_ALIAS_MAP } from "./routes/generateCode";
import { runMigrations } from "@workspace/db/migrate";
import { pool } from "@workspace/db";
import { startCleanupScheduler } from "@workspace/db/cleanup";
import type { Server } from "node:http";
import {
  migrateConfigSecrets,
  migrateTokenSecrets,
  validateConfigEncryptionKey,
} from "@workspace/db/secure-config";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const adminPrefix = process.env["ADMIN_ROUTE_PREFIX"]?.trim();
const adminServerUrl = process.env["ADMIN_SERVER_URL"]?.trim();
if (adminPrefix && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(adminPrefix)) {
  throw new Error("ADMIN_ROUTE_PREFIX must contain lowercase letters, numbers, and single hyphens only.");
}
if (adminServerUrl && !adminPrefix) {
  throw new Error("ADMIN_ROUTE_PREFIX must be set when ADMIN_SERVER_URL is configured.");
}
if (adminPrefix) {
  if (!adminServerUrl) {
    throw new Error(
      "ADMIN_SERVER_URL must be set when ADMIN_ROUTE_PREFIX is configured.",
    );
  }
  let parsedAdminUrl: URL;
  try {
    parsedAdminUrl = new URL(adminServerUrl);
  } catch {
    throw new Error("ADMIN_SERVER_URL must be a valid URL.");
  }
  if (!parsedAdminUrl.protocol.startsWith("http")) {
    throw new Error("ADMIN_SERVER_URL must use http or https.");
  }
}

validateConfigEncryptionKey();

let server: Server | undefined;
let shuttingDown = false;
let stopCleanup: (() => void) | undefined;
let stopProxy: (() => void) | undefined;
let stopConfig: (() => void) | undefined;
let stopRefresh: (() => void) | undefined;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutdown requested");
  abortOutboundRequests();
  (stopRefresh ?? stopAllRefreshCycles)();
  (stopProxy ?? stopProxyRefresh)();
  (stopConfig ?? stopConfigRefresh)();
  stopCleanup?.();
  stopTunnel();
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  await new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
  await pool.end();
  clearTimeout(forceExit);
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

Promise.all([
  (async () => {
    if (process.env["RUN_MIGRATIONS_ON_STARTUP"] !== "false") {
      await runMigrations();
      await migrateConfigSecrets();
      await migrateTokenSecrets();
    } else {
      logger.info("Startup migrations disabled; schema must be managed by the release job");
    }
  })(),
  initProxyRotator(),
  initConfigLoader(),
  resumeAllRefreshCycles(CLIENT_ALIAS_MAP),
  initTunnelManager(),
]).then(([, proxyStop, configStop, refreshStop]) => {
  stopProxy = proxyStop;
  stopConfig = configStop;
  stopRefresh = refreshStop;
  server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    stopCleanup = startCleanupScheduler();
    logger.info({ port }, "Server listening");
  });
}).catch((err) => {
  logger.error({ err }, "Failed to initialize server");
  process.exit(1);
});
