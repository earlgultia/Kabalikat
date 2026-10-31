-- Support stable, bounded resident correction history and staff review queue paging.
create index if not exists resident_profile_change_requests_tenant_page_idx
  on public.resident_profile_change_requests(barangay_id, created_at desc, id desc);

create index if not exists resident_profile_change_requests_queue_page_idx
  on public.resident_profile_change_requests(barangay_id, status, created_at desc, id desc);
