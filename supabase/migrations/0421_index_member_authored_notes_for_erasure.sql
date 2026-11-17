-- Account erasure finds each member's retained text by these author/requester
-- columns. Keep cleanup proportional to that member's history as data grows.
create index if not exists project_update_responses_author_idx
  on public.barangay_project_update_responses (author_id);

create index if not exists committee_task_progress_notes_author_idx
  on public.committee_task_progress_notes (author_id);

create index if not exists committee_task_due_date_requests_requester_idx
  on public.committee_task_due_date_requests (requester_id);
