#!/bin/sh
set -eu

umask 077

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

command -v pg_dump >/dev/null 2>&1 || {
  printf '%s\n' 'pg_dump is required' >&2
  exit 1
}

case "$BACKUP_FILE" in
  */*) backup_dir=${BACKUP_FILE%/*} ;;
  *) backup_dir=. ;;
esac

if [ ! -d "$backup_dir" ]; then
  printf 'Backup directory does not exist: %s\n' "$backup_dir" >&2
  exit 1
fi

if [ -e "$BACKUP_FILE" ]; then
  printf 'Refusing to overwrite existing backup: %s\n' "$BACKUP_FILE" >&2
  exit 1
fi

pg_dump \
  --dbname="$SOURCE_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$BACKUP_FILE"

sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
printf 'Created backup and checksum: %s\n' "$BACKUP_FILE"
