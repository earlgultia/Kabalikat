-- Keep account-removal audit events but remove free-text reasons associated
-- with an erased target or written by an erased administrator.
create or replace function public.redact_account_removal_reasons_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.platform_account_removal_events removal
  set reason = '[Reason removed after account deletion]'
  where (removal.target_user_id = old.id or removal.actor_id = old.id)
    and removal.reason <> '[Reason removed after account deletion]';

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_account_removal_reasons_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_account_removal_reason_redaction on auth.users;
create trigger on_auth_user_account_removal_reason_redaction
  before delete on auth.users
  for each row execute function public.redact_account_removal_reasons_before_auth_deletion();

drop trigger if exists on_auth_user_account_removal_reason_soft_redaction on auth.users;
create trigger on_auth_user_account_removal_reason_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_account_removal_reasons_before_auth_deletion();

create index if not exists platform_account_removal_events_actor_idx
  on public.platform_account_removal_events (actor_id);
