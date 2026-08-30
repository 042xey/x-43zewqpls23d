import { pool } from "@workspace/db";
import { runMigrations } from "@workspace/db/migrate";
import { migrateConfigSecrets, migrateTokenSecrets } from "@workspace/db/secure-config";

try {
  await runMigrations();
  await migrateConfigSecrets();
  await migrateTokenSecrets();
} finally {
  await pool.end();
}
