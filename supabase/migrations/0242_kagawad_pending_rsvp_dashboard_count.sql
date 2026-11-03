-- Surface upcoming invitations that still need a Kagawad's response.
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
  v_rsvp_needed bigint;
  v_present bigint;
  v_absent bigint;
  v_excused bigint;
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
        and attendance.id is null
    ),
    count(*) filter (
      where now() >= meeting.starts_at - interval '30 minutes'
        and now() <= coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes'
        and attendance.id is null
    ),
    count(*) filter (
      where meeting.starts_at > now()
        and attendance.id is null
        and response.response is null
    )
  into v_upcoming, v_check_in_available, v_rsvp_needed
  from public.meeting_attendees attendee
  join public.meetings meeting
    on meeting.id = attendee.meeting_id
   and meeting.barangay_id = attendee.barangay_id
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
    and coalesce(meeting.ends_at, meeting.starts_at + interval '4 hours') + interval '30 minutes' >= now();

  select
    count(*) filter (where attendance.status = 'present'),
    count(*) filter (where attendance.status = 'absent'),
    count(*) filter (where attendance.status = 'excused')
  into v_present, v_absent, v_excused
  from public.meeting_attendees attendee
  join public.meetings meeting
    on meeting.id = attendee.meeting_id
   and meeting.barangay_id = attendee.barangay_id
  join public.attendance_records attendance
    on attendance.meeting_id = meeting.id
   and attendance.barangay_id = meeting.barangay_id
   and attendance.user_id = attendee.user_id
  where attendee.barangay_id = p_barangay_id
    and attendee.user_id = (select auth.uid());

  return jsonb_build_object(
    'upcoming_meetings', v_upcoming,
    'check_in_available', v_check_in_available,
    'rsvp_needed', v_rsvp_needed,
    'present_meetings', v_present,
    'absent_meetings', v_absent,
    'excused_meetings', v_excused,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_kagawad_meeting_participation_summary(uuid) from public, anon;
grant execute on function public.get_kagawad_meeting_participation_summary(uuid) to authenticated;
