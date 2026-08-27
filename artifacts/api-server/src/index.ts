import app from "./app";
import { logger } from "./lib/logger";
import { initProxyRotator } from "./lib/proxyRotator";
import { initConfigLoader } from "./lib/configLoader";
import { resumeAllRefreshCycles } from "./lib/tokenRefresher";
import { initTunnelManager, stopTunnel } from "./lib/tunnelManager";
import { CLIENT_ALIAS_MAP } from "./routes/generateCode";
import { runMigrations } from "@workspace/db/migrate";
import { pool } from "@workspace/db";
import { startCleanupScheduler } from "@workspace/db/cleanup";
import type { Server } from "node:http";
import {
  migrateConfigSecrets,
  migrateTokenSecrets,
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

let server: Server | undefined;
let shuttingDown = false;
let stopCleanup: (() => void) | undefined;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutdown requested");
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
    await runMigrations();
    await migrateConfigSecrets();
    await migrateTokenSecrets();
  })(),
  initProxyRotator(),
  initConfigLoader(),
  resumeAllRefreshCycles(CLIENT_ALIAS_MAP),
  initTunnelManager(),
]).then(() => {
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
