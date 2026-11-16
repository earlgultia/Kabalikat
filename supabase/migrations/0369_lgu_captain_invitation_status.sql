-- Let LGU administrators distinguish an unstaffed barangay from one with a live Captain invite.
create or replace function public.list_lgu_barangay_directory()
returns table (
  id uuid,name text,municipality text,province text,code text,status text,
  active_members bigint,captain_active boolean,pending_captain_email text,
  pending_captain_invite_expires_at timestamptz,created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select barangay.id,barangay.name,barangay.municipality,barangay.province,barangay.code,barangay.status,
    count(membership.id) filter (where membership.status = 'active'),
    exists (select 1 from public.barangay_memberships captain
      join public.role_definitions role on role.id = captain.role_id
      where captain.barangay_id = barangay.id and captain.status = 'active' and role.key = 'captain'),
    invitation.invited_email,invitation.expires_at,barangay.created_at
  from public.barangays barangay
  join public.lgu_memberships access on access.lgu_id = barangay.lgu_id
    and access.user_id = (select auth.uid()) and access.status = 'active'
  join public.local_government_units lgu on lgu.id = access.lgu_id and lgu.status = 'active'
  left join public.barangay_memberships membership on membership.barangay_id = barangay.id
  left join lateral (
    select invite.invited_email::text as invited_email,invite.expires_at
    from public.invitations invite
    join public.role_definitions role on role.id = invite.role_id and role.key = 'captain'
    where invite.barangay_id = barangay.id and invite.status = 'pending' and invite.expires_at > now()
    order by invite.created_at desc,invite.id desc limit 1
  ) invitation on true
  where barangay.lgu_id = access.lgu_id
  group by barangay.id,invitation.invited_email,invitation.expires_at
  order by barangay.name,barangay.id;
end;
$$;

revoke all on function public.list_lgu_barangay_directory() from public,anon;
grant execute on function public.list_lgu_barangay_directory() to authenticated;
