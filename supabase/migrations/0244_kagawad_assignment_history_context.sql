-- Preserve who made future assignments and who a task was transferred from.
alter table public.committee_task_assignment_events
  add column assigned_by uuid references public.profiles(id) on delete set null,
  add column assigned_by_name text,
  add column previous_assignee uuid references public.profiles(id) on delete set null,
  add column previous_assignee_name text;

with ordered_events as (
  select event.id,
    lag(event.assigned_to) over (
      partition by event.task_id order by event.assigned_at, event.id
    ) as previous_assignee
  from public.committee_task_assignment_events event
), previous_names as (
  select ordered_events.id, ordered_events.previous_assignee,
    profile.display_name as previous_assignee_name
  from ordered_events
  left join public.profiles profile on profile.id = ordered_events.previous_assignee
)
update public.committee_task_assignment_events event
set previous_assignee = previous_names.previous_assignee,
    previous_assignee_name = previous_names.previous_assignee_name
from previous_names
where event.id = previous_names.id
  and previous_names.previous_assignee is not null;

create or replace function public.log_committee_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_previous_assignee uuid;
  v_previous_assignee_name text;
begin
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.assigned_to is not distinct from new.assigned_to then
      return new;
    end if;
    v_actor_id := coalesce(new.updated_by, (select auth.uid()));
    v_previous_assignee := old.assigned_to;
    select profile.display_name into v_previous_assignee_name
    from public.profiles profile where profile.id = v_previous_assignee;
  else
    v_actor_id := coalesce(new.created_by, (select auth.uid()));
  end if;

  select profile.display_name into v_actor_name
  from public.profiles profile where profile.id = v_actor_id;

  insert into public.committee_task_assignment_events(
    barangay_id, committee_id, task_id, assigned_to, assigned_by,
    assigned_by_name, previous_assignee, previous_assignee_name
  ) values (
    new.barangay_id, new.committee_id, new.id, new.assigned_to, v_actor_id,
    v_actor_name, v_previous_assignee, v_previous_assignee_name
  );
  return new;
end;
$$;

revoke all on function public.log_committee_task_assignment() from public, anon, authenticated;

drop function public.search_kagawad_task_assignment_history(
  uuid, integer, integer, text, text, date, date
);

create function public.search_kagawad_task_assignment_history(
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
  assigned_by_name text,
  previous_assignee_name text,
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
      task.due_date, event.assigned_at, event.assigned_by_name,
      event.previous_assignee_name
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
    counted.task_status, counted.due_date, counted.assigned_at,
    counted.assigned_by_name, counted.previous_assignee_name, counted.total_count
  from counted
  order by counted.assigned_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_kagawad_task_assignment_history(uuid, integer, integer, text, text, date, date) from public, anon;
grant execute on function public.search_kagawad_task_assignment_history(uuid, integer, integer, text, text, date, date) to authenticated;
