-- Match barangay account creation to the Captain -> Secretary -> team hierarchy.
-- The UI is convenience only; all role limits are enforced by these RPCs.

insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id
from public.role_definitions role
join public.permissions permission on permission.key = 'membership.invite'
where role.key = 'secretary' and role.scope = 'barangay'
on conflict do nothing;

-- Revoke legacy pending Captain-issued invitations that grant roles outside
-- the new hierarchy. LGU/platform-issued Captain invitations are unaffected.
update public.invitations invitation
set status = 'revoked'
from public.role_definitions invited_role
where invitation.role_id = invited_role.id
  and invitation.status = 'pending'
  and invited_role.key <> 'secretary'
  and exists (
    select 1
    from public.barangay_memberships inviter_membership
    join public.role_definitions inviter_role on inviter_role.id = inviter_membership.role_id
    where inviter_membership.user_id = invitation.invited_by
      and inviter_membership.barangay_id = invitation.barangay_id
      and inviter_role.key = 'captain'
  );

create or replace function public.create_membership_invitation(
  p_barangay_id uuid,
  p_email text,
  p_role_key text
)
returns table(invitation_id uuid,invitation_token text,expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inviter_role text;
  v_invitation_id uuid;
  v_token text;
  v_role_id uuid;
  v_expiry timestamptz;
begin
  if auth.uid() is null or not public.has_tenant_permission(p_barangay_id,'membership.invite') then
    raise exception 'not authorized';
  end if;

  select role.key into v_inviter_role
  from public.barangay_memberships membership
  join public.role_definitions role on role.id = membership.role_id
  where membership.user_id = auth.uid()
    and membership.barangay_id = p_barangay_id
    and membership.status = 'active';

  if v_inviter_role is null or not coalesce((
    (v_inviter_role = 'captain' and p_role_key = 'secretary')
    or (v_inviter_role = 'secretary' and p_role_key in (
      'treasurer','kagawad','sk_chairperson','bhw','tanod','resident'
    ))
  ),false) then
    raise exception 'this role cannot invite the requested account type';
  end if;

  if coalesce(p_email,'') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'invalid email';
  end if;

  select id into strict v_role_id
  from public.role_definitions
  where key = p_role_key and scope = 'barangay';

  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_expiry := now() + interval '7 days';

  insert into public.invitations(barangay_id,invited_email,role_id,token_hash,invited_by,expires_at)
  values (
    p_barangay_id,
    trim(p_email),
    v_role_id,
    encode(extensions.digest(v_token,'sha256'),'hex'),
    auth.uid(),
    v_expiry
  )
  returning id into v_invitation_id;

  return query select v_invitation_id,v_token,v_expiry;
end;
$$;

revoke all on function public.create_membership_invitation(uuid,text,text) from public,anon;
grant execute on function public.create_membership_invitation(uuid,text,text) to authenticated;

create or replace function public.revoke_membership_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_inviter_role text;
  v_invited_role text;
begin
  select * into v_invitation
  from public.invitations
  where id = p_invitation_id
  for update;

  if not found or not public.has_tenant_permission(v_invitation.barangay_id,'membership.invite') then
    raise exception 'not authorized';
  end if;

  select role.key into v_inviter_role
  from public.barangay_memberships membership
  join public.role_definitions role on role.id = membership.role_id
  where membership.user_id = auth.uid()
    and membership.barangay_id = v_invitation.barangay_id
    and membership.status = 'active';

  select role.key into v_invited_role
  from public.role_definitions role
  where role.id = v_invitation.role_id;

  if v_inviter_role is null or not coalesce((
    (v_inviter_role = 'captain' and v_invited_role = 'secretary')
    or (v_inviter_role = 'secretary' and v_invited_role in (
      'treasurer','kagawad','sk_chairperson','bhw','tanod','resident'
    ))
  ),false) then
    raise exception 'this role cannot manage that invitation';
  end if;

  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    raise exception 'invitation is no longer pending';
  end if;

  update public.invitations
  set status = 'revoked'
  where id = v_invitation.id;
end;
$$;

revoke all on function public.revoke_membership_invitation(uuid) from public,anon;
grant execute on function public.revoke_membership_invitation(uuid) to authenticated;
