-- Support stable tenant-scoped invitation history paging.
create index if not exists invitations_tenant_created_page_idx
  on public.invitations(barangay_id, created_at desc, id desc);
