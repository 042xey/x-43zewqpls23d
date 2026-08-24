create table if not exists admin_users (
  id serial primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id serial primary key,
  user_id integer not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
