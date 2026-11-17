-- Redact correction-review text by an erased staff member while retaining
-- each resident request's submitted/approved/rejected history.
create or replace function public.redact_member_resident_correction_notes_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.resident_profile_change_requests request
  set review_reason = null
  where request.reviewed_by = old.id;

  update public.resident_profile_change_events event
  set reason = '[Review note removed after account deletion]'
  where event.actor_id = old.id
    and event.reason is not null;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_member_resident_correction_notes_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_resident_correction_note_redaction on auth.users;
create trigger on_auth_user_resident_correction_note_redaction
  before delete on auth.users
  for each row execute function public.redact_member_resident_correction_notes_before_auth_deletion();

drop trigger if exists on_auth_user_resident_correction_note_soft_redaction on auth.users;
create trigger on_auth_user_resident_correction_note_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_resident_correction_notes_before_auth_deletion();

create index if not exists resident_profile_change_requests_reviewer_idx
  on public.resident_profile_change_requests (reviewed_by) where reviewed_by is not null;

create index if not exists resident_profile_change_events_actor_idx
  on public.resident_profile_change_events (actor_id);
