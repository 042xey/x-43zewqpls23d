# Priority 6 Database Hardening

## Pool controls

The application pool has explicit defaults and supports these environment overrides:

- `DB_POOL_MAX` (10)
- `DB_CONNECTION_TIMEOUT_MS` (5000)
- `DB_IDLE_TIMEOUT_MS` (30000)
- `DB_STATEMENT_TIMEOUT_MS` (30000)
- `DB_QUERY_TIMEOUT_MS` (35000)
- `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (60000)

`connectionTimeoutMillis` bounds connection acquisition/establishment. Queries that
wait beyond the pool capacity are surfaced by `waitingCount` and fail once the
client/query timeout is reached; callers must not hold a transaction while doing
external work.

## Migrations

Migration files are immutable after application. `app_migrations.checksum` stores a
SHA-256 checksum and startup migration execution fails if an applied file changes.
Create a new numbered migration instead of editing an applied file. For safer
deployments, run `runMigrations()` from a one-shot release job before starting the
web services, then set `RUN_MIGRATIONS_ON_STARTUP=false` in the web services.
The one-shot release command is `pnpm --filter @workspace/scripts run migrate`.

## Cleanup indexes and plans

Cleanup paths are indexed by expiry, status/generated time, and refresh-token
invalidated/expiry fields. Verify plans on a representative database with:

```sql
explain (analyze, buffers) delete from admin_sessions where expires_at <= now();
explain (analyze, buffers) delete from device_codes where expires_at <= now();
explain (analyze, buffers) delete from active_access_tokens where expires <= now();
explain (analyze, buffers) delete from active_refresh_tokens
  where invalidated_at is not null or refresh_token_expires_at <= now();
```

Run the statements in a transaction that is rolled back, or replace `delete` with
the equivalent `select` predicate when validating production plans.

## Least privilege

The runtime role should be a `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE` role
with `USAGE` on the application schema and only `SELECT`, `INSERT`, `UPDATE`, and
`DELETE` on application tables. Migration DDL should run with a separate release
role that owns the schema. Verify the runtime role with:

```sh
DATABASE_URL='postgresql://...' APP_DB_ROLE='app_runtime' \
  sh scripts/verify-postgres-role.sh
```

Do not grant the runtime role ownership, `CREATE` on the public schema, `TEMP`
unless required by the driver, or access to backup storage.
