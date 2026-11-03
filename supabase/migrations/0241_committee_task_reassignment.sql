-- Let committee managers transfer an action item to another active member
-- without granting direct UPDATE access to committee_tasks.

create or replace function public.list_committee_active_member_page(
  p_barangay_id uuid,
  p_committee_id uuid,
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null
)
returns table (
  user_id uuid,
  display_name text,
  role_label text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.has_tenant_permission(p_barangay_id, 'committee.manage')
    or not exists (
      select 1 from public.committees committee
      where committee.id = p_committee_id
        and committee.barangay_id = p_barangay_id
        and committee.status = 'active'
    ) then
    raise exception 'not authorized';
  end if;

  return query
  with eligible as (
    select membership.user_id, profile.display_name, role.label as role_label
    from public.committee_members committee_member
    join public.barangay_memberships membership
      on membership.barangay_id = committee_member.barangay_id
     and membership.user_id = committee_member.user_id
     and membership.status = 'active'
    join public.profiles profile on profile.id = membership.user_id
    join public.role_definitions role on role.id = membership.role_id
    where committee_member.barangay_id = p_barangay_id
      and committee_member.committee_id = p_committee_id
      and (v_search is null
        or profile.display_name ilike '%' || v_search || '%'
        or role.label ilike '%' || v_search || '%')
  ), counted as (
    select eligible.*, count(*) over () as total_count from eligible
  )
  select counted.user_id, counted.display_name, counted.role_label, counted.total_count
  from counted
  order by counted.display_name, counted.user_id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

create or replace function public.reassign_committee_task(
  p_task_id uuid,
  p_assigned_to uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.committee_tasks%rowtype;
begin
  if p_assigned_to is null then
    raise exception 'choose an active committee member';
  end if;

  select task.* into v_task
  from public.committee_tasks task
  join public.committees committee
    on committee.id = task.committee_id
   and committee.barangay_id = task.barangay_id
  where task.id = p_task_id
    and committee.status = 'active'
  for update of task;

  if not found then raise exception 'action item not found'; end if;
  if not public.has_tenant_permission(v_task.barangay_id, 'committee.manage') then
    raise exception 'not authorized';
  end if;
  if v_task.status = 'completed' then
    raise exception 'completed action items cannot be reassigned';
  end if;
  if not exists (
    select 1
    from public.committee_members committee_member
    join public.barangay_memberships membership
      on membership.barangay_id = committee_member.barangay_id
     and membership.user_id = committee_member.user_id
     and membership.status = 'active'
    where committee_member.barangay_id = v_task.barangay_id
      and committee_member.committee_id = v_task.committee_id
      and committee_member.user_id = p_assigned_to
  ) then
    raise exception 'assignee must be an active member of this committee';
  end if;
  if v_task.assigned_to is not distinct from p_assigned_to then return; end if;

  update public.committee_tasks
  set assigned_to = p_assigned_to,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = v_task.id;
end;
$$;

revoke all on function public.list_committee_active_member_page(uuid, uuid, integer, integer, text) from public, anon;
grant execute on function public.list_committee_active_member_page(uuid, uuid, integer, integer, text) to authenticated;
revoke all on function public.reassign_committee_task(uuid, uuid) from public, anon;
grant execute on function public.reassign_committee_task(uuid, uuid) to authenticated;
