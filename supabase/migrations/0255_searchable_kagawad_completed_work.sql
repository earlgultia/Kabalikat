-- Let Kagawads search their own completion summaries by task, committee,
-- summary text, and completion date while keeping the history private.
create or replace function public.search_kagawad_completed_work_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_completed_after date default null,
  p_completed_before date default null
)
returns table (
  id uuid,
  task_id uuid,
  task_title text,
  committee_name text,
  summary text,
  completed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
begin
  if p_completed_after is not null and p_completed_before is not null
    and p_completed_after > p_completed_before then
    raise exception 'completed-after date must be on or before completed-before date';
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
  with completions as (
    select event.id, task.id as task_id, task.title as task_title,
      committee.name as committee_name, note.note as summary,
      event.created_at as completed_at
    from public.committee_events event
    join public.committee_tasks task
      on task.id = event.task_id and task.barangay_id = event.barangay_id
    join public.committees committee
      on committee.id = event.committee_id and committee.barangay_id = event.barangay_id
    join public.committee_task_progress_notes note
      on note.task_id = event.task_id
     and note.barangay_id = event.barangay_id
     and note.committee_id = event.committee_id
     and note.author_id = (select auth.uid())
     and note.created_at = event.created_at
    where event.barangay_id = p_barangay_id
      and event.actor_id = (select auth.uid())
      and event.action = 'task_status_changed'
      and right(event.details, length(' -> completed')) = ' -> completed'
      and exists (
        select 1
        from public.committee_task_assignment_events assignment
        where assignment.task_id = event.task_id
          and assignment.barangay_id = event.barangay_id
          and assignment.assigned_to = (select auth.uid())
          and assignment.assigned_at <= event.created_at
      )
      and (p_completed_after is null or (event.created_at at time zone 'Asia/Manila')::date >= p_completed_after)
      and (p_completed_before is null or (event.created_at at time zone 'Asia/Manila')::date <= p_completed_before)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', task.title, committee.name, note.note))) > 0)
  ), counted as (
    select completions.*, count(*) over () as total_count from completions
  )
  select counted.id, counted.task_id, counted.task_title,
    counted.committee_name, counted.summary, counted.completed_at,
    counted.total_count
  from counted
  order by counted.completed_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_kagawad_completed_work_history(uuid, integer, integer, text, date, date) from public, anon;
grant execute on function public.search_kagawad_completed_work_history(uuid, integer, integer, text, date, date) to authenticated;
