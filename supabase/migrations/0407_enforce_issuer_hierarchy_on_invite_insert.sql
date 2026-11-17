-- Enforce the invitation chain at the table boundary too. The issuer row is
-- locked until commit so a simultaneous suspension/revocation cannot race an
-- invitation into existence after the issuer loses authority.
create or replace function public.guard_barangay_invitation_workspace_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_status text;
  v_lgu_id uuid;
  v_lgu_status text;
  v_invited_role text;
  v_issuer_membership_id uuid;
  v_check_workspace boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'an invitation must start in pending status';
    end if;
    v_check_workspace := true;
  elsif new.status = 'accepted' and old.status is distinct from 'accepted' then
    v_check_workspace := true;
  end if;

  if not v_check_workspace then
    return new;
  end if;

  select barangay.status, barangay.lgu_id, lgu.status
    into v_barangay_status, v_lgu_id, v_lgu_status
  from public.barangays as barangay
  left join public.local_government_units as lgu on lgu.id = barangay.lgu_id
  where barangay.id = new.barangay_id;

  if not found or v_barangay_status is distinct from 'active' then
    raise exception 'the Barangay workspace is not active';
  end if;
  if v_lgu_id is not null and v_lgu_status is distinct from 'active' then
    raise exception 'the municipality LGU workspace is not active';
  end if;

  if tg_op <> 'INSERT' then
    return new;
  end if;

  select role.key into v_invited_role
  from public.role_definitions as role
  where role.id = new.role_id and role.scope = 'barangay';

  if v_invited_role = 'captain' then
    select membership.id into v_issuer_membership_id
    from public.lgu_memberships as membership
    where membership.lgu_id = v_lgu_id
      and membership.user_id = new.invited_by
      and membership.status = 'active'
    for share;
  elsif v_invited_role = 'secretary' then
    select membership.id into v_issuer_membership_id
    from public.barangay_memberships as membership
    join public.role_definitions as role on role.id = membership.role_id
    where membership.barangay_id = new.barangay_id
      and membership.user_id = new.invited_by
      and membership.status = 'active'
      and role.key = 'captain'
    for share of membership;
  elsif v_invited_role in ('treasurer','kagawad','sk_chairperson','bhw','tanod','resident') then
    select membership.id into v_issuer_membership_id
    from public.barangay_memberships as membership
    join public.role_definitions as role on role.id = membership.role_id
    where membership.barangay_id = new.barangay_id
      and membership.user_id = new.invited_by
      and membership.status = 'active'
      and role.key = 'secretary'
    for share of membership;
  else
    raise exception 'this account type cannot be invited to a barangay';
  end if;

  if v_issuer_membership_id is null then
    raise exception 'the invitation issuer does not have the required active role';
  end if;

  return new;
end;
$$;

create or replace function public.guard_lgu_invitation_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lgu_status text;
  v_admin_id uuid;
  v_check_authority boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'an invitation must start in pending status';
    end if;
    v_check_authority := true;
  elsif new.status = 'accepted' and old.status is distinct from 'accepted' then
    v_check_authority := true;
  end if;

  if not v_check_authority then
    return new;
  end if;

  select lgu.status into v_lgu_status
  from public.local_government_units as lgu
  where lgu.id = new.lgu_id;

  if not found or v_lgu_status is distinct from 'active' then
    raise exception 'the municipality LGU workspace is not active';
  end if;

  select administrator.user_id into v_admin_id
  from public.platform_administrators as administrator
  where administrator.user_id = new.invited_by
  for share;

  if v_admin_id is null then
    raise exception 'only a Super Admin can issue an LGU administrator invitation';
  end if;

  return new;
end;
$$;
