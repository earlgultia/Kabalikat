-- Keep a Kagawad's own completion summaries accessible after reassignment or
-- committee archival without exposing another member's task notes.
create or replace function public.list_kagawad_completed_work_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10
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
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
begin
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

revoke all on function public.list_kagawad_completed_work_history(uuid, integer, integer) from public, anon;
grant execute on function public.list_kagawad_completed_work_history(uuid, integer, integer) to authenticated;
