-- Keep document request status history while removing free-text reasons
-- entered by the account being erased.
create or replace function public.redact_document_request_event_reasons_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.document_request_events event
  set reason = '[Reason removed after account deletion]'
  where event.actor_id = old.id
    and event.reason is not null;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_document_request_event_reasons_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_document_request_event_reason_redaction on auth.users;
create trigger on_auth_user_document_request_event_reason_redaction
  before delete on auth.users
  for each row execute function public.redact_document_request_event_reasons_before_auth_deletion();

drop trigger if exists on_auth_user_document_request_event_reason_soft_redaction on auth.users;
create trigger on_auth_user_document_request_event_reason_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_document_request_event_reasons_before_auth_deletion();
