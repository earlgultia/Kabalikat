-- Keep review decisions and their dates while removing personal free text
-- authored by a reviewer whose account is being erased.
create or replace function public.redact_member_review_notes_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.residency_verifications verification
  set reason = null
  where verification.verified_by = old.id;

  update public.document_requests request
  set rejection_reason = case when request.status = 'rejected'
    then 'Review note removed after account deletion' else null end
  where request.reviewed_by = old.id;

  update public.committee_task_due_date_requests request
  set decision_note = '[Review note removed after account deletion]'
  where request.reviewed_by = old.id;

  update public.meeting_attendance_correction_requests request
  set review_note = null
  where request.reviewed_by = old.id;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_member_review_notes_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_member_review_note_redaction on auth.users;
create trigger on_auth_user_member_review_note_redaction
  before delete on auth.users
  for each row execute function public.redact_member_review_notes_before_auth_deletion();

drop trigger if exists on_auth_user_member_review_note_soft_redaction on auth.users;
create trigger on_auth_user_member_review_note_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_review_notes_before_auth_deletion();

create index if not exists residency_verifications_reviewer_idx
  on public.residency_verifications (verified_by) where verified_by is not null;

create index if not exists document_requests_reviewer_idx
  on public.document_requests (reviewed_by) where reviewed_by is not null;

create index if not exists committee_task_due_date_requests_reviewer_idx
  on public.committee_task_due_date_requests (reviewed_by) where reviewed_by is not null;

create index if not exists meeting_attendance_correction_requests_reviewer_idx
  on public.meeting_attendance_correction_requests (reviewed_by) where reviewed_by is not null;
