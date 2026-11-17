-- Pending invitations must not survive the Captain removing a Secretary's
-- membership.invite permission. The same permission is checked at insert,
-- acceptance, and public token lookup boundaries.

create or replace function public.membership_has_permission(
  p_membership_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barangay_memberships as membership
    join public.role_permissions as role_permission
      on role_permission.role_id = membership.role_id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    left join public.membership_permissions as override
      on override.membership_id = membership.id
      and override.permission_id = permission.id
    where membership.id = p_membership_id
      and membership.status = 'active'
      and permission.key = p_permission_key
      and coalesce(override.effect, 'allow') = 'allow'
  );
$$;

revoke all on function public.membership_has_permission(uuid, text) from public, anon, authenticated;

create or replace function public.revoke_pending_invites_when_invite_permission_denied()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_barangay_id uuid;
begin
  if new.effect <> 'deny'
     or not exists (
       select 1 from public.permissions as permission
       where permission.id = new.permission_id and permission.key = 'membership.invite'
     ) then
    return new;
  end if;

  select membership.user_id, membership.barangay_id
    into v_user_id, v_barangay_id
  from public.barangay_memberships as membership
  where membership.id = new.membership_id;

  if v_user_id is not null then
    update public.invitations as invitation
    set status = 'revoked'
    where invitation.barangay_id = v_barangay_id
      and invitation.invited_by = v_user_id
      and invitation.status = 'pending';
  end if;

  return new;
end;
$$;

revoke all on function public.revoke_pending_invites_when_invite_permission_denied() from public, anon, authenticated;

create trigger revoke_pending_invites_after_invite_permission_denied
after insert or update of effect on public.membership_permissions
for each row execute function public.revoke_pending_invites_when_invite_permission_denied();

-- Extend the table-boundary issuer check from 0407 with the effective
-- membership.invite permission. The issuer membership lock serializes this
-- check with Captain membership/permission changes.
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

  if not v_check_workspace then return new; end if;

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
  if tg_op <> 'INSERT' then return new; end if;

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

  if v_invited_role <> 'captain'
     and not public.membership_has_permission(v_issuer_membership_id, 'membership.invite') then
    raise exception 'the invitation issuer does not have permission to invite members';
  end if;

  return new;
end;
$$;

-- Existing pending links from a Secretary whose invite permission was removed
-- cannot be accepted, even if a prior revocation event was missed.
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
  v_issuer_membership_id uuid;
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

  select membership.id, role.key into v_issuer_membership_id, v_issuer_role
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
    if not public.membership_has_permission(v_issuer_membership_id, 'membership.invite') then
      raise exception 'the invitation issuer no longer has permission to invite members';
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

create or replace function public.get_public_invitation_kind(p_token text)
returns table (invitation_kind text, target_label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target text;
begin
  if p_token is null or length(p_token) <> 64 then return; end if;

  select lgu.municipality || ', ' || lgu.province into v_target
  from public.lgu_invitations as invitation
  join public.local_government_units as lgu on lgu.id = invitation.lgu_id
  where invitation.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and invitation.status = 'pending' and invitation.expires_at > now()
    and lgu.status = 'active'
    and exists (select 1 from public.platform_administrators as administrator
      where administrator.user_id = invitation.invited_by);
  if found then
    return query select 'lgu'::text, v_target;
    return;
  end if;

  select barangay.name || ', ' || barangay.municipality into v_target
  from public.invitations as invitation
  join public.role_definitions as invited_role on invited_role.id = invitation.role_id
  join public.barangays as barangay on barangay.id = invitation.barangay_id
  where invitation.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and invitation.status = 'pending' and invitation.expires_at > now()
    and barangay.status = 'active'
    and (barangay.lgu_id is null or exists (select 1 from public.local_government_units as lgu
      where lgu.id = barangay.lgu_id and lgu.status = 'active'))
    and (
      (invited_role.key = 'captain' and exists (select 1 from public.lgu_memberships as issuer
        where issuer.lgu_id = barangay.lgu_id and issuer.user_id = invitation.invited_by and issuer.status = 'active'))
      or (invited_role.key = 'secretary' and exists (select 1 from public.barangay_memberships as issuer
        join public.role_definitions as issuer_role on issuer_role.id = issuer.role_id
        where issuer.barangay_id = invitation.barangay_id and issuer.user_id = invitation.invited_by
          and issuer.status = 'active' and issuer_role.key = 'captain'))
      or (invited_role.key in ('treasurer','kagawad','sk_chairperson','bhw','tanod','resident') and exists (
        select 1 from public.barangay_memberships as issuer
        join public.role_definitions as issuer_role on issuer_role.id = issuer.role_id
        where issuer.barangay_id = invitation.barangay_id and issuer.user_id = invitation.invited_by
          and issuer.status = 'active' and issuer_role.key = 'secretary'
          and public.membership_has_permission(issuer.id, 'membership.invite')))
    );

  if found then return query select 'barangay'::text, v_target; end if;
end;
$$;

revoke all on function public.get_public_invitation_kind(text) from public;
grant execute on function public.get_public_invitation_kind(text) to anon, authenticated;
