import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db/migrate";
import { db, adminUsersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await runMigrations();

const [{ count: adminCount }] = await db
  .select({ count: sql<number>`count(*)` })
  .from(adminUsersTable);

if (Number(adminCount) === 0 && !process.env["ADMIN_BOOTSTRAP_TOKEN"]) {
  logger.error(
    "No admin account exists and ADMIN_BOOTSTRAP_TOKEN is not set. Set it before starting the admin server.",
  );
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Admin server listening");
});
