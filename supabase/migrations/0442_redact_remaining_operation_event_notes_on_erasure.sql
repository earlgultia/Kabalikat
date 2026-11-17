-- Keep operational event records while removing free text authored by an
-- erased account from project, event, subscription, and document histories.
create or replace function public.redact_operation_event_notes_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.committee_events event
  set details = '[Details removed after account deletion]'
  where event.actor_id = old.id and event.details <> '';

  update public.sk_project_events event
  set details = '[Details removed after account deletion]'
  where event.actor_id = old.id and event.details <> '';

  update public.barangay_project_events event
  set details = '[Details removed after account deletion]'
  where event.actor_id = old.id and event.details <> '';

  update public.health_outreach_events event
  set note = '[Note removed after account deletion]'
  where event.actor_id = old.id and event.note <> '';

  update public.sk_event_events event
  set note = '[Note removed after account deletion]'
  where event.actor_id = old.id and event.note <> '';

  update public.subscription_events event
  set note = '[Note removed after account deletion]'
  where event.actor_id = old.id and event.note <> '';

  update public.issued_document_events event
  set reason = '[Reason removed after account deletion]'
  where event.actor_id = old.id;

  update public.platform_lgu_workspace_status_events event
  set reason = '[Reason removed after account deletion]'
  where event.actor_id = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_operation_event_notes_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_operation_event_note_redaction on auth.users;
create trigger on_auth_user_operation_event_note_redaction
  before delete on auth.users
  for each row execute function public.redact_operation_event_notes_before_auth_deletion();

drop trigger if exists on_auth_user_operation_event_note_soft_redaction on auth.users;
create trigger on_auth_user_operation_event_note_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_operation_event_notes_before_auth_deletion();
