-- Keyword alerts gain a scope describing which mail they apply to:
--   incoming -> newly arriving mail (the admin panel's incoming watcher)
--   existing -> on-demand scan of already-stored mail (Khdyxail UI)
--   both     -> either
do $$
begin
  create type alert_scope as enum ('incoming', 'existing', 'both');
exception
  when duplicate_object then null;
end $$;

alter table keyword_alerts
  add column if not exists scope alert_scope not null default 'incoming';

create index if not exists keyword_alerts_scope_idx
  on keyword_alerts (scope);
