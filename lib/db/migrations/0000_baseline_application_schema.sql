do $$
begin
  if not exists (select 1 from pg_type where typname = 'device_code_status') then
    create type device_code_status as enum ('POLLING', 'SUCCESS', 'EXPIRED');
  end if;
end $$;

create table if not exists device_codes (
  id serial not null,
  user_code text primary key,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  client_id text not null,
  last_polled_at timestamptz,
  status device_code_status not null default 'POLLING'
);

create table if not exists active_access_tokens (
  id serial primary key,
  issued timestamptz not null,
  expires timestamptz not null,
  "user" text not null,
  scopes text not null,
  access_token text not null,
  resource text not null,
  client_id text not null
);

create table if not exists active_refresh_tokens (
  id serial primary key,
  stored_at timestamptz not null default now(),
  "user" text not null,
  resource text not null,
  client_id text not null,
  foci text,
  refresh_token text,
  last_refreshed_at timestamptz,
  next_refresh_at timestamptz
);

create table if not exists proxy_urls (
  id serial primary key,
  url text not null,
  added_at timestamptz not null default now()
);

create table if not exists app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
