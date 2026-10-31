-- Support stable per-advisory audit history paging without loading every event.
create index if not exists disaster_advisory_events_history_page_idx
  on public.disaster_advisory_events(barangay_id, advisory_id, created_at, id);
