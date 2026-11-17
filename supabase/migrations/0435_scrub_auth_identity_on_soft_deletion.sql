-- Supabase Auth may soft-delete an account by setting deleted_at while keeping
-- its auth.users row. Remove the remaining login/contact metadata at that point.
-- The old email is already used by the erasure trigger to revoke addressed invites
-- and by the removal workflow's audit snapshot before this trigger runs.
create or replace function public.scrub_auth_identity_on_soft_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    new.email := ('deleted+' || replace(old.id::text, '-', '') || '@erased.invalid')::extensions.citext;
    new.phone := null;
    new.raw_user_meta_data := '{}'::jsonb;
  end if;

  return new;
end;
$$;

revoke all on function public.scrub_auth_identity_on_soft_deletion()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_scrub_identity_on_soft_deletion on auth.users;
create trigger on_auth_user_scrub_identity_on_soft_deletion
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.scrub_auth_identity_on_soft_deletion();
