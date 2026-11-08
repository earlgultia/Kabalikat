-- Let each Kagawad find their own previous meeting attendance records.
create or replace function public.search_kagawad_meeting_attendance_history(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_attendance_status text default 'all',
  p_meeting_date_after date default null,
  p_meeting_date_before date default null
)
returns table (
  meeting_id uuid,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  meeting_status text,
  attendance_status text,
  attendance_recorded_at timestamptz,
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
  v_attendance_status text := coalesce(nullif(p_attendance_status, ''), 'all');
begin
  if v_attendance_status not in ('all', 'present', 'absent', 'excused', 'unrecorded') then
    raise exception 'invalid attendance status filter';
  end if;
  if p_meeting_date_after is not null and p_meeting_date_before is not null
    and p_meeting_date_after > p_meeting_date_before then
    raise exception 'meeting-date-after must be on or before meeting-date-before';
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
    select meeting.id as meeting_id, meeting.title, meeting.location,
      meeting.starts_at, meeting.ends_at, meeting.status::text as meeting_status,
      attendance.status::text as attendance_status,
      attendance.recorded_at as attendance_recorded_at
    from public.meeting_attendees attendee
    join public.meetings meeting
      on meeting.id = attendee.meeting_id
     and meeting.barangay_id = attendee.barangay_id
    left join public.attendance_records attendance
      on attendance.meeting_id = meeting.id
     and attendance.barangay_id = meeting.barangay_id
     and attendance.user_id = (select auth.uid())
    where attendee.barangay_id = p_barangay_id
      and attendee.user_id = (select auth.uid())
      and (meeting.starts_at <= now() or meeting.status in ('completed', 'cancelled'))
      and (p_meeting_date_after is null or (meeting.starts_at at time zone 'Asia/Manila')::date >= p_meeting_date_after)
      and (p_meeting_date_before is null or (meeting.starts_at at time zone 'Asia/Manila')::date <= p_meeting_date_before)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', meeting.title, meeting.location))) > 0)
      and (
        v_attendance_status = 'all'
        or (v_attendance_status = 'unrecorded' and attendance.status is null)
        or attendance.status::text = v_attendance_status
      )
  ), counted as (
    select history.*, count(*) over () as total_count from history
  )
  select counted.meeting_id, counted.title, counted.location, counted.starts_at,
    counted.ends_at, counted.meeting_status, counted.attendance_status,
    counted.attendance_recorded_at, counted.total_count
  from counted
  order by counted.starts_at desc, counted.meeting_id desc
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_kagawad_meeting_attendance_history(uuid, integer, integer, text, text, date, date) from public, anon;
grant execute on function public.search_kagawad_meeting_attendance_history(uuid, integer, integer, text, text, date, date) to authenticated;
