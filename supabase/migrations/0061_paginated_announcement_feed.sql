-- Support stable created-at paging for published posts and authorized drafts.
create index if not exists announcements_tenant_created_page_idx
  on public.announcements(barangay_id, created_at desc, id desc);
