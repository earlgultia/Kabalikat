-- Support stable tenant-scoped SK event paging by scheduled start time.
create index if not exists sk_events_tenant_start_page_idx
  on public.sk_events(barangay_id, starts_at, id);
