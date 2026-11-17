-- A staff-authored feedback response can contain personal information too.
-- Keep the response event and status, replacing only its free text.
create or replace function public.redact_member_feedback_responses_before_auth_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.community_feedback feedback
  set staff_response = 'Response removed after account deletion.',
      updated_at = now()
  where feedback.responded_by = old.id
    and feedback.staff_response is not null;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.redact_member_feedback_responses_before_auth_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_feedback_response_redaction on auth.users;
create trigger on_auth_user_feedback_response_redaction
  before delete on auth.users
  for each row execute function public.redact_member_feedback_responses_before_auth_deletion();

drop trigger if exists on_auth_user_feedback_response_soft_redaction on auth.users;
create trigger on_auth_user_feedback_response_soft_redaction
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.redact_member_feedback_responses_before_auth_deletion();

create index if not exists community_feedback_responder_idx
  on public.community_feedback (responded_by) where responded_by is not null;
