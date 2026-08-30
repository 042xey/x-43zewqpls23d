do $$
begin
  if exists (select 1 from pg_class where relname = 'device_codes' and pg_get_userbyid(relowner) = current_user) then
    create index if not exists device_codes_status_generated_idx
      on device_codes (status, generated_at);
  end if;
  if exists (select 1 from pg_class where relname = 'active_refresh_tokens' and pg_get_userbyid(relowner) = current_user) then
    create index if not exists active_refresh_tokens_cleanup_idx
      on active_refresh_tokens (invalidated_at, refresh_token_expires_at);
  end if;
end $$;
