-- A replacement invite for the same email supersedes every older pending
-- link in that barangay, even if the replacement assigns a different role.
-- Serialize sends for the same barangay/email pair to avoid duplicate live
-- invitation tokens when two administrators submit at nearly the same time.

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
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null or not public.has_tenant_permission(p_barangay_id, 'membership.invite') then
    raise exception 'not authorized';
  end if;

  select role.key into v_inviter_role
  from public.barangay_memberships as membership
  join public.role_definitions as role on role.id = membership.role_id
  where membership.user_id = (select auth.uid())
    and membership.barangay_id = p_barangay_id
    and membership.status = 'active';

  if v_inviter_role is null or not coalesce((
    (v_inviter_role = 'captain' and p_role_key = 'secretary')
    or (v_inviter_role = 'secretary' and p_role_key in (
      'treasurer','kagawad','sk_chairperson','bhw','tanod','resident'
    ))
  ), false) then
    raise exception 'this role cannot invite the requested account type';
  end if;

  if v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'invalid email';
  end if;

  select role.id into strict v_role_id
  from public.role_definitions as role
  where role.key = p_role_key and role.scope = 'barangay';

  perform pg_advisory_xact_lock(hashtextextended(
    p_barangay_id::text || ':' || v_email,
    40401
  ));

  update public.invitations as invitation
  set status = 'revoked'
  where invitation.barangay_id = p_barangay_id
    and lower(invitation.invited_email::text) = v_email
    and invitation.status = 'pending';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expiry := now() + interval '7 days';

  insert into public.invitations(
    barangay_id, invited_email, role_id, token_hash, invited_by, expires_at
  ) values (
    p_barangay_id, v_email, v_role_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    (select auth.uid()), v_expiry
  ) returning id into v_invitation_id;

  return query select v_invitation_id, v_token, v_expiry;
end;
$$;

revoke all on function public.create_membership_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_membership_invitation(uuid, text, text) to authenticated;
