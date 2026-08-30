create table if not exists audit_events (
  id serial primary key,
  actor_user_id integer,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_at_idx on audit_events (created_at);
create index if not exists audit_events_action_idx on audit_events (action);
