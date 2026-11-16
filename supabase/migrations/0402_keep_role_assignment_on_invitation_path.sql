-- Keep all barangay role assignments on the invitation acceptance path.
-- Captains may suspend or restore non-Captain access, but cannot promote an
-- existing account into a different role outside the Secretary invitation flow.

create or replace function public.manage_barangay_member_access(
  p_barangay_id uuid,
  p_membership_id uuid,
  p_role_key text default null,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.barangay_memberships%rowtype;
  v_actor_role text;
  v_member_role text;
  v_to_status text;
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;

  select role.key into v_actor_role
  from public.barangay_memberships membership
  join public.role_definitions role on role.id = membership.role_id
  where membership.barangay_id = p_barangay_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active';

  if v_actor_role is distinct from 'captain' then
    raise exception 'only the active Captain can manage member access';
  end if;

  select membership.* into v_member
  from public.barangay_memberships membership
  where membership.id = p_membership_id
    and membership.barangay_id = p_barangay_id
  for update;

  if not found then raise exception 'member not found'; end if;
  if v_member.user_id = (select auth.uid()) then raise exception 'you cannot change your own access'; end if;
  if v_member.status = 'revoked' then
    raise exception 'revoked access can only be restored by accepting a new invitation';
  end if;

  select role.key into strict v_member_role
  from public.role_definitions role where role.id = v_member.role_id;

  if v_member_role = 'captain' then
    raise exception 'Captain access cannot be changed here';
  end if;

  if p_role_key is not null and trim(p_role_key) <> v_member_role then
    raise exception 'role assignments must be made through an accepted invitation';
  end if;

  v_to_status := coalesce(nullif(trim(p_status), ''), v_member.status);
  if v_to_status not in ('active', 'suspended') then
    raise exception 'members can only be active or suspended';
  end if;
  if v_to_status = v_member.status then
    raise exception 'no access change was requested';
  end if;

  update public.barangay_memberships
  set status = v_to_status
  where id = v_member.id;

  insert into public.membership_access_events(
    barangay_id, membership_id, actor_id, action,
    from_role, to_role, from_status, to_status
  ) values (
    p_barangay_id, v_member.id, (select auth.uid()), 'status_changed',
    v_member_role, v_member_role, v_member.status, v_to_status
  );
end;
$$;

revoke all on function public.manage_barangay_member_access(uuid,uuid,text,text) from public, anon;
grant execute on function public.manage_barangay_member_access(uuid,uuid,text,text) to authenticated;
