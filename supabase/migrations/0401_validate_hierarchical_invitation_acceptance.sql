-- Re-check the invitation issuer's active authority when an invite is accepted.
-- This prevents stale or manually inserted invitations from bypassing the
-- Super Admin -> LGU -> Captain -> Secretary -> barangay team hierarchy.

create or replace function public.accept_membership_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_membership public.barangay_memberships%rowtype;
  v_user_id uuid := (select auth.uid());
  v_email text := auth.jwt() ->> 'email';
  v_membership_id uuid;
  v_old_role text;
  v_new_role text;
  v_issuer_role text;
  v_lgu_id uuid;
begin
  if v_user_id is null or p_token is null or length(p_token) <> 64 then
    raise exception 'invalid invitation';
  end if;

  select invitation.* into v_invitation
  from public.invitations as invitation
  where invitation.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or lower(v_invitation.invited_email::text) <> lower(coalesce(v_email, '')) then
    raise exception 'invitation is invalid or expired, or its email does not match your signed-in account';
  end if;

  select role.key into strict v_new_role
  from public.role_definitions as role
  where role.id = v_invitation.role_id and role.scope = 'barangay';

  select role.key into v_issuer_role
  from public.barangay_memberships as membership
  join public.role_definitions as role on role.id = membership.role_id
  where membership.user_id = v_invitation.invited_by
    and membership.barangay_id = v_invitation.barangay_id
    and membership.status = 'active';

  if v_new_role = 'captain' then
    select barangay.lgu_id into v_lgu_id
    from public.barangays as barangay
    join public.local_government_units as lgu
      on lgu.id = barangay.lgu_id and lgu.status = 'active'
    join public.lgu_memberships as lgu_membership
      on lgu_membership.lgu_id = lgu.id
      and lgu_membership.user_id = v_invitation.invited_by
      and lgu_membership.status = 'active'
    where barangay.id = v_invitation.barangay_id
      and barangay.status = 'active';

    if v_lgu_id is null then
      raise exception 'the LGU issuer is no longer authorized for this Captain invitation';
    end if;
  elsif v_new_role = 'secretary' then
    if v_issuer_role is distinct from 'captain' then
      raise exception 'only the active Barangay Captain can invite a Secretary';
    end if;
  elsif v_new_role in ('treasurer','kagawad','sk_chairperson','bhw','tanod','resident') then
    if v_issuer_role is distinct from 'secretary' then
      raise exception 'only the active Barangay Secretary can invite this account type';
    end if;
  else
    raise exception 'this account type cannot be accepted through a barangay invitation';
  end if;

  select membership.* into v_membership
  from public.barangay_memberships as membership
  where membership.barangay_id = v_invitation.barangay_id
    and membership.user_id = v_user_id
  for update;

  if found then
    if v_membership.status = 'active' then
      raise exception 'this account already has active membership in the barangay';
    end if;

    select role.key into strict v_old_role
    from public.role_definitions as role where role.id = v_membership.role_id;

    update public.barangay_memberships
    set role_id = v_invitation.role_id, status = 'active'
    where id = v_membership.id;
    v_membership_id := v_membership.id;

    insert into public.membership_access_events(
      barangay_id, membership_id, actor_id, action,
      from_role, to_role, from_status, to_status
    ) values (
      v_invitation.barangay_id, v_membership.id, v_user_id,
      case when v_old_role <> v_new_role and v_membership.status <> 'active'
        then 'access_changed' when v_old_role <> v_new_role then 'role_changed'
        else 'status_changed' end,
      v_old_role, v_new_role, v_membership.status, 'active'
    );
  else
    insert into public.barangay_memberships(barangay_id, user_id, role_id, status)
    values (v_invitation.barangay_id, v_user_id, v_invitation.role_id, 'active')
    returning id into v_membership_id;
  end if;

  update public.invitations
  set status = 'accepted', accepted_by = v_user_id, accepted_at = now()
  where id = v_invitation.id;

  return v_membership_id;
end;
$$;

revoke all on function public.accept_membership_invitation(text) from public, anon;
grant execute on function public.accept_membership_invitation(text) to authenticated;
