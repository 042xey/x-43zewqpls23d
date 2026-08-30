import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db/migrate";
import { db, adminUsersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import dns from "node:dns";
import { pool } from "@workspace/db";
import type { Server } from "node:http";
import {
  migrateConfigSecrets,
  migrateTokenSecrets,
  validateConfigEncryptionKey,
} from "@workspace/db/secure-config";

// Some deployment networks advertise IPv6 without providing a working route.
// Prefer IPv4 for outbound Cloudflare API requests in those environments.
dns.setDefaultResultOrder("ipv4first");

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const routePrefix = process.env["ADMIN_ROUTE_PREFIX"]?.trim();
if (!routePrefix || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(routePrefix)) {
  throw new Error("ADMIN_ROUTE_PREFIX must contain lowercase letters, numbers, and single hyphens only.");
}
if (process.env.NODE_ENV === "production" && process.env["ADMIN_BOOTSTRAP_TOKEN"] && !process.env["ADMIN_BOOTSTRAP_TOKEN_EXPIRES_AT"]) {
  throw new Error("ADMIN_BOOTSTRAP_TOKEN_EXPIRES_AT is required when ADMIN_BOOTSTRAP_TOKEN is configured in production.");
}
validateConfigEncryptionKey();

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutdown requested");
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

if (process.env["RUN_MIGRATIONS_ON_STARTUP"] !== "false") {
  await runMigrations();
  await migrateConfigSecrets();
  await migrateTokenSecrets();
} else {
  logger.info("Startup migrations disabled; schema must be managed by the release job");
}

const [{ count: adminCount }] = await db
  .select({ count: sql<number>`count(*)` })
  .from(adminUsersTable);

if (Number(adminCount) === 0 && !process.env["ADMIN_BOOTSTRAP_TOKEN"]) {
  logger.error(
    "No admin account exists and ADMIN_BOOTSTRAP_TOKEN is not set. Set it before starting the admin server.",
  );
  process.exit(1);
}

const server: Server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Admin server listening");
});

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
