create table if not exists alert_severity (
  severity text primary key
);
insert into alert_severity (severity) values ('critical'), ('high'), ('medium'), ('low')
on conflict do nothing;

create table if not exists alert_mode (
  mode text primary key
);
insert into alert_mode (mode) values ('exact'), ('phrase'), ('contains'), ('regex')
on conflict do nothing;

create table if not exists alert_logic (
  logic text primary key
);
insert into alert_logic (logic) values ('any'), ('all'), ('advanced')
on conflict do nothing;

create table if not exists keyword_alerts (
  id serial primary key,
  name text not null,
  description text not null default '',
  severity text not null default 'medium' references alert_severity(severity),
  enabled boolean not null default true,
  keywords jsonb not null default '[]'::jsonb,
  mode text not null default 'phrase' references alert_mode(mode),
  logic text not null default 'any' references alert_logic(logic),
  case_sensitive boolean not null default false,
  mailbox text not null default 'All controlled mailboxes',
  folder text not null default 'Inbox',
  sender_pattern text not null default '',
  recipient_pattern text not null default '',
  subject_pattern text not null default '',
  body_pattern text not null default '',
  attachment_pattern text not null default '',
  channels jsonb not null default '["in-app"]'::jsonb,
  sysadmin_email text not null default '',
  telegram_bot text not null default '',
  cooldown integer not null default 30,
  match_count integer not null default 0,
  last_match timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists keyword_alerts_enabled_idx on keyword_alerts (enabled);
create index if not exists keyword_alerts_severity_idx on keyword_alerts (severity);
create index if not exists keyword_alerts_created_at_idx on keyword_alerts (created_at desc);

create table if not exists alert_events (
  id serial primary key,
  alert_id integer not null references keyword_alerts(id) on delete cascade,
  alert_name text not null,
  subject text not null default '',
  sender text not null default '',
  mailbox text not null default '',
  matched text not null default '',
  timestamp timestamptz not null default now(),
  channel text not null default 'in-app',
  created_at timestamptz not null default now()
);

create index if not exists alert_events_alert_id_idx on alert_events (alert_id);
create index if not exists alert_events_created_at_idx on alert_events (created_at desc);