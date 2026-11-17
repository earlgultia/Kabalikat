-- Preserve published safety guidance and patrol outcomes while removing
-- account-authored free text from patrol and safety audit records.
create or replace function public.redact_member_safety_operation_notes_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.patrol_shift_logs log_entry
  set location_note = case when log_entry.location_note = '' then ''
        else '[Location note removed after account deletion]' end,
      details = case when log_entry.details = '' then ''
        else '[Patrol note removed after account deletion]' end
  where log_entry.actor_id = old.id;

  update public.patrol_shifts shift
  set cancellation_note = '[Cancellation reason removed after account deletion]'
  where shift.status = 'cancelled'
    and shift.cancellation_note is not null
    and exists (
      select 1 from public.patrol_shift_logs log_entry
      where log_entry.shift_id = shift.id
        and log_entry.entry_type = 'shift_cancelled'
        and log_entry.actor_id = old.id
    );

  update public.disaster_advisory_events event
  set note = case when event.note = '' then ''
    else '[Advisory note removed after account deletion]' end
  where event.actor_id = old.id;

  update public.disaster_advisories advisory
  set resolution_note = '[Resolution note removed after account deletion]'
  where advisory.resolved_by = old.id and advisory.status = 'resolved';

  update public.disaster_emergency_resource_events event
  set note = case when event.note = '' then ''
    else '[Resource note removed after account deletion]' end
  where event.actor_id = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_member_safety_operation_notes_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_safety_operation_note_redaction on auth.users;
create trigger on_auth_user_safety_operation_note_redaction
  before delete on auth.users
  for each row execute function public.redact_member_safety_operation_notes_before_auth_deletion();

drop trigger if exists on_auth_user_safety_operation_note_soft_redaction on auth.users;
create trigger on_auth_user_safety_operation_note_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_safety_operation_notes_before_auth_deletion();

create index if not exists patrol_shift_logs_actor_idx
  on public.patrol_shift_logs (actor_id);

create index if not exists disaster_advisory_events_actor_idx
  on public.disaster_advisory_events (actor_id);

create index if not exists disaster_emergency_resource_events_actor_idx
  on public.disaster_emergency_resource_events (actor_id);
