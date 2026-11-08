-- Apply the community-programs plan gate to assigned-task reads and at the
-- table boundary for task, progress-note, and due-date-request writes. The
-- table triggers cover all SECURITY DEFINER RPC callers without duplicating
-- their workflow validation and audit logic.

create or replace function public.list_kagawad_assigned_action_items(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_status text default 'all',
  p_search text default null,
  p_due_filter text default 'all'
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
set timezone = 'Asia/Manila'
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_due_filter text := coalesce(nullif(p_due_filter, ''), 'all');
begin
  if v_status not in ('all', 'open', 'in_progress', 'blocked', 'completed') then
    raise exception 'invalid action item status filter';
  end if;
  if v_due_filter not in ('all', 'due_soon', 'overdue') then
    raise exception 'invalid action item due-date filter';
  end if;

  if not public.is_active_member(p_barangay_id)
    or not public.tenant_plan_feature_enabled(p_barangay_id, 'community_programs')
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
      and (
        v_due_filter = 'all'
        or (v_due_filter = 'overdue' and task.status <> 'completed' and task.due_date < current_date)
        or (v_due_filter = 'due_soon' and task.status <> 'completed' and task.due_date between current_date and current_date + 7)
      )
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

create or replace function public.enforce_committee_community_programs_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tenant_plan_feature_enabled(new.barangay_id, 'community_programs') then
    raise exception 'committee workflows are unavailable under the current subscription plan';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_committee_community_programs_plan() from public, anon, authenticated;

drop trigger if exists committee_tasks_require_community_programs on public.committee_tasks;
create trigger committee_tasks_require_community_programs
  before insert or update on public.committee_tasks
  for each row execute function public.enforce_committee_community_programs_plan();

drop trigger if exists committee_task_progress_notes_require_community_programs on public.committee_task_progress_notes;
create trigger committee_task_progress_notes_require_community_programs
  before insert on public.committee_task_progress_notes
  for each row execute function public.enforce_committee_community_programs_plan();

drop trigger if exists committee_task_due_date_requests_require_community_programs on public.committee_task_due_date_requests;
create trigger committee_task_due_date_requests_require_community_programs
  before insert or update on public.committee_task_due_date_requests
  for each row execute function public.enforce_committee_community_programs_plan();

revoke all on function public.list_kagawad_assigned_action_items(uuid, integer, integer, text, text, text) from public, anon;
grant execute on function public.list_kagawad_assigned_action_items(uuid, integer, integer, text, text, text) to authenticated;
