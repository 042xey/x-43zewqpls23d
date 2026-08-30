#!/bin/sh
set -eu

umask 077

: "${RESTORED_DATABASE_URL:?RESTORED_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${CONFIRM_ISOLATED_RESTORE:?Set CONFIRM_ISOLATED_RESTORE=YES}"

if [ "$CONFIRM_ISOLATED_RESTORE" != YES ]; then
  printf '%s\n' 'Refusing restore without CONFIRM_ISOLATED_RESTORE=YES' >&2
  exit 1
fi

[ -f "$BACKUP_FILE" ] || {
  printf 'Backup file does not exist: %s\n' "$BACKUP_FILE" >&2
  exit 1
}

command -v pg_restore >/dev/null 2>&1 || {
  printf '%s\n' 'pg_restore is required' >&2
  exit 1
}
command -v psql >/dev/null 2>&1 || {
  printf '%s\n' 'psql is required' >&2
  exit 1
}

pg_restore \
  --dbname="$RESTORED_DATABASE_URL" \
  --exit-on-error \
  --no-owner \
  --no-acl \
  "$BACKUP_FILE"

psql \
  --dbname="$RESTORED_DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --command='select current_database(), current_user; select count(*) as migration_count from app_migrations; select count(*) as config_count from app_config;'

printf '%s\n' 'Isolated restore completed and core tables were verified.'
