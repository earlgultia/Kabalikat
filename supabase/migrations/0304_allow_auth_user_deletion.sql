-- Allow Auth accounts to be deleted without removing operational/audit records.
-- A profile row remains as an anonymized tombstone because many historical
-- records intentionally reference public.profiles(id) with ON DELETE RESTRICT.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

create or replace function public.handle_auth_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Auth deletion removes the ability to sign in. Revoke tenant access as well
  -- so a retained profile can never keep active membership permissions.
  update public.barangay_memberships
  set status = 'revoked'
  where user_id = old.id
    and status <> 'revoked';

  delete from public.membership_permissions permissions
  using public.barangay_memberships membership
  where permissions.membership_id = membership.id
    and membership.user_id = old.id;

  delete from public.platform_administrators
  where user_id = old.id;

  update public.invitations
  set status = 'revoked'
  where status = 'pending'
    and old.email is not null
    and lower(invited_email::text) = lower(old.email::text);

  update public.profiles
  set display_name = 'Deleted account',
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = old.id;

  return old;
end;
$$;

revoke all on function public.handle_auth_user_deletion() from public, anon, authenticated;

drop trigger if exists on_auth_user_deleting_cleanup on auth.users;
create trigger on_auth_user_deleting_cleanup
  before delete on auth.users
  for each row execute function public.handle_auth_user_deletion();
