-- Support stable created-at paging for published advisories and manager drafts.
create index if not exists disaster_advisories_tenant_created_page_idx
  on public.disaster_advisories(barangay_id, created_at desc, id desc);
