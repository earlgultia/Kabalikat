-- Supabase Auth soft deletion updates auth.users.deleted_at instead of
-- deleting the row. Apply the same safeguards and cleanup to that path.
create or replace function public.handle_auth_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(7306026::bigint);

  if exists (
    select 1
    from public.barangay_memberships target_membership
    join public.role_definitions target_role
      on target_role.id = target_membership.role_id
     and target_role.key = 'captain'
    where target_membership.user_id = old.id
      and (
        target_membership.status = 'active'
        or exists (
          select 1
          from public.platform_account_removal_events pending_removal
          where pending_removal.target_user_id = old.id
            and pending_removal.completed_at is null
        )
      )
      and not exists (
        select 1
        from public.barangay_memberships remaining_membership
        join public.role_definitions remaining_role
          on remaining_role.id = remaining_membership.role_id
         and remaining_role.key = 'captain'
        where remaining_membership.barangay_id = target_membership.barangay_id
          and remaining_membership.user_id <> old.id
          and remaining_membership.status = 'active'
      )
  ) then
    raise exception 'Cannot delete this account because it is the only active Captain for a barangay. Assign another active Captain first.';
  end if;

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

  update public.barangay_memberships membership
  set status = case
        -- Keep an interrupted staged removal visible to the platform retry UI.
        -- The Auth identity is disabled and permissions are removed below.
        when exists (
          select 1
          from public.platform_account_removal_events pending_removal
          where pending_removal.target_user_id = old.id
            and pending_removal.completed_at is null
        ) then 'suspended'
        else 'revoked'
      end
  where membership.user_id = old.id
    and membership.status <> 'revoked';

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

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

revoke all on function public.handle_auth_user_deletion() from public, anon, authenticated;

drop trigger if exists on_auth_user_soft_deleting_cleanup on auth.users;
create trigger on_auth_user_soft_deleting_cleanup
  before update of deleted_at on auth.users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.handle_auth_user_deletion();
