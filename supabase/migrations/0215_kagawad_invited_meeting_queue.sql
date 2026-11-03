-- Give Kagawads a private, actionable list of their own meeting invitations.
create or replace function public.list_kagawad_invited_meetings(
  p_barangay_id uuid,
  p_page integer default 0,
  p_page_size integer default 10
)
returns table (
  id uuid,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  attendance_status text,
  check_in_open boolean,
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

  return query
  with invited as (
    select meeting.id, meeting.title, meeting.location, meeting.starts_at, meeting.ends_at,
      attendance.status as attendance_status,
      (
        attendance.user_id is null
        and now() >= meeting.starts_at - interval '30 minutes'
        and now() <= coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes'
      ) as check_in_open
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
     and attendance.user_id = (select auth.uid())
    where attendee.barangay_id = p_barangay_id
      and attendee.user_id = (select auth.uid())
      and meeting.status = 'scheduled'
      and coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes' >= now()
  ), counted as (
    select invited.*, count(*) over () as total_count
    from invited
  )
  select counted.id, counted.title, counted.location, counted.starts_at, counted.ends_at,
    counted.attendance_status, counted.check_in_open, counted.total_count
  from counted
  order by counted.starts_at, counted.id
  offset v_page::bigint * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.list_kagawad_invited_meetings(uuid, integer, integer) from public, anon;
grant execute on function public.list_kagawad_invited_meetings(uuid, integer, integer) to authenticated;
