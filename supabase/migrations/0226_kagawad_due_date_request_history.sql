-- Give an assigned Kagawad a paginated history of their own due-date requests
-- and the manager decisions attached to them.
create or replace function public.list_kagawad_task_due_date_request_history(
  p_task_id uuid,
  p_page integer default 0,
  p_page_size integer default 5
)
returns table (
  id uuid,
  current_due_date date,
  proposed_due_date date,
  reason text,
  status text,
  decision_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 5), 1), 25);
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
      and committee.status = 'active'
      and role.key = 'kagawad'
      and (
        task.assigned_to = (select auth.uid())
        or exists (
          select 1
          from public.committee_task_due_date_requests own_request
          where own_request.task_id = task.id
            and own_request.requester_id = (select auth.uid())
        )
      )
  ) then
    raise exception 'not authorized';
  end if;

  return query
  with request_history as (
    select request.id, request.current_due_date, request.proposed_due_date,
      request.reason, request.status, request.decision_note,
      request.created_at, request.reviewed_at
    from public.committee_task_due_date_requests request
    where request.task_id = p_task_id
      and request.requester_id = (select auth.uid())
  ), counted as (
    select request_history.*, count(*) over () as total_count
    from request_history
  )
  select counted.id, counted.current_due_date, counted.proposed_due_date,
    counted.reason, counted.status, counted.decision_note,
    counted.created_at, counted.reviewed_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_kagawad_task_due_date_request_history(uuid, integer, integer) from public, anon;
grant execute on function public.list_kagawad_task_due_date_request_history(uuid, integer, integer) to authenticated;
