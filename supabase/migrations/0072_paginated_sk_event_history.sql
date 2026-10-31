-- Support stable paging of a single SK event's audit history.
create index if not exists sk_event_events_tenant_event_created_page_idx
  on public.sk_event_events(barangay_id, event_id, created_at desc, id desc);
