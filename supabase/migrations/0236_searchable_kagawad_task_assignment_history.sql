-- Let Kagawads find previous assignments, including work transferred away.
create or replace function public.search_kagawad_task_assignment_history(
  p_barangay_id uuid,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_status text,
  p_assigned_after date,
  p_assigned_before date
)
returns table (
  id uuid,
  task_id uuid,
  committee_name text,
  task_title text,
  task_status text,
  due_date date,
  assigned_at timestamptz,
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
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_status text := coalesce(nullif(p_status, ''), 'all');
begin
  if v_status not in ('all', 'open', 'in_progress', 'blocked', 'completed') then
    raise exception 'invalid task status filter';
  end if;
  if p_assigned_after is not null and p_assigned_before is not null
    and p_assigned_after > p_assigned_before then
    raise exception 'assigned-after date must be on or before assigned-before date';
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
  with history as (
    select event.id, task.id as task_id, committee.name as committee_name,
      task.title as task_title, task.status::text as task_status,
      task.due_date, event.assigned_at
    from public.committee_task_assignment_events event
    join public.committee_tasks task
      on task.id = event.task_id and task.barangay_id = event.barangay_id
    join public.committees committee
      on committee.id = event.committee_id and committee.barangay_id = event.barangay_id
    where event.barangay_id = p_barangay_id
      and event.assigned_to = (select auth.uid())
      and (v_status = 'all' or task.status::text = v_status)
      and (p_assigned_after is null or (event.assigned_at at time zone 'Asia/Manila')::date >= p_assigned_after)
      and (p_assigned_before is null or (event.assigned_at at time zone 'Asia/Manila')::date <= p_assigned_before)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', task.title, committee.name))) > 0)
  ), counted as (
    select history.*, count(*) over () as total_count from history
  )
  select counted.id, counted.task_id, counted.committee_name, counted.task_title,
    counted.task_status, counted.due_date, counted.assigned_at, counted.total_count
  from counted
  order by counted.assigned_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_kagawad_task_assignment_history(uuid, integer, integer, text, text, date, date) from public, anon;
grant execute on function public.search_kagawad_task_assignment_history(uuid, integer, integer, text, text, date, date) to authenticated;
