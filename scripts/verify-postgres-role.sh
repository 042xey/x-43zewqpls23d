#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${APP_DB_ROLE:?APP_DB_ROLE is required}"

psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --set=app_role="$APP_DB_ROLE" <<'SQL'
select current_user;
select rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin
from pg_roles
where rolname = :'app_role';

select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = :'app_role'
  and table_schema = current_schema()
order by table_name, privilege_type;
SQL
