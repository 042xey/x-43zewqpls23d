-- Link each captured refresh token to the device code that produced it.
--
-- Before this column, admin session views reconstructed the device-code <->
-- refresh-token association heuristically (same client_id, nearest timestamp),
-- which misattributed tokens when several flows ran for one app. With an
-- explicit link the admin API can join exactly.
--
-- Existing rows keep a NULL user_code: the original association cannot be
-- recovered reliably, so pre-migration records are shown as unlinked rather
-- than guessed.
alter table active_refresh_tokens
  add column if not exists user_code text;

create index if not exists active_refresh_tokens_user_code_idx
  on active_refresh_tokens (user_code);
