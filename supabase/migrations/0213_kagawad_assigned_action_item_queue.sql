-- Provide Kagawads a single, searchable queue for their assigned committee tasks.
create or replace function public.list_kagawad_assigned_action_items(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_status text default 'all',
  p_search text default null
)
returns table (
  id uuid,
  committee_id uuid,
  committee_name text,
  title text,
  description text,
  status text,
  due_date date,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
begin
  if v_status not in ('all', 'open', 'in_progress', 'blocked', 'completed') then
    raise exception 'invalid action item status filter';
  end if;

  if not public.is_active_member(p_barangay_id)
    or not exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    ) then
    raise exception 'not authorized';
  end if;

  return query
  with assigned_items as (
    select task.id, task.committee_id, committee.name as committee_name,
      task.title, task.description, task.status, task.due_date, task.created_at
    from public.committee_tasks task
    join public.committees committee
      on committee.id = task.committee_id
     and committee.barangay_id = task.barangay_id
    where task.barangay_id = p_barangay_id
      and task.assigned_to = (select auth.uid())
      and committee.status = 'active'
      and (v_status = 'all' or task.status = v_status)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', task.title, committee.name))) > 0)
  ), counted as (
    select assigned_items.*, count(*) over () as total_count
    from assigned_items
  )
  select counted.id, counted.committee_id, counted.committee_name, counted.title,
    counted.description, counted.status, counted.due_date, counted.created_at, counted.total_count
  from counted
  order by (counted.due_date is null), counted.due_date, counted.created_at desc, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_kagawad_assigned_action_items(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.list_kagawad_assigned_action_items(uuid, integer, integer, text, text) to authenticated;
