-- Add review-date filters to the manager due-date request history.
drop function if exists public.list_committee_task_due_date_request_history(uuid, integer, integer, text, text, date, date);

create function public.list_committee_task_due_date_request_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 20,
  p_status text default 'all',
  p_search text default null,
  p_created_after date default null,
  p_created_before date default null,
  p_reviewed_after date default null,
  p_reviewed_before date default null
)
returns table (
  id uuid,
  task_id uuid,
  task_title text,
  committee_name text,
  current_due_date date,
  proposed_due_date date,
  reason text,
  requester_name text,
  status text,
  decision_note text,
  reviewer_name text,
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
  v_page integer := least(greatest(coalesce(p_page, 0), 0), 10000000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_status text := coalesce(nullif(trim(p_status), ''), 'all');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.has_tenant_permission(p_barangay_id, 'committee.manage') then
    raise exception 'not authorized';
  end if;
  if v_status not in ('all', 'approved', 'declined', 'withdrawn') then
    raise exception 'invalid review status';
  end if;
  if p_created_after is not null and p_created_before is not null
    and p_created_after > p_created_before then
    raise exception 'submission start date must be on or before end date';
  end if;
  if p_reviewed_after is not null and p_reviewed_before is not null
    and p_reviewed_after > p_reviewed_before then
    raise exception 'review start date must be on or before end date';
  end if;

  return query
  with reviewed as (
    select request.id, task.id as task_id, task.title as task_title,
      committee.name as committee_name, request.current_due_date, request.proposed_due_date,
      request.reason,
      coalesce(nullif(requester.display_name, ''), 'Kagawad')::text as requester_name,
      request.status, request.decision_note,
      coalesce(nullif(reviewer.display_name, ''), 'Committee member')::text as reviewer_name,
      request.created_at, request.reviewed_at
    from public.committee_task_due_date_requests request
    join public.committee_tasks task on task.id = request.task_id and task.barangay_id = request.barangay_id
    join public.committees committee on committee.id = request.committee_id and committee.barangay_id = request.barangay_id
    left join public.profiles requester on requester.id = request.requester_id
    left join public.profiles reviewer on reviewer.id = request.reviewed_by
    where request.barangay_id = p_barangay_id
      and request.status in ('approved', 'declined', 'withdrawn')
      and (v_status = 'all' or request.status = v_status)
      and (v_search is null or task.title ilike '%' || v_search || '%'
        or committee.name ilike '%' || v_search || '%'
        or requester.display_name ilike '%' || v_search || '%'
        or reviewer.display_name ilike '%' || v_search || '%'
        or request.reason ilike '%' || v_search || '%'
        or request.decision_note ilike '%' || v_search || '%')
      and (p_created_after is null or request.created_at >= p_created_after::timestamptz)
      and (p_created_before is null or request.created_at < (p_created_before + 1)::timestamptz)
      and (p_reviewed_after is null or request.reviewed_at >= p_reviewed_after::timestamptz)
      and (p_reviewed_before is null or request.reviewed_at < (p_reviewed_before + 1)::timestamptz)
  ), counted as (
    select reviewed.*, count(*) over () as total_count from reviewed
  )
  select counted.id, counted.task_id, counted.task_title, counted.committee_name,
    counted.current_due_date, counted.proposed_due_date, counted.reason,
    counted.requester_name, counted.status, counted.decision_note, counted.reviewer_name,
    counted.created_at, counted.reviewed_at, counted.total_count
  from counted
  order by counted.reviewed_at desc, counted.id desc
  offset v_page::bigint * v_page_size limit v_page_size;
end;
$$;

revoke all on function public.list_committee_task_due_date_request_history(uuid, integer, integer, text, text, date, date, date, date) from public, anon;
grant execute on function public.list_committee_task_due_date_request_history(uuid, integer, integer, text, text, date, date, date, date) to authenticated;
