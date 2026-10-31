-- Keep the authorized meeting status history quick to page by tenant and meeting.
create index if not exists meeting_events_tenant_meeting_history_idx
  on public.meeting_events(barangay_id, meeting_id, created_at desc, id desc);
