-- A pending removal already has an immutable, audited reason. Allow authorized
-- administrators to retry the Auth deletion without submitting a new reason.
create or replace function public.prepare_platform_captain_account_removal(
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_email text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(7306026::bigint);

  if exists (
    select 1 from public.platform_administrators where user_id = p_user_id
  ) then
    raise exception 'platform administrator accounts cannot be removed here';
  end if;

  -- This is a retry: keep the original event and reason unchanged.
  if exists (
    select 1 from public.platform_account_removal_events where target_user_id = p_user_id
  ) then
    return;
  end if;

  if length(v_reason) not between 3 and 1000 then
    raise exception 'provide a reason for removing this Captain account';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), 'Barangay Captain'),
         coalesce(auth_user.email::text, '')
    into v_name, v_email
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.id = p_user_id;
  if not found then raise exception 'Captain account was not found'; end if;

  if not exists (
    select 1
    from public.barangay_memberships membership
    join public.role_definitions role on role.id = membership.role_id and role.key = 'captain'
    where membership.user_id = p_user_id and membership.status in ('active', 'suspended')
  ) then
    raise exception 'account is not an active or suspended Captain';
  end if;

  if exists (
    select 1
    from public.barangay_memberships target_membership
    join public.role_definitions target_role
      on target_role.id = target_membership.role_id and target_role.key = 'captain'
    where target_membership.user_id = p_user_id
      and target_membership.status = 'active'
      and not exists (
        select 1
        from public.barangay_memberships remaining_membership
        join public.role_definitions remaining_role
          on remaining_role.id = remaining_membership.role_id and remaining_role.key = 'captain'
        where remaining_membership.barangay_id = target_membership.barangay_id
          and remaining_membership.user_id <> p_user_id
          and remaining_membership.status = 'active'
      )
  ) then
    raise exception 'Cannot remove this account because it is the only active Captain for a barangay. Assign another active Captain first.';
  end if;

  insert into public.platform_account_removal_events(target_user_id, actor_id, target_name, target_email, reason)
  values (p_user_id, (select auth.uid()), v_name, v_email, v_reason);

  with changed as (
    update public.barangay_memberships membership
    set status = 'suspended'
    where membership.user_id = p_user_id and membership.status = 'active'
    returning membership.id, membership.barangay_id, membership.role_id
  )
  insert into public.membership_access_events(
    barangay_id, membership_id, actor_id, action, from_role, to_role, from_status, to_status
  )
  select changed.barangay_id, changed.id, (select auth.uid()), 'status_changed', role.key, role.key, 'active', 'suspended'
  from changed join public.role_definitions role on role.id = changed.role_id;

  update public.invitations invitation
  set status = 'revoked'
  where invitation.status = 'pending'
    and lower(invitation.invited_email::text) = lower(v_email);
end;
$$;

revoke all on function public.prepare_platform_captain_account_removal(uuid, text) from public, anon;
grant execute on function public.prepare_platform_captain_account_removal(uuid, text) to authenticated;
