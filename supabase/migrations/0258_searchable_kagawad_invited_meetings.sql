-- Let Kagawads find upcoming invitations and focus on the meetings that need an RSVP.
create or replace function public.search_kagawad_invited_meetings(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_response text default 'all',
  p_meeting_date_after date default null,
  p_meeting_date_before date default null
)
returns table (
  id uuid,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  attendance_status text,
  check_in_open boolean,
  invitation_response text,
  response_updated_at timestamptz,
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
  v_response text := coalesce(nullif(p_response, ''), 'all');
begin
  if v_response not in ('all', 'attending', 'unavailable', 'no_response') then
    raise exception 'invalid invitation response filter';
  end if;
  if p_meeting_date_after is not null and p_meeting_date_before is not null
    and p_meeting_date_after > p_meeting_date_before then
    raise exception 'meeting start date must be on or before meeting end date';
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
  with invited as (
    select meeting.id, meeting.title, meeting.location, meeting.starts_at, meeting.ends_at,
      attendance.status::text as attendance_status,
      (
        attendance.user_id is null
        and now() >= meeting.starts_at - interval '30 minutes'
        and now() <= coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes'
      ) as check_in_open,
      response.response as invitation_response,
      response.responded_at as response_updated_at
    from public.meeting_attendees attendee
    join public.meetings meeting
      on meeting.id = attendee.meeting_id
     and meeting.barangay_id = attendee.barangay_id
    join public.barangay_memberships membership
      on membership.user_id = attendee.user_id
     and membership.barangay_id = attendee.barangay_id
     and membership.status = 'active'
    left join public.attendance_records attendance
      on attendance.meeting_id = meeting.id
     and attendance.barangay_id = meeting.barangay_id
     and attendance.user_id = (select auth.uid())
    left join public.meeting_invitation_responses response
      on response.meeting_id = meeting.id
     and response.barangay_id = meeting.barangay_id
     and response.user_id = (select auth.uid())
    where attendee.barangay_id = p_barangay_id
      and attendee.user_id = (select auth.uid())
      and meeting.status = 'scheduled'
      and coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes' >= now()
      and (p_meeting_date_after is null or (meeting.starts_at at time zone 'Asia/Manila')::date >= p_meeting_date_after)
      and (p_meeting_date_before is null or (meeting.starts_at at time zone 'Asia/Manila')::date <= p_meeting_date_before)
      and (v_search is null or position(lower(v_search) in lower(concat_ws(' ', meeting.title, meeting.location))) > 0)
      and (
        v_response = 'all'
        or (v_response = 'no_response' and response.response is null)
        or response.response = v_response
      )
  ), counted as (
    select invited.*, count(*) over () as total_count from invited
  )
  select counted.id, counted.title, counted.location, counted.starts_at, counted.ends_at,
    counted.attendance_status, counted.check_in_open, counted.invitation_response,
    counted.response_updated_at, counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.search_kagawad_invited_meetings(uuid, integer, integer, text, text, date, date) from public, anon;
grant execute on function public.search_kagawad_invited_meetings(uuid, integer, integer, text, text, date, date) to authenticated;
