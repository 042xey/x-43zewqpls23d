do $$
declare
  table_owner text;
  missing_columns integer;
begin
  select pg_get_userbyid(relowner)
    into table_owner
    from pg_class
   where relname = 'active_refresh_tokens'
     and relkind = 'r';

  if table_owner = current_user then
    alter table active_refresh_tokens
      add column if not exists refresh_token_expires_at timestamptz;

    alter table active_refresh_tokens
      add column if not exists invalidated_at timestamptz;

    alter table active_refresh_tokens
      add column if not exists invalid_reason text;

    update active_refresh_tokens
    set refresh_token_expires_at = stored_at + interval '90 days'
    where refresh_token is not null
      and refresh_token_expires_at is null;

    create index if not exists active_refresh_tokens_expiry_idx
      on active_refresh_tokens (refresh_token_expires_at);

    create index if not exists active_refresh_tokens_invalidated_idx
      on active_refresh_tokens (invalidated_at);
  else
    select count(*)
      into missing_columns
      from (values
        ('refresh_token_expires_at'),
        ('invalidated_at'),
        ('invalid_reason')
      ) as required(column_name)
     where not exists (
       select 1
         from information_schema.columns AS c
        where c.table_schema = current_schema()
          and c.table_name = 'active_refresh_tokens'
          and c.column_name = required.column_name
     );

    if missing_columns > 0 then
      raise exception 'active_refresh_tokens is owned by %, and required retention columns are missing; run migration as the table owner', table_owner;
    end if;
  end if;
end $$;
