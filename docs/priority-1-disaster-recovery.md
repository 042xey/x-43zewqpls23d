# Priority 1: Backup and Disaster Recovery

This runbook applies to the Railway PostgreSQL service used by the API and
admin services.

## Recovery objectives

| Objective | Target | Measure |
| --- | --- | --- |
| Recovery point objective (RPO) | 24 hours | Maximum accepted data loss with the daily backup schedule |
| Recovery time objective (RTO) | 60 minutes | From incident declaration to a verified application using the restored database |
| Restore drill | Quarterly and after material schema changes | Record the backup timestamp, restore duration, migration result, and smoke-test result |

The daily schedule is the minimum required to meet the RPO. If the business
requires less than 24 hours of data loss, use an external PostgreSQL backup
provider with WAL archiving or a managed PostgreSQL service that explicitly
supports point-in-time recovery (PITR). Railway volume backups are snapshots,
not WAL/PITR, and cannot restore to an arbitrary timestamp.

## Railway configuration

An operator must configure the PostgreSQL service in the production Railway
environment:

1. Open the PostgreSQL service and its **Backups** settings.
2. Enable **Daily**, **Weekly**, and **Monthly** schedules.
3. Confirm the resulting retention: daily backups for 6 days, weekly backups
   for 1 month, and monthly backups for 3 months.
4. Create one manual backup before every destructive migration or recovery
   exercise.
5. Record the latest successful backup timestamp in the operational log.

Railway restores a volume backup only into the same project and environment.
For an isolated restore drill, provision a separate PostgreSQL instance or
use an approved external PostgreSQL environment. Never restore over the
production database during a drill.

PITR is **not available from Railway volume backups**. This is an explicit
control gap, not an application setting. Escalate to a provider with PITR/WAL
archiving before changing the RPO below 24 hours.

## Backup credential isolation

- Application services use their normal Railway `DATABASE_URL` only at runtime.
- Scheduled logical backups must use a dedicated least-privilege backup role,
  not the application or Railway project owner credential.
- Store the backup connection string in an external secret manager or a
  dedicated backup job's secret store. Do not add it to this repository, the
  API service variables, or the admin service variables.
- Store backup artifacts outside the primary database volume and outside the
  application deployment environment. Use an isolated backup project/bucket
  with encryption, access logging, and restricted restore permissions.
- Rotate the backup credential independently of `DATABASE_URL` and test that
  application credentials cannot read or delete backup artifacts.

## Logical backup

The following command creates an encrypted-at-rest-storage-compatible custom
format dump without embedding credentials in the output. Run it from a
controlled operator or backup environment, never from an application
container:

```sh
SOURCE_DATABASE_URL='postgresql://...' \
  BACKUP_FILE='/secure-backup-path/app-$(date -u +%Y%m%dT%H%M%SZ).dump' \
  sh scripts/backup-postgres.sh
```

The backup file must be uploaded to the isolated backup store immediately,
with its generated SHA-256 checksum recorded separately. The local file should
then be removed from the operator host according to the organization's secret
handling policy.

## Restore drill

1. Select a known-good Railway snapshot or logical dump and record its UTC
   timestamp.
2. Provision an empty, isolated PostgreSQL instance with a separate
   connection string.
3. Restore the dump using the guarded script below. The script requires an
   explicit isolation confirmation and does not use `--clean`.

```sh
RESTORED_DATABASE_URL='postgresql://isolated-instance...' \
  BACKUP_FILE='/secure-backup-path/app-20260828T000000Z.dump' \
  CONFIRM_ISOLATED_RESTORE=YES \
  sh scripts/restore-postgres-verify.sh
```

4. Build the services and start one service at a time with the restored
   `DATABASE_URL`, the same non-production `CONFIG_ENCRYPTION_KEY`, and
   disposable provider credentials. The API and admin processes run migrations
   before listening, so a successful startup verifies migration compatibility.
5. Check `/api/readyz`, authenticate the admin health endpoint if applicable,
   and run the minimum read/write smoke test against the isolated instance.
6. Record restore duration and results against the RTO. Destroy the isolated
   instance and revoke its credentials after the drill.

Do not copy production OAuth tokens, tunnel tokens, API keys, or session
secrets into the isolated environment. The application startup migration may
encrypt legacy rows; use a disposable encryption key and disposable restored
credentials for drills.

## Migration rollback and recovery

Migrations in `lib/db/migrations` are applied in filename order and tracked in
`app_migrations`. They are forward-only; do not edit an applied migration.

Before a production migration:

1. Verify a recent scheduled backup exists and create a manual backup.
2. Run the migration against an isolated restore and start both services
   against it.
3. Deploy the application version that expects the new schema.

If the migration or deployment fails:

1. Stop writes or place the application in maintenance mode.
2. Preserve logs and identify the last successful backup timestamp.
3. Roll back the application deployment only when the previous version is
   compatible with the changed schema.
4. If the schema itself must be rolled back, restore the selected backup into
   a new isolated PostgreSQL instance, validate startup and smoke tests, then
   promote it using the provider's reviewed staged change process.
5. Do not overwrite or delete the original database until the restored
   instance is verified and the incident owner approves the cutover.
6. Reconcile data written after the backup from application logs or an
   explicitly approved recovery procedure. Snapshot restore alone cannot
   recover writes after the snapshot timestamp.

## Evidence required for Priority 1 sign-off

- Screenshot or export showing Daily, Weekly, and Monthly schedules enabled on
  the production PostgreSQL volume.
- Backup retention and latest-success timestamp.
- Decision recorded that Railway volume snapshots do not provide PITR, or
  evidence of an external PITR/WAL archive if a lower RPO is required.
- Restore-drill log showing isolated restore, service startup, readiness check,
  smoke test, duration, and cleanup.
- Confirmation that the backup credential and backup storage are isolated from
  application deployment variables and primary database credentials.
