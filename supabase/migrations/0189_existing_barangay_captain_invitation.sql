-- Let the platform administrator provision the first Captain for an existing
-- barangay. A plan assignment alone does not create a user membership.

create or replace function public.create_platform_captain_invitation(
  p_barangay_code text,
  p_captain_email text
)
returns table (invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
  v_role_id uuid;
  v_token text;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if not public.is_platform_administrator() then
    raise exception 'not authorized';
  end if;

  if length(trim(coalesce(p_barangay_code, ''))) not between 2 and 40
    or coalesce(p_captain_email, '') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'enter a valid barangay code and Captain email';
  end if;

  select barangay.id into v_barangay_id
  from public.barangays as barangay
  where upper(barangay.code) = upper(trim(p_barangay_code))
    and barangay.status = 'active';
  if v_barangay_id is null then
    raise exception 'active barangay not found; check the barangay code';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_barangay_id::text, 0));

  if exists (
    select 1
    from public.barangay_memberships as membership
    join public.role_definitions as role on role.id = membership.role_id
    where membership.barangay_id = v_barangay_id
      and membership.status = 'active'
      and role.key = 'captain'
  ) then
    raise exception 'this barangay already has an active Captain; use that Captain account or suspend its access first';
  end if;

  select role.id into strict v_role_id
  from public.role_definitions as role
  where role.key = 'captain' and role.scope = 'barangay';

  update public.invitations as invitation
  set status = 'revoked'
  where invitation.barangay_id = v_barangay_id
    and invitation.status = 'pending'
    and invitation.role_id = v_role_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations(
    barangay_id, invited_email, role_id, token_hash, invited_by, expires_at
  ) values (
    v_barangay_id,
    lower(trim(p_captain_email)),
    v_role_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    auth.uid(),
    v_expires_at
  );

  return query select v_token, v_expires_at;
end;
$$;

revoke all on function public.create_platform_captain_invitation(text, text) from public, anon;
grant execute on function public.create_platform_captain_invitation(text, text) to authenticated;

-- A valid new invitation may reactivate an existing suspended or revoked
-- membership for that same email, while recording the access change.
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
    select role.key into strict v_new_role
    from public.role_definitions as role where role.id = v_invitation.role_id;

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
