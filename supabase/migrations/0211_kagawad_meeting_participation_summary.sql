-- Show Kagawads the scheduled meetings they are invited to and can check into.
create or replace function public.get_kagawad_meeting_participation_summary(p_barangay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_upcoming bigint;
  v_check_in_available bigint;
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

  select
    count(*) filter (
      where meeting.starts_at > now()
        and not exists (
          select 1 from public.attendance_records attendance
          where attendance.meeting_id = meeting.id
            and attendance.user_id = (select auth.uid())
        )
    ),
    count(*) filter (
      where now() >= meeting.starts_at - interval '30 minutes'
        and now() <= coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes'
        and not exists (
          select 1 from public.attendance_records attendance
          where attendance.meeting_id = meeting.id
            and attendance.user_id = (select auth.uid())
        )
    )
  into v_upcoming, v_check_in_available
  from public.meeting_attendees attendee
  join public.meetings meeting
    on meeting.id = attendee.meeting_id
   and meeting.barangay_id = attendee.barangay_id
  where attendee.barangay_id = p_barangay_id
    and attendee.user_id = (select auth.uid())
    and meeting.status = 'scheduled'
    and coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes' >= now();

  return jsonb_build_object(
    'upcoming_meetings', v_upcoming,
    'check_in_available', v_check_in_available,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_kagawad_meeting_participation_summary(uuid) from public, anon;
grant execute on function public.get_kagawad_meeting_participation_summary(uuid) to authenticated;
