-- Revoke any still-live QR attendance codes created by an erased account.
-- Token rows remain as audit history, but can no longer authorize check-in.
create or replace function public.revoke_erased_member_attendance_tokens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meeting_attendance_tokens token
  set revoked_at = coalesce(token.revoked_at, pg_catalog.now())
  where token.created_by = old.id
    and token.revoked_at is null;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

revoke all on function public.revoke_erased_member_attendance_tokens()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_attendance_token_revocation on auth.users;
create trigger on_auth_user_attendance_token_revocation
  before delete on auth.users
  for each row execute function public.revoke_erased_member_attendance_tokens();

drop trigger if exists on_auth_user_attendance_token_soft_revocation on auth.users;
create trigger on_auth_user_attendance_token_soft_revocation
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.revoke_erased_member_attendance_tokens();

create index if not exists meeting_attendance_tokens_creator_erasure_idx
  on public.meeting_attendance_tokens (created_by)
  where revoked_at is null;
