-- Erasure updates every historical request for a user, including requests
-- whose existing queue/history indexes are led by tenant or task identifiers.
create index if not exists meeting_attendance_corrections_requester_idx
  on public.meeting_attendance_correction_requests (requester_id);

create index if not exists committee_task_due_date_requests_requester_idx
  on public.committee_task_due_date_requests (requester_id);

create index if not exists resident_profile_change_requests_resident_idx
  on public.resident_profile_change_requests (resident_id);
