-- Give Captains an audited, constrained control for existing non-Captain access.
create table public.membership_access_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  membership_id uuid not null references public.barangay_memberships(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('role_changed', 'status_changed', 'access_changed')),
  from_role text not null,
  to_role text not null,
  from_status text not null,
  to_status text not null,
  created_at timestamptz not null default now()
);

create index membership_access_events_tenant_idx
  on public.membership_access_events(barangay_id, membership_id, created_at desc, id desc);

alter table public.membership_access_events enable row level security;
create policy membership_access_events_read on public.membership_access_events
  for select to authenticated using (public.has_tenant_permission(barangay_id, 'membership.read'));
revoke all on public.membership_access_events from anon, authenticated;
grant select on public.membership_access_events to authenticated;

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

revoke all on function public.manage_barangay_member_access(uuid, uuid, text, text) from public, anon;
grant execute on function public.manage_barangay_member_access(uuid, uuid, text, text) to authenticated;
