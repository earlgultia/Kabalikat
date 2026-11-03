-- Keep in-progress minutes and unapproved resolutions visible only to meeting
-- managers; ordinary meeting readers and attendees see finalized records.
drop policy if exists meeting_minutes_read on public.meeting_minutes;
create policy meeting_minutes_read on public.meeting_minutes
  for select to authenticated
  using (
    public.has_tenant_permission(barangay_id, 'meeting.manage')
    or (
      status = 'reviewed'
      and (
        public.has_tenant_permission(barangay_id, 'meeting.read')
        or public.is_meeting_attendee(meeting_id)
      )
    )
  );

drop policy if exists meeting_resolutions_read on public.meeting_resolutions;
create policy meeting_resolutions_read on public.meeting_resolutions
  for select to authenticated
  using (
    public.has_tenant_permission(barangay_id, 'meeting.manage')
    or (
      status = 'approved'
      and (
        public.has_tenant_permission(barangay_id, 'meeting.read')
        or public.is_meeting_attendee(meeting_id)
      )
    )
  );
