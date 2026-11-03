-- Return a small private page of status changes for the signed-in Kagawad's
-- assigned task. Committee managers' edits remain visible in the task audit.
create index if not exists committee_events_task_status_history_idx
  on public.committee_events(task_id, created_at desc, id desc)
  where action = 'task_status_changed';

create or replace function public.list_kagawad_task_status_history(
  p_task_id uuid,
  p_page integer default 0,
  p_page_size integer default 10
)
returns table (
  id uuid,
  actor_name text,
  details text,
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
begin
  if not exists (
    select 1
    from public.committee_tasks task
    join public.committees committee
      on committee.id = task.committee_id
     and committee.barangay_id = task.barangay_id
    join public.barangay_memberships membership
      on membership.barangay_id = task.barangay_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    join public.role_definitions role on role.id = membership.role_id
    where task.id = p_task_id
      and task.assigned_to = (select auth.uid())
      and committee.status = 'active'
      and role.key = 'kagawad'
  ) then
    raise exception 'not authorized';
  end if;

  return query
  with task_events as (
    select event.id,
      coalesce(nullif(profile.display_name, ''), 'Committee member')::text as actor_name,
      event.details, event.created_at
    from public.committee_events event
    left join public.profiles profile on profile.id = event.actor_id
    where event.task_id = p_task_id
      and event.action = 'task_status_changed'
  ), counted as (
    select task_events.*, count(*) over () as total_count
    from task_events
  )
  select counted.id, counted.actor_name, counted.details, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_kagawad_task_status_history(uuid, integer, integer) from public, anon;
grant execute on function public.list_kagawad_task_status_history(uuid, integer, integer) to authenticated;
