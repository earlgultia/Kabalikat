-- Support stable tenant-scoped meeting list paging.
create index if not exists meetings_tenant_date_page_idx
  on public.meetings(barangay_id, starts_at desc, id desc);
