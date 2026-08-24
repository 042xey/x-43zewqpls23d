import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db } from "./index";

const migrationsDir = process.env["MIGRATIONS_DIR"] ?? fileURLToPath(new URL("../../../../lib/db/migrations/", import.meta.url));

export async function runMigrations(): Promise<void> {
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(81427390)`);
    await tx.execute(sql`create table if not exists app_migrations (name text primary key, applied_at timestamptz not null default now())`);

    for (const file of files) {
      const applied = await tx.execute(sql`select name from app_migrations where name = ${file}`);
      if (applied.rows.length > 0) continue;
      const contents = await readFile(path.join(migrationsDir, file), "utf8");
      await tx.execute(sql.raw(contents));
      await tx.execute(sql`insert into app_migrations (name) values (${file})`);
    }
  });
}
