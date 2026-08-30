import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: positiveInteger("DB_POOL_MAX", 10),
  connectionTimeoutMillis: positiveInteger("DB_CONNECTION_TIMEOUT_MS", 5_000),
  idleTimeoutMillis: positiveInteger("DB_IDLE_TIMEOUT_MS", 30_000),
  statement_timeout: positiveInteger("DB_STATEMENT_TIMEOUT_MS", 30_000),
  query_timeout: positiveInteger("DB_QUERY_TIMEOUT_MS", 35_000),
  idle_in_transaction_session_timeout: positiveInteger("DB_IDLE_IN_TRANSACTION_TIMEOUT_MS", 60_000),
});
pool.on("error", () => {
  // Pool errors are counted without exposing connection details in logs.
  import("./metrics").then(({ recordDbMetric }) => recordDbMetric("db_connection_errors_total"));
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./metrics";
