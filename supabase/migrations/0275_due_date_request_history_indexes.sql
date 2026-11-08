-- Keep review-history filters responsive as due-date request records grow.
create index if not exists committee_task_due_date_manager_history_idx
  on public.committee_task_due_date_requests(barangay_id, created_at desc, id desc)
  where status in ('approved', 'declined', 'withdrawn');

create index if not exists committee_task_due_date_requester_reviewed_history_idx
  on public.committee_task_due_date_requests(
    requester_id, barangay_id, reviewed_at, created_at desc, id desc
  )
  where reviewed_at is not null;
