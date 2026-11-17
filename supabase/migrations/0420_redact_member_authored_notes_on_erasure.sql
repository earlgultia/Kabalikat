-- Keep operational history and anonymized authorship while removing free-text
-- content a deleted member may have used to share personal information.
create or replace function public.redact_member_authored_notes_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.barangay_project_update_responses as response
  set content = '[Content removed after account deletion]'
  where response.author_id = old.id;

  update public.committee_task_progress_notes as progress_note
  set note = '[Note removed after account deletion]'
  where progress_note.author_id = old.id;

  update public.committee_task_due_date_requests as due_date_request
  set reason = '[Reason removed after account deletion]'
  where due_date_request.requester_id = old.id;

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

revoke all on function public.redact_member_authored_notes_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_member_note_redaction on auth.users;
create trigger on_auth_user_member_note_redaction
  before delete on auth.users
  for each row execute function public.redact_member_authored_notes_before_auth_deletion();

drop trigger if exists on_auth_user_member_note_soft_redaction on auth.users;
create trigger on_auth_user_member_note_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_authored_notes_before_auth_deletion();
