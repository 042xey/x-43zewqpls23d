create table if not exists webhook_subscriptions (
  id serial primary key,
  subscription_id text not null unique,
  user_id text not null,
  mailbox text not null,
  resource text not null,
  expiration_date_time timestamptz not null,
  client_state text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_renewed_at timestamptz
);

create index if not exists webhook_subscriptions_active_idx on webhook_subscriptions (active);
create index if not exists webhook_subscriptions_expiration_idx on webhook_subscriptions (expiration_date_time);
create index if not exists webhook_subscriptions_mailbox_idx on webhook_subscriptions (mailbox);