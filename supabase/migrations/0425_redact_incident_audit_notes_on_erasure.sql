-- Keep emergency incident and escalation records intact while removing
-- optional event notes authored by an erased account.
create or replace function public.redact_member_incident_audit_notes_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.incident_events event
  set note = '[Incident note removed after account deletion]'
  where event.actor_id = old.id
    and event.note <> '';

  update public.lgu_incident_escalation_events event
  set note = '[Escalation note removed after account deletion]'
  where event.actor_id = old.id
    and event.note <> '';

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_member_incident_audit_notes_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_incident_audit_note_redaction on auth.users;
create trigger on_auth_user_incident_audit_note_redaction
  before delete on auth.users
  for each row execute function public.redact_member_incident_audit_notes_before_auth_deletion();

drop trigger if exists on_auth_user_incident_audit_note_soft_redaction on auth.users;
create trigger on_auth_user_incident_audit_note_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_incident_audit_notes_before_auth_deletion();

create index if not exists incident_events_actor_idx
  on public.incident_events (actor_id);

create index if not exists lgu_incident_escalation_events_actor_idx
  on public.lgu_incident_escalation_events (actor_id);
