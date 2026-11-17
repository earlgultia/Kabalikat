-- Do not present an invitation as usable when its issuer or workspace no
-- longer satisfies the same hierarchy enforced by acceptance.
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
  if p_token is null or length(p_token) <> 64 then
    return;
  end if;

  select lgu.municipality || ', ' || lgu.province
    into v_target
  from public.lgu_invitations as invitation
  join public.local_government_units as lgu on lgu.id = invitation.lgu_id
  where invitation.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and invitation.status = 'pending'
    and invitation.expires_at > now()
    and lgu.status = 'active'
    and exists (
      select 1 from public.platform_administrators as administrator
      where administrator.user_id = invitation.invited_by
    );

  if found then
    return query select 'lgu'::text, v_target;
    return;
  end if;

  select barangay.name || ', ' || barangay.municipality
    into v_target
  from public.invitations as invitation
  join public.role_definitions as invited_role on invited_role.id = invitation.role_id
  join public.barangays as barangay on barangay.id = invitation.barangay_id
  where invitation.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and invitation.status = 'pending'
    and invitation.expires_at > now()
    and barangay.status = 'active'
    and (barangay.lgu_id is null or exists (
      select 1 from public.local_government_units as lgu
      where lgu.id = barangay.lgu_id and lgu.status = 'active'
    ))
    and (
      (invited_role.key = 'captain' and exists (
        select 1
        from public.lgu_memberships as issuer
        where issuer.lgu_id = barangay.lgu_id
          and issuer.user_id = invitation.invited_by
          and issuer.status = 'active'
      ))
      or (invited_role.key = 'secretary' and exists (
        select 1
        from public.barangay_memberships as issuer
        join public.role_definitions as issuer_role on issuer_role.id = issuer.role_id
        where issuer.barangay_id = invitation.barangay_id
          and issuer.user_id = invitation.invited_by
          and issuer.status = 'active'
          and issuer_role.key = 'captain'
      ))
      or (invited_role.key in ('treasurer','kagawad','sk_chairperson','bhw','tanod','resident') and exists (
        select 1
        from public.barangay_memberships as issuer
        join public.role_definitions as issuer_role on issuer_role.id = issuer.role_id
        where issuer.barangay_id = invitation.barangay_id
          and issuer.user_id = invitation.invited_by
          and issuer.status = 'active'
          and issuer_role.key = 'secretary'
      ))
    );

  if found then
    return query select 'barangay'::text, v_target;
  end if;
end;
$$;

revoke all on function public.get_public_invitation_kind(text) from public;
grant execute on function public.get_public_invitation_kind(text) to anon, authenticated;
