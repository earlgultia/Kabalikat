-- Keep Kagawad task-history reads behind the same subscription entitlement as
-- the task queue and task workflows. The retained implementations continue to
-- enforce their existing per-user and per-task ownership checks.

create or replace function public.kagawad_task_history_plan_enabled(p_barangay_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member(p_barangay_id)
    and public.tenant_plan_feature_enabled(p_barangay_id, 'community_programs')
    and exists (
      select 1
      from public.barangay_memberships membership
      join public.role_definitions role on role.id = membership.role_id
      where membership.barangay_id = p_barangay_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and role.key = 'kagawad'
    );
$$;

create or replace function public.kagawad_task_history_plan_enabled_for_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_tasks task
    where task.id = p_task_id
      and public.kagawad_task_history_plan_enabled(task.barangay_id)
  );
$$;

revoke all on function public.kagawad_task_history_plan_enabled(uuid) from public, anon, authenticated;
revoke all on function public.kagawad_task_history_plan_enabled_for_task(uuid) from public, anon, authenticated;

-- Move the existing implementations behind private names so the public RPC
-- wrappers can apply entitlement checks without changing their row schemas.
alter function public.search_kagawad_task_assignment_history(uuid, integer, integer, text, text, date, date)
  rename to search_kagawad_task_assignment_history_before_plan_gate;
alter function public.search_kagawad_completed_work_history(uuid, integer, integer, text, date, date)
  rename to search_kagawad_completed_work_history_before_plan_gate;
alter function public.search_kagawad_due_date_request_history(uuid, integer, integer, text, text, date, date, date, date)
  rename to search_kagawad_due_date_request_history_before_plan_gate;
alter function public.list_kagawad_task_due_date_request_history(uuid, integer, integer)
  rename to list_kagawad_task_due_date_request_history_before_plan_gate;
alter function public.list_kagawad_task_status_history(uuid, integer, integer)
  rename to list_kagawad_task_status_history_before_plan_gate;
alter function public.list_kagawad_action_item_notes(uuid)
  rename to list_kagawad_action_item_notes_before_plan_gate;

revoke all on function public.search_kagawad_task_assignment_history_before_plan_gate(uuid, integer, integer, text, text, date, date) from public, anon, authenticated;
revoke all on function public.search_kagawad_completed_work_history_before_plan_gate(uuid, integer, integer, text, date, date) from public, anon, authenticated;
revoke all on function public.search_kagawad_due_date_request_history_before_plan_gate(uuid, integer, integer, text, text, date, date, date, date) from public, anon, authenticated;
revoke all on function public.list_kagawad_task_due_date_request_history_before_plan_gate(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.list_kagawad_task_status_history_before_plan_gate(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.list_kagawad_action_item_notes_before_plan_gate(uuid) from public, anon, authenticated;

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
  id uuid, task_id uuid, committee_name text, task_title text, task_status text,
  due_date date, assigned_at timestamptz, assigned_by_name text,
  previous_assignee_name text, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kagawad_task_history_plan_enabled(p_barangay_id) then
    raise exception 'not authorized';
  end if;
  return query select * from public.search_kagawad_task_assignment_history_before_plan_gate(
    p_barangay_id, p_page, p_page_size, p_search, p_status, p_assigned_after, p_assigned_before
  );
end;
$$;

create function public.search_kagawad_completed_work_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_completed_after date default null,
  p_completed_before date default null
)
returns table (
  id uuid, task_id uuid, task_title text, committee_name text,
  summary text, completed_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kagawad_task_history_plan_enabled(p_barangay_id) then
    raise exception 'not authorized';
  end if;
  return query select * from public.search_kagawad_completed_work_history_before_plan_gate(
    p_barangay_id, p_page, p_page_size, p_search, p_completed_after, p_completed_before
  );
end;
$$;

create function public.search_kagawad_due_date_request_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_status text default 'all',
  p_search text default null,
  p_created_after date default null,
  p_created_before date default null,
  p_reviewed_after date default null,
  p_reviewed_before date default null
)
returns table (
  id uuid, task_id uuid, task_title text, committee_name text,
  current_due_date date, proposed_due_date date, reason text, status text,
  decision_note text, reviewer_name text, created_at timestamptz,
  reviewed_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kagawad_task_history_plan_enabled(p_barangay_id) then
    raise exception 'not authorized';
  end if;
  return query select * from public.search_kagawad_due_date_request_history_before_plan_gate(
    p_barangay_id, p_page, p_page_size, p_status, p_search,
    p_created_after, p_created_before, p_reviewed_after, p_reviewed_before
  );
end;
$$;

create function public.list_kagawad_task_due_date_request_history(
  p_task_id uuid,
  p_page integer default 0,
  p_page_size integer default 5
)
returns table (
  id uuid, current_due_date date, proposed_due_date date, reason text,
  status text, decision_note text, created_at timestamptz,
  reviewed_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kagawad_task_history_plan_enabled_for_task(p_task_id) then
    raise exception 'not authorized';
  end if;
  return query select * from public.list_kagawad_task_due_date_request_history_before_plan_gate(
    p_task_id, p_page, p_page_size
  );
end;
$$;

create function public.list_kagawad_task_status_history(
  p_task_id uuid,
  p_page integer default 0,
  p_page_size integer default 10
)
returns table (
  id uuid, actor_name text, details text, created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kagawad_task_history_plan_enabled_for_task(p_task_id) then
    raise exception 'not authorized';
  end if;
  return query select * from public.list_kagawad_task_status_history_before_plan_gate(
    p_task_id, p_page, p_page_size
  );
end;
$$;

create function public.list_kagawad_action_item_notes(p_task_id uuid)
returns table (
  id uuid, note text, author_name text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_barangay_id uuid;
  v_can_manage boolean;
begin
  select task.barangay_id,
    public.has_tenant_permission(task.barangay_id, 'committee.manage')
  into v_barangay_id, v_can_manage
  from public.committee_tasks task
  where task.id = p_task_id;

  if v_barangay_id is null
    or (not coalesce(v_can_manage, false)
      and not public.kagawad_task_history_plan_enabled(v_barangay_id)) then
    raise exception 'not authorized';
  end if;

  return query select * from public.list_kagawad_action_item_notes_before_plan_gate(p_task_id);
end;
$$;

revoke all on function public.search_kagawad_task_assignment_history(uuid, integer, integer, text, text, date, date) from public, anon;
revoke all on function public.search_kagawad_completed_work_history(uuid, integer, integer, text, date, date) from public, anon;
revoke all on function public.search_kagawad_due_date_request_history(uuid, integer, integer, text, text, date, date, date, date) from public, anon;
revoke all on function public.list_kagawad_task_due_date_request_history(uuid, integer, integer) from public, anon;
revoke all on function public.list_kagawad_task_status_history(uuid, integer, integer) from public, anon;
revoke all on function public.list_kagawad_action_item_notes(uuid) from public, anon;

grant execute on function public.search_kagawad_task_assignment_history(uuid, integer, integer, text, text, date, date) to authenticated;
grant execute on function public.search_kagawad_completed_work_history(uuid, integer, integer, text, date, date) to authenticated;
grant execute on function public.search_kagawad_due_date_request_history(uuid, integer, integer, text, text, date, date, date, date) to authenticated;
grant execute on function public.list_kagawad_task_due_date_request_history(uuid, integer, integer) to authenticated;
grant execute on function public.list_kagawad_task_status_history(uuid, integer, integer) to authenticated;
grant execute on function public.list_kagawad_action_item_notes(uuid) to authenticated;
