-- Preserve access to platform administration when Auth accounts are deleted.
-- Other accounts continue through the cleanup behavior introduced in 0304.
create or replace function public.handle_auth_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.platform_administrators administrator
    where administrator.user_id = old.id
  ) and not exists (
    select 1
    from public.platform_administrators another_administrator
    where another_administrator.user_id <> old.id
  ) then
    raise exception 'Cannot delete the last platform administrator. Provision another administrator first.';
  end if;

  -- Auth deletion removes the ability to sign in. Revoke tenant access as well
  -- so a retained profile cannot keep active membership permissions.
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
