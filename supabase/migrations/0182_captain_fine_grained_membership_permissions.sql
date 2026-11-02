-- Allow Captains to narrow, or restore, permissions already granted by a member's role.
create table public.membership_permission_events (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references public.barangays(id) on delete restrict,
  membership_id uuid not null references public.barangay_memberships(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  permission_key text not null,
  previous_effect text check (previous_effect is null or previous_effect in ('allow', 'deny')),
  new_effect text check (new_effect is null or new_effect = 'deny'),
  created_at timestamptz not null default now(),
  check (previous_effect is distinct from new_effect)
);

create index membership_permission_events_tenant_idx
  on public.membership_permission_events(barangay_id, created_at desc, id desc);

alter table public.membership_permission_events enable row level security;
create policy membership_permission_events_read on public.membership_permission_events
  for select to authenticated using (public.has_tenant_permission(barangay_id, 'membership.read'));
revoke all on public.membership_permission_events from anon, authenticated;
grant select on public.membership_permission_events to authenticated;

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

revoke all on function public.set_barangay_member_permission(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.set_barangay_member_permission(uuid, uuid, text, boolean) to authenticated;
