-- Remove incident resolution and municipal escalation notes written by an
-- erased account, while preserving incident and escalation status/history.
create or replace function public.redact_member_primary_incident_notes_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.incidents incident
  set resolution_note = '[Resolution note removed after account deletion]'
  where incident.status in ('resolved', 'closed')
    and incident.resolution_note is not null
    and exists (
      select 1 from public.incident_events event
      where event.barangay_id = incident.barangay_id
        and event.incident_id = incident.id
        and event.action in ('resolved', 'closed')
        and event.actor_id = old.id
        and not exists (
          select 1 from public.incident_events newer_event
          where newer_event.barangay_id = incident.barangay_id
            and newer_event.incident_id = event.incident_id
            and newer_event.action in ('resolved', 'closed')
            and (newer_event.created_at, newer_event.id) > (event.created_at, event.id)
        )
    );

  update public.lgu_incident_escalations escalation
  set escalation_note = case when escalation.escalated_by = old.id
        then '[Escalation note removed after account deletion]'
        else escalation.escalation_note end,
      lgu_response_note = case when exists (
        select 1 from public.lgu_incident_escalation_events event
        where event.escalation_id = escalation.id
          and event.actor_id = old.id
          and event.action = escalation.status
      ) then '[LGU response removed after account deletion]'
      else escalation.lgu_response_note end
  where escalation.escalated_by = old.id
     or exists (
       select 1 from public.lgu_incident_escalation_events event
       where event.escalation_id = escalation.id
         and event.actor_id = old.id
         and event.action = escalation.status
     );

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_member_primary_incident_notes_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_primary_incident_note_redaction on auth.users;
create trigger on_auth_user_primary_incident_note_redaction
  before delete on auth.users
  for each row execute function public.redact_member_primary_incident_notes_before_auth_deletion();

drop trigger if exists on_auth_user_primary_incident_note_soft_redaction on auth.users;
create trigger on_auth_user_primary_incident_note_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_primary_incident_notes_before_auth_deletion();

create index if not exists lgu_incident_escalations_escalated_by_idx
  on public.lgu_incident_escalations (escalated_by);
