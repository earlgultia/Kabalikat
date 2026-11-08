-- Let an authorized committee manager open the pending request for a specific
-- task notification without changing the existing searchable queue behavior.
drop function if exists public.list_committee_task_due_date_requests(uuid, integer, integer, text, date, date);

create function public.list_committee_task_due_date_requests(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_created_after date default null,
  p_created_before date default null,
  p_task_id uuid default null
)
returns table (
  id uuid, task_id uuid, task_title text, committee_name text,
  current_due_date date, proposed_due_date date, reason text,
  requester_name text, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.has_tenant_permission(p_barangay_id, 'committee.manage') then
    raise exception 'not authorized';
  end if;
  if p_created_after is not null and p_created_before is not null
    and p_created_after > p_created_before then
    raise exception 'start date must be on or before end date';
  end if;

  return query
  with requests as (
    select request.id, task.id as task_id, task.title as task_title,
      committee.name as committee_name, request.current_due_date, request.proposed_due_date,
      request.reason, coalesce(nullif(profile.display_name, ''), 'Kagawad')::text as requester_name,
      request.created_at
    from public.committee_task_due_date_requests request
    join public.committee_tasks task on task.id = request.task_id and task.barangay_id = request.barangay_id
    join public.committees committee on committee.id = request.committee_id and committee.barangay_id = request.barangay_id
    left join public.profiles profile on profile.id = request.requester_id
    where request.barangay_id = p_barangay_id
      and request.status = 'pending'
      and committee.status = 'active'
      and (p_task_id is null or request.task_id = p_task_id)
      and (v_search is null or task.title ilike '%' || v_search || '%'
        or committee.name ilike '%' || v_search || '%'
        or profile.display_name ilike '%' || v_search || '%'
        or request.reason ilike '%' || v_search || '%')
      and (p_created_after is null or request.created_at >= p_created_after::timestamptz)
      and (p_created_before is null or request.created_at < (p_created_before + 1)::timestamptz)
  ), counted as (
    select requests.*, count(*) over () as total_count from requests
  )
  select counted.id, counted.task_id, counted.task_title, counted.committee_name,
    counted.current_due_date, counted.proposed_due_date, counted.reason,
    counted.requester_name, counted.created_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_committee_task_due_date_requests(uuid, integer, integer, text, date, date, uuid) from public, anon;
grant execute on function public.list_committee_task_due_date_requests(uuid, integer, integer, text, date, date, uuid) to authenticated;

-- Notification resource ids are request ids; resolve them to a task only for
-- a manager who can review that still-pending request.
create or replace function public.get_committee_due_date_request_task_id(p_request_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_task_id uuid;
begin
  select request.task_id into v_task_id
  from public.committee_task_due_date_requests request
  join public.committees committee
    on committee.id = request.committee_id
   and committee.barangay_id = request.barangay_id
  where request.id = p_request_id
    and request.status = 'pending'
    and committee.status = 'active'
    and public.has_tenant_permission(request.barangay_id, 'committee.manage');

  return v_task_id;
end;
$$;

revoke all on function public.get_committee_due_date_request_task_id(uuid) from public, anon;
grant execute on function public.get_committee_due_date_request_task_id(uuid) to authenticated;
