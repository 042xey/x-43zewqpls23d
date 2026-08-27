do $$
begin
  if exists (
    select 1 from pg_class
    where relname = 'admin_sessions'
      and pg_get_userbyid(relowner) = current_user
  ) then
    create index if not exists admin_sessions_expires_at_idx
      on admin_sessions (expires_at);
  end if;

  if exists (
    select 1 from pg_class
    where relname = 'device_codes'
      and pg_get_userbyid(relowner) = current_user
  ) then
    create index if not exists device_codes_expires_at_idx
      on device_codes (expires_at);
  end if;

  if exists (
    select 1 from pg_class
    where relname = 'active_access_tokens'
      and pg_get_userbyid(relowner) = current_user
  ) then
    create index if not exists active_access_tokens_expires_idx
      on active_access_tokens (expires);
  end if;

  if exists (
    select 1 from pg_class
    where relname = 'rate_limit_buckets'
      and pg_get_userbyid(relowner) = current_user
  ) then
    create index if not exists rate_limit_buckets_reset_at_idx
      on rate_limit_buckets (reset_at);
  end if;
end $$;
