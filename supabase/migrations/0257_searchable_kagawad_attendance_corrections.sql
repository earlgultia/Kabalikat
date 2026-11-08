-- Let Kagawads search their own attendance correction request and decision history.
create or replace function public.search_kagawad_attendance_correction_requests(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_status text default 'all',
  p_requested_attendance text default 'all',
  p_submitted_after date default null,
  p_submitted_before date default null
)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  meeting_starts_at timestamptz,
  requested_status text,
  current_status text,
  reason text,
  status text,
  review_note text,
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
  v_search text := nullif(left(trim(coalesce(p_search, '')), 100), '');
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_requested_attendance text := coalesce(nullif(p_requested_attendance, ''), 'all');
begin
  if v_status not in ('all', 'pending', 'approved', 'rejected') then
    raise exception 'invalid correction request status filter';
  end if;
  if v_requested_attendance not in ('all', 'present', 'absent', 'excused') then
    raise exception 'invalid requested attendance filter';
  end if;
  if p_submitted_after is not null and p_submitted_before is not null
    and p_submitted_after > p_submitted_before then
    raise exception 'submitted-after date must be on or before submitted-before date';
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
  with requests as (
    select request.id, request.meeting_id, meeting.title as meeting_title,
      meeting.starts_at as meeting_starts_at, request.requested_status,
      request.previous_status as current_status, request.reason, request.status,
      request.review_note, request.created_at, request.reviewed_at
    from public.meeting_attendance_correction_requests request
    join public.meetings meeting
      on meeting.id = request.meeting_id and meeting.barangay_id = request.barangay_id
    where request.barangay_id = p_barangay_id
      and request.requester_id = (select auth.uid())
      and (v_status = 'all' or request.status = v_status)
      and (v_requested_attendance = 'all' or request.requested_status = v_requested_attendance)
      and (p_submitted_after is null or (request.created_at at time zone 'Asia/Manila')::date >= p_submitted_after)
      and (p_submitted_before is null or (request.created_at at time zone 'Asia/Manila')::date <= p_submitted_before)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', meeting.title, request.reason, request.review_note))) > 0)
  ), counted as (
    select requests.*, count(*) over () as total_count from requests
  )
  select counted.id, counted.meeting_id, counted.meeting_title, counted.meeting_starts_at,
    counted.requested_status, counted.current_status, counted.reason, counted.status,
    counted.review_note, counted.created_at, counted.reviewed_at, counted.total_count
  from counted
  order by counted.created_at desc, counted.id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_kagawad_attendance_correction_requests(uuid, integer, integer, text, text, text, date, date) from public, anon;
grant execute on function public.search_kagawad_attendance_correction_requests(uuid, integer, integer, text, text, text, date, date) to authenticated;
