-- Let Captains end a member's access while preserving the membership and its
-- operational history. Restoring revoked access requires a new invitation.
alter table public.membership_access_events
  add column reason text check (reason is null or char_length(trim(reason)) between 3 and 500);

create or replace function public.list_barangay_membership_access_page(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_status text default 'all'
)
returns table (
  id uuid,
  user_id uuid,
  role_id uuid,
  status text,
  created_at timestamptz,
  role_key text,
  role_label text,
  display_name text,
  total_count bigint,
  active_count bigint,
  suspended_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 1000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;
  if v_status not in ('all', 'active', 'suspended', 'revoked') then
    raise exception 'invalid membership status filter';
  end if;

  return query
  with members as (
    select m.id, m.user_id, m.role_id, m.status::text as status, m.created_at,
      r.key as role_key, r.label as role_label,
      coalesce(nullif(trim(p.display_name), ''), 'Barangay member') as display_name
    from public.barangay_memberships m
    join public.role_definitions r on r.id = m.role_id
    left join public.profiles p on p.id = m.user_id
    where m.barangay_id = p_barangay_id
      and m.status in ('active', 'suspended', 'revoked')
      and (v_status = 'all' or m.status::text = v_status)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ',
        p.display_name, r.label, r.key
      ))) > 0)
  ), counted as (
    select members.*,
      count(*) over () as total_count,
      count(*) filter (where members.status = 'active') over () as active_count,
      count(*) filter (where members.status = 'suspended') over () as suspended_count
    from members
  )
  select counted.id, counted.user_id, counted.role_id, counted.status, counted.created_at,
    counted.role_key, counted.role_label, counted.display_name,
    counted.total_count, counted.active_count, counted.suspended_count
  from counted
  order by counted.created_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

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
  v_from_role text;
  v_to_role text;
  v_to_role_id uuid;
  v_to_status text;
  v_action text;
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;

  select membership.* into v_member
  from public.barangay_memberships as membership
  where membership.id = p_membership_id
    and membership.barangay_id = p_barangay_id
  for update;
  if not found then raise exception 'member not found'; end if;
  if v_member.user_id = (select auth.uid()) then raise exception 'you cannot change your own access'; end if;
  if v_member.status = 'revoked' then raise exception 'revoked access can only be restored by accepting a new invitation'; end if;

  select role.key into v_from_role
  from public.role_definitions as role where role.id = v_member.role_id;
  if v_from_role = 'captain' then raise exception 'Captain access cannot be changed here'; end if;

  v_to_role := coalesce(nullif(trim(p_role_key), ''), v_from_role);
  v_to_status := coalesce(nullif(trim(p_status), ''), v_member.status);
  if v_to_role not in ('secretary', 'treasurer', 'kagawad', 'sk_chairperson', 'bhw', 'tanod', 'resident') then
    raise exception 'invalid member role';
  end if;
  if v_to_status not in ('active', 'suspended') then
    raise exception 'members can only be active or suspended';
  end if;
  if v_to_role = v_from_role and v_to_status = v_member.status then
    raise exception 'no access change was requested';
  end if;

  select role.id into strict v_to_role_id
  from public.role_definitions as role
  where role.key = v_to_role and role.scope = 'barangay';

  v_action := case
    when v_to_role <> v_from_role and v_to_status <> v_member.status then 'access_changed'
    when v_to_role <> v_from_role then 'role_changed'
    else 'status_changed'
  end;
  update public.barangay_memberships
  set role_id = v_to_role_id, status = v_to_status
  where id = v_member.id;

  insert into public.membership_access_events(
    barangay_id, membership_id, actor_id, action,
    from_role, to_role, from_status, to_status
  ) values (
    p_barangay_id, v_member.id, (select auth.uid()), v_action,
    v_from_role, v_to_role, v_member.status, v_to_status
  );
end;
$$;

create or replace function public.revoke_barangay_member_access(
  p_barangay_id uuid,
  p_membership_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.barangay_memberships%rowtype;
  v_role text;
  v_email text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;
  if length(v_reason) not between 3 and 500 then raise exception 'provide a reason between 3 and 500 characters'; end if;

  select membership.* into v_member
  from public.barangay_memberships as membership
  where membership.id = p_membership_id and membership.barangay_id = p_barangay_id
  for update;
  if not found then raise exception 'member not found'; end if;
  if v_member.user_id = (select auth.uid()) then raise exception 'you cannot revoke your own access'; end if;
  if v_member.status = 'revoked' then raise exception 'member access is already revoked'; end if;

  select role.key into v_role
  from public.role_definitions as role where role.id = v_member.role_id;
  if v_role = 'captain' then raise exception 'Captain access cannot be revoked here'; end if;

  select lower(auth_user.email::text) into v_email
  from auth.users as auth_user where auth_user.id = v_member.user_id;

  update public.barangay_memberships set status = 'revoked' where id = v_member.id;
  delete from public.membership_permissions where membership_id = v_member.id;
  update public.invitations as invitation
  set status = 'revoked'
  where invitation.barangay_id = p_barangay_id
    and invitation.status = 'pending'
    and lower(invitation.invited_email::text) = coalesce(v_email, '');

  insert into public.membership_access_events(
    barangay_id, membership_id, actor_id, action,
    from_role, to_role, from_status, to_status, reason
  ) values (
    p_barangay_id, v_member.id, (select auth.uid()), 'status_changed',
    v_role, v_role, v_member.status, 'revoked', v_reason
  );
end;
$$;

-- Revoked memberships must not accumulate permission overrides that could
-- unexpectedly take effect if a membership is later restored by invitation.
create or replace function public.set_barangay_member_permission(
  p_barangay_id uuid,
  p_membership_id uuid,
  p_permission_key text,
  p_granted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.barangay_memberships%rowtype;
  v_permission_id uuid;
  v_previous_effect text;
  v_new_effect text;
begin
  if not public.has_tenant_permission(p_barangay_id, 'membership.manage') then
    raise exception 'not authorized';
  end if;

  select membership.* into v_member
  from public.barangay_memberships as membership
  where membership.id = p_membership_id and membership.barangay_id = p_barangay_id
  for update;
  if not found then raise exception 'member not found'; end if;
  if v_member.user_id = (select auth.uid()) then raise exception 'you cannot change your own permissions'; end if;
  if v_member.status = 'revoked' then raise exception 'revoked members cannot have permission overrides'; end if;

  if exists (
    select 1 from public.role_definitions as assigned_role
    where assigned_role.id = v_member.role_id and assigned_role.key = 'captain'
  ) then
    raise exception 'Captain permissions cannot be changed here';
  end if;

  select permission.id into v_permission_id
  from public.permissions as permission
  join public.role_permissions as role_permission on role_permission.permission_id = permission.id
  where permission.key = trim(coalesce(p_permission_key, ''))
    and role_permission.role_id = v_member.role_id;
  if v_permission_id is null then
    raise exception 'only permissions already granted by this role can be customized';
  end if;

  select override.effect into v_previous_effect
  from public.membership_permissions as override
  where override.membership_id = v_member.id and override.permission_id = v_permission_id
  for update;

  if coalesce(p_granted, false) then
    delete from public.membership_permissions
    where membership_id = v_member.id and permission_id = v_permission_id;
    v_new_effect := null;
  else
    insert into public.membership_permissions(membership_id, permission_id, effect, granted_by)
    values (v_member.id, v_permission_id, 'deny', (select auth.uid()))
    on conflict (membership_id, permission_id) do update set effect = 'deny', granted_by = excluded.granted_by;
    v_new_effect := 'deny';
  end if;

  if v_previous_effect is not distinct from v_new_effect then return; end if;
  insert into public.membership_permission_events(
    barangay_id, membership_id, actor_id, permission_key, previous_effect, new_effect
  ) values (
    p_barangay_id, v_member.id, (select auth.uid()), trim(p_permission_key), v_previous_effect, v_new_effect
  );
end;
$$;

revoke all on function public.list_barangay_membership_access_page(uuid, integer, integer, text, text) from public, anon;
revoke all on function public.manage_barangay_member_access(uuid, uuid, text, text) from public, anon;
revoke all on function public.revoke_barangay_member_access(uuid, uuid, text) from public, anon;
revoke all on function public.set_barangay_member_permission(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.list_barangay_membership_access_page(uuid, integer, integer, text, text) to authenticated;
grant execute on function public.manage_barangay_member_access(uuid, uuid, text, text) to authenticated;
grant execute on function public.revoke_barangay_member_access(uuid, uuid, text) to authenticated;
grant execute on function public.set_barangay_member_permission(uuid, uuid, text, boolean) to authenticated;
