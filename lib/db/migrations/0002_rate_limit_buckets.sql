create table if not exists rate_limit_buckets (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
