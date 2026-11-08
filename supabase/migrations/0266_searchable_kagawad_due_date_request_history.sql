-- Give Kagawads one searchable, paginated view of their own due-date requests.
create index if not exists committee_task_due_date_requester_tenant_history_idx
  on public.committee_task_due_date_requests(requester_id, barangay_id, created_at desc, id desc);

create or replace function public.search_kagawad_due_date_request_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_status text default 'all',
  p_search text default null,
  p_created_after date default null,
  p_created_before date default null
)
returns table (
  id uuid,
  task_id uuid,
  task_title text,
  committee_name text,
  current_due_date date,
  proposed_due_date date,
  reason text,
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
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_status text := coalesce(nullif(trim(p_status), ''), 'all');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
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
  if v_status not in ('all', 'pending', 'approved', 'declined', 'withdrawn') then
    raise exception 'invalid request status';
  end if;
  if p_created_after is not null and p_created_before is not null
    and p_created_after > p_created_before then
    raise exception 'submission start date must be on or before end date';
  end if;

  return query
  with requests as (
    select request.id, task.id as task_id, task.title as task_title,
      committee.name as committee_name, request.current_due_date, request.proposed_due_date,
      request.reason, request.status, request.decision_note,
      case when request.status = 'withdrawn' then 'You'
        else coalesce(nullif(reviewer.display_name, ''), 'Committee member') end::text as reviewer_name,
      request.created_at, request.reviewed_at
    from public.committee_task_due_date_requests request
    join public.committee_tasks task
      on task.id = request.task_id and task.barangay_id = request.barangay_id
    join public.committees committee
      on committee.id = request.committee_id and committee.barangay_id = request.barangay_id
    left join public.profiles reviewer on reviewer.id = request.reviewed_by
    where request.barangay_id = p_barangay_id
      and request.requester_id = (select auth.uid())
      and (v_status = 'all' or request.status = v_status)
      and (v_search is null or task.title ilike '%' || v_search || '%'
        or committee.name ilike '%' || v_search || '%'
        or request.reason ilike '%' || v_search || '%'
        or request.decision_note ilike '%' || v_search || '%'
        or reviewer.display_name ilike '%' || v_search || '%')
      and (p_created_after is null or request.created_at >= p_created_after::timestamptz)
      and (p_created_before is null or request.created_at < (p_created_before + 1)::timestamptz)
  ), counted as (
    select requests.*, count(*) over () as total_count from requests
  )
  select counted.id, counted.task_id, counted.task_title, counted.committee_name,
    counted.current_due_date, counted.proposed_due_date, counted.reason, counted.status,
    counted.decision_note, counted.reviewer_name, counted.created_at, counted.reviewed_at,
    counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_kagawad_due_date_request_history(uuid, integer, integer, text, text, date, date) from public, anon;
grant execute on function public.search_kagawad_due_date_request_history(uuid, integer, integer, text, text, date, date) to authenticated;
