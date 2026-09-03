#!/bin/sh
set -eu

service=${1:-}
env_file=${ENV_FILE:-.env.local}

case "$service" in
  api) entrypoint="artifacts/api-server/dist/index.mjs" ;;
  admin) entrypoint="artifacts/Admin-p/admin-server/dist/index.mjs" ;;
  *)
    printf '%s\n' "Usage: $0 api|admin" >&2
    exit 2
    ;;
esac

if [ ! -f "$env_file" ]; then
  printf '%s\n' "Secret environment file not found: $env_file" >&2
  exit 1
fi

mode=$(stat -c '%a' "$env_file")
if [ $((mode % 10)) -ne 0 ] || [ $(((mode / 10) % 10)) -ne 0 ]; then
  printf '%s\n' "$env_file must not be readable by group or other users" >&2
  exit 1
fi

set -a
. "$env_file"
set +a

: "${DATABASE_URL:?DATABASE_URL must be set in $env_file}"
: "${CONFIG_ENCRYPTION_KEY:?CONFIG_ENCRYPTION_KEY must be set in $env_file}"
: "${PORT:?PORT must be set in $env_file}"

if [ "$service" = "admin" ]; then
  : "${ADMIN_ROUTE_PREFIX:?ADMIN_ROUTE_PREFIX must be set in $env_file}"
else
  : "${CORS_ORIGINS:?CORS_ORIGINS must be set in $env_file}"
fi

exec node --enable-source-maps "$entrypoint"
