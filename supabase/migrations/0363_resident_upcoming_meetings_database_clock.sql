-- Keep resident dashboard meeting previews on the database clock and scoped
-- to meetings the signed-in resident was invited to attend.
create or replace function public.list_resident_upcoming_meetings(
  p_barangay_id uuid
) returns table (
  id uuid,
  title text,
  location text,
  starts_at timestamptz
) language sql stable security invoker set search_path = '' as $$
  select meeting.id, meeting.title, meeting.location, meeting.starts_at
  from public.meetings meeting
  join public.meeting_attendees attendee
    on attendee.meeting_id = meeting.id
   and attendee.barangay_id = meeting.barangay_id
  where meeting.barangay_id = p_barangay_id
    and attendee.user_id = (select auth.uid())
    and meeting.status = 'scheduled'
    and meeting.starts_at >= now()
  order by meeting.starts_at, meeting.id
  limit 3;
$$;

revoke all on function public.list_resident_upcoming_meetings(uuid) from public, anon;
grant execute on function public.list_resident_upcoming_meetings(uuid) to authenticated;
