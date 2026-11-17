-- Retain meeting and attendance decisions while removing free-text reasons
-- written by, or attached to attendance for, an erased member.
create or replace function public.redact_member_meeting_audit_reasons_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meeting_events event
  set reason = '[Reason removed after account deletion]'
  where event.actor_id = old.id
    and event.reason is not null;

  update public.attendance_events event
  set reason = '[Reason removed after account deletion]'
  where (event.actor_id = old.id or event.user_id = old.id)
    and event.reason is not null;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_member_meeting_audit_reasons_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_meeting_audit_reason_redaction on auth.users;
create trigger on_auth_user_meeting_audit_reason_redaction
  before delete on auth.users
  for each row execute function public.redact_member_meeting_audit_reasons_before_auth_deletion();

drop trigger if exists on_auth_user_meeting_audit_reason_soft_redaction on auth.users;
create trigger on_auth_user_meeting_audit_reason_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_meeting_audit_reasons_before_auth_deletion();

create index if not exists meeting_events_actor_idx
  on public.meeting_events (actor_id) where actor_id is not null;

create index if not exists attendance_events_actor_idx
  on public.attendance_events (actor_id);

create index if not exists attendance_events_user_idx
  on public.attendance_events (user_id);
