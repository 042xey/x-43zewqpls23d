create table if not exists sso_codes (
  id serial primary key,
  code text not null unique,
  assertion text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);